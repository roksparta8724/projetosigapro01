import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const NAVIGATION_STATE_KEY = "sigapro.navigation.state.v1";
let pendingRefreshScrollY: number | null = null;
let pendingRefreshLocation = "";
let scrollPersistRaf = 0;

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

function restoreRefreshScroll() {
  const target =
    pendingRefreshScrollY !== null &&
    pendingRefreshLocation === currentLocationKey()
      ? pendingRefreshScrollY
      : null;

  if (target === null) {
    document.documentElement.removeAttribute("data-sigapro-booting");
    return;
  }

  let attempts = 0;
  const restore = () => {
    attempts += 1;
    const maxScroll = Math.max(
      0,
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) -
        window.innerHeight,
    );
    const next = Math.min(target, maxScroll);
    window.scrollTo({ top: next, left: 0, behavior: "auto" });

    if (Math.abs(window.scrollY - next) <= 2 || attempts >= 60) {
      pendingRefreshScrollY = null;
      pendingRefreshLocation = "";
      document.documentElement.removeAttribute("data-sigapro-booting");
      persistNavigationState();
      return;
    }
    window.requestAnimationFrame(restore);
  };

  window.requestAnimationFrame(restore);
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
    });
  },
  { passive: true },
);

window.addEventListener("beforeunload", persistNavigationState, { capture: true });
window.addEventListener("pagehide", persistNavigationState, { capture: true });
window.addEventListener("sigapro-app-stable", restoreRefreshScroll);

createRoot(document.getElementById("root")!).render(<App />);

window.setTimeout(() => {
  restoreRefreshScroll();
  document.documentElement.removeAttribute("data-sigapro-booting");
}, 350);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
