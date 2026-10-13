import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const NAVIGATION_STATE_KEY = "sigapro.navigation.state.v1";
const VISUAL_SNAPSHOT_KEY = "sigapro.visual.snapshot.v4";
const PLATFORM_SESSION_CACHE_KEY = "sigapro.platform.session.v1";

function currentSnapshotIdentity(): string {
  try {
    const raw = window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY);
    const session = raw ? JSON.parse(raw) as { id?: string; accountStatus?: string } : null;
    return session?.id && session.accountStatus !== "blocked" && session.accountStatus !== "inactive"
      ? String(session.id)
      : "";
  } catch {
    return "";
  }
}
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

function persistVisualSnapshot() {
  if (!appStable || !isInternalPath(window.location.pathname)) return;
  const userId = currentSnapshotIdentity();
  if (!userId) return;
  const root = document.getElementById("root");
  if (!root || root.innerHTML.length < 500) return;

  try {
    window.sessionStorage.setItem(
      VISUAL_SNAPSHOT_KEY,
      JSON.stringify({
        host: window.location.host,
        path: currentLocationKey(),
        userId,
        html: root.innerHTML,
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
  let previousGeometry = "";
  const restoreStartedAt = performance.now();
  const maxRestoreMs = 10000;

  const rectSignature = (el: Element | null) => {
    if (!(el instanceof HTMLElement)) return "missing";
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height]
      .map((value) => Math.round(value * 10) / 10)
      .join(",");
  };

  const readGeometry = () => {
    const root = document.getElementById("root");
    if (!root) return "missing";

    const anchors = [
      root.querySelector(".sig-app-frame"),
      root.querySelector(".sig-premium-topbar"),
      root.querySelector(".sig-sidebar-shell"),
      root.querySelector(".sig-main-shell"),
      root.querySelector(".sig-page-shell"),
    ];

    const visibleBlocks = Array.from(
      root.querySelectorAll(
        ".sig-section-card,.sig-stat-card,.sig-metric-card,[data-ui=card],main,header,footer",
      ),
    ).slice(0, 80);

    return [
      ...anchors.map(rectSignature),
      ...visibleBlocks.map(rectSignature),
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ].join("|");
  };

  const imagesReady = () => {
    const root = document.getElementById("root");
    if (!root) return false;
    return Array.from(root.querySelectorAll("img")).every(
      (img) => img.complete && (img.naturalWidth > 0 || !img.getAttribute("src")),
    );
  };

  const finish = () => {
    overlay.removeAttribute("data-visible");
    overlay.replaceChildren();
    document.documentElement.removeAttribute("data-sigapro-booting");
    pendingRefreshScrollY = null;
    pendingRefreshLocation = "";
    persistNavigationState();
    persistVisualSnapshot();
  };

  const waitForStableFrame = () => {
    const maxScroll = Math.max(
      0,
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) -
        window.innerHeight,
    );
    const next = Math.min(Math.max(0, target), maxScroll);
    window.scrollTo({ top: next, left: 0, behavior: "auto" });

    const geometry = readGeometry();
    const scrollReady = Math.abs(window.scrollY - next) <= 2;
    const geometryReady =
      geometry !== "missing" &&
      !geometry.includes("missing") &&
      geometry === previousGeometry;
    const ready = scrollReady && geometryReady && imagesReady();

    stableFrames = ready ? stableFrames + 1 : 0;
    previousGeometry = geometry;

    // Não prender o usuário em uma sobreposição congelada quando uma fonte,
    // imagem ou integração nunca estabiliza. A interface real sempre assume o controle.
    if (stableFrames >= 5 || performance.now() - restoreStartedAt > maxRestoreMs) {
      finish();
      return;
    }

    window.requestAnimationFrame(waitForStableFrame);
  };

  const start = async () => {
    try {
      if ("fonts" in document && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {}
    window.requestAnimationFrame(waitForStableFrame);
  };

  void start();
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
    persistVisualSnapshot();
    persistSnapshotScroll();
  },
  { capture: true },
);

window.addEventListener(
  "pagehide",
  () => {
    persistNavigationState();
    persistVisualSnapshot();
    persistSnapshotScroll();
  },
  { capture: true },
);

window.addEventListener("sigapro-platform-session-updated", () => {
  try {
    const raw = window.sessionStorage.getItem(VISUAL_SNAPSHOT_KEY);
    const snapshot = raw ? JSON.parse(raw) : null;
    if (snapshot && snapshot.userId !== currentSnapshotIdentity()) {
      window.sessionStorage.removeItem(VISUAL_SNAPSHOT_KEY);
      window.sessionStorage.removeItem(NAVIGATION_STATE_KEY);
      const overlay = document.getElementById("sigapro-refresh-snapshot");
      overlay?.removeAttribute("data-visible");
      overlay?.replaceChildren();
      document.documentElement.removeAttribute("data-sigapro-booting");
    }
  } catch {
    window.sessionStorage.removeItem(VISUAL_SNAPSHOT_KEY);
  }
});

window.addEventListener("sigapro-app-stable", () => {
  appStable = true;
  persistVisualSnapshot();
  releaseRefreshSnapshot();
});

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
