import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const NAVIGATION_STATE_KEY = "sigapro.navigation.state.v1";
const VISUAL_SNAPSHOT_KEY = "sigapro.visual.snapshot.v3";
let pendingRefreshScrollY: number | null = null;
let pendingRefreshLocation = "";
let scrollPersistRaf = 0;
let appStable = false;

function currentLocationKey() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isInternalPath(pathname: string) {
  const publicPaths = ["/", "/inicio", "/apresentacao", "/planos-publicos"];
  const authPaths = ["/acesso", "/criar-conta", "/recuperar-senha"];
  return (
    !publicPaths.includes(pathname) &&
    !authPaths.includes(pathname) &&
    !pathname.startsWith("/cliente/")
  );
}

function persistNavigationState() {
  if (!isInternalPath(window.location.pathname)) return;
  try {
    window.sessionStorage.setItem(
      NAVIGATION_STATE_KEY,
      JSON.stringify({
        host: window.location.host,
        location: currentLocationKey(),
        scrollY: window.scrollY || 0,
        savedAt: Date.now(),
      }),
    );
  } catch {}
}

function collectLoadedCssText() {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? []);
      if (rules.length) chunks.push(rules.map((rule) => rule.cssText).join("\n"));
    } catch {}
  }
  return chunks.join("\n");
}

function persistVisualSnapshot() {
  if (!appStable || !isInternalPath(window.location.pathname)) return;
  const root = document.getElementById("root");
  if (!root || root.innerHTML.length < 500) return;

  try {
    window.sessionStorage.setItem(
      VISUAL_SNAPSHOT_KEY,
      JSON.stringify({
        host: window.location.host,
        path: currentLocationKey(),
        html: root.innerHTML,
        cssText: collectLoadedCssText(),
        scrollY: window.scrollY || 0,
        savedAt: Date.now(),
      }),
    );
  } catch {}
}

function persistSnapshotScroll() {
  if (!isInternalPath(window.location.pathname)) return;
  try {
    const raw = window.sessionStorage.getItem(VISUAL_SNAPSHOT_KEY);
    if (!raw) return;
    const snapshot = JSON.parse(raw);
    if (
      snapshot?.host !== window.location.host ||
      snapshot?.path !== currentLocationKey()
    ) return;
    snapshot.scrollY = window.scrollY || 0;
    snapshot.savedAt = Date.now();
    window.sessionStorage.setItem(VISUAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {}
}

function primeNavigationState() {
  if (!isInternalPath(window.location.pathname)) return;
  try {
    const raw = window.sessionStorage.getItem(NAVIGATION_STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as {
      host?: string;
      location?: string;
      scrollY?: number;
      savedAt?: number;
    };
    if (
      state.host === window.location.host &&
      state.location === currentLocationKey() &&
      typeof state.scrollY === "number" &&
      typeof state.savedAt === "number" &&
      Date.now() - state.savedAt < 1000 * 60 * 30
    ) {
      pendingRefreshScrollY = Math.max(0, state.scrollY);
      pendingRefreshLocation = state.location;
    }
  } catch {}
}

function releaseRefreshSnapshot() {
  const overlay = document.getElementById("sigapro-refresh-snapshot");
  if (!overlay || overlay.getAttribute("data-visible") !== "true") {
    document.documentElement.removeAttribute("data-sigapro-booting");
    return;
  }

  const target =
    pendingRefreshScrollY !== null &&
    pendingRefreshLocation === currentLocationKey()
      ? pendingRefreshScrollY
      : Number(overlay.getAttribute("data-scroll-y") || "0");

  let stableFrames = 0;
  let attempts = 0;
  let previous = "";

  const geometry = () => {
    const root = document.getElementById("root");
    if (!root) return "";
    const frame = root.querySelector(".sig-app-frame") as HTMLElement | null;
    const main = root.querySelector(".sig-main-shell") as HTMLElement | null;
    const topbar = root.querySelector(".sig-premium-topbar") as HTMLElement | null;
    const sidebar = root.querySelector(".sig-sidebar-shell") as HTMLElement | null;
    const rect = (el: HTMLElement | null) => {
      if (!el) return "missing";
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(",");
    };
    return [rect(frame), rect(main), rect(topbar), rect(sidebar), document.documentElement.scrollWidth].join("|");
  };

  const finish = () => {
    overlay.removeAttribute("data-visible");
    overlay.replaceChildren();
    document.getElementById("sigapro-refresh-snapshot-css")?.remove();
    document.documentElement.removeAttribute("data-sigapro-booting");
    pendingRefreshScrollY = null;
    pendingRefreshLocation = "";
    persistNavigationState();
    persistVisualSnapshot();
  };

  const wait = () => {
    attempts += 1;
    const maxScroll = Math.max(
      0,
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) -
        window.innerHeight,
    );
    const next = Math.min(Math.max(0, target), maxScroll);
    window.scrollTo({ top: next, left: 0, behavior: "auto" });

    const current = geometry();
    const isStable =
      current &&
      current === previous &&
      !current.includes("missing") &&
      Math.abs(window.scrollY - next) <= 2;

    stableFrames = isStable ? stableFrames + 1 : 0;
    previous = current;

    if (stableFrames >= 4 || attempts >= 120) {
      finish();
      return;
    }
    window.requestAnimationFrame(wait);
  };

  window.requestAnimationFrame(wait);
}

window.history.scrollRestoration = "manual";
primeNavigationState();

window.addEventListener(
  "scroll",
  () => {
    if (scrollPersistRaf) return;
    scrollPersistRaf = window.requestAnimationFrame(() => {
      scrollPersistRaf = 0;
      persistNavigationState();
      persistSnapshotScroll();
    });
  },
  { passive: true },
);

window.addEventListener(
  "beforeunload",
  () => {
    persistNavigationState();
    persistSnapshotScroll();
  },
  { capture: true },
);

window.addEventListener(
  "pagehide",
  () => {
    persistNavigationState();
    persistSnapshotScroll();
  },
  { capture: true },
);

window.addEventListener("sigapro-app-stable", () => {
  appStable = true;
  persistVisualSnapshot();
  releaseRefreshSnapshot();
});

createRoot(document.getElementById("root")!).render(<App />);

window.setTimeout(() => {
  if (!appStable) {
    appStable = true;
    persistVisualSnapshot();
  }
  releaseRefreshSnapshot();
}, 5000);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
