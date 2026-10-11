import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const VISUAL_SNAPSHOT_KEY = "sigapro.visual.snapshot.v1";
const NAVIGATION_STATE_KEY = "sigapro.navigation.state.v1";
let pendingRefreshScrollY: number | null = null;
let pendingRefreshLocation = "";
let scrollPersistRaf = 0;

function currentLocationKey() {
  return currentLocationKey();
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
  } catch {
    // Persistência de navegação nunca pode bloquear a aplicação.
  }
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
  } catch {
    // Estado inválido é simplesmente ignorado.
  }
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

function collectLoadedCssText() {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? []);
      if (rules.length > 0) {
        chunks.push(rules.map((rule) => rule.cssText).join("\n"));
      }
    } catch {
      // Folhas externas bloqueadas por CORS são ignoradas; os estilos do app são same-origin.
    }
  }
  return chunks.join("\n");
}

function persistVisualSnapshot() {
  if (!isInternalPath(window.location.pathname)) return;
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
        viewportWidth: document.documentElement.clientWidth || window.innerWidth,
        viewportHeight: window.innerHeight,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Falha de storage nunca pode afetar a navegação.
  }
}

function restoreFrozenSnapshot() {
  if (!isInternalPath(window.location.pathname)) return;

  try {
    const raw = window.sessionStorage.getItem(VISUAL_SNAPSHOT_KEY);
    if (!raw) return;

    const snapshot = JSON.parse(raw) as {
      host?: string;
      path?: string;
      html?: string;
      cssText?: string;
      scrollY?: number;
      viewportWidth?: number;
      viewportHeight?: number;
      savedAt?: number;
    };

    const currentLocation = currentLocationKey();
    const valid =
      snapshot.host === window.location.host &&
      snapshot.path === currentLocation &&
      typeof snapshot.html === "string" &&
      snapshot.html.length > 500 &&
      typeof snapshot.savedAt === "number" &&
      Date.now() - snapshot.savedAt < 120000;

    if (!valid) return;

    const host = document.getElementById("sigapro-refresh-snapshot");
    if (!host) return;

    if (typeof snapshot.cssText === "string" && snapshot.cssText.length > 0) {
      const cachedStyle = document.createElement("style");
      cachedStyle.id = "sigapro-refresh-snapshot-css";
      cachedStyle.textContent = snapshot.cssText;
      document.head.appendChild(cachedStyle);
    }

    host.innerHTML = `<div class="sigapro-snapshot-viewport">${snapshot.html}</div>`;
    pendingRefreshScrollY = Math.max(0, snapshot.scrollY || 0);
    pendingRefreshLocation = currentLocation;
    host.style.setProperty("--sig-snapshot-top", `${-pendingRefreshScrollY}px`);
    host.style.setProperty(
      "--sig-snapshot-viewport-width",
      `${snapshot.viewportWidth || document.documentElement.clientWidth || window.innerWidth}px`,
    );
    host.style.setProperty(
      "--sig-snapshot-viewport-height",
      `${snapshot.viewportHeight || window.innerHeight}px`,
    );
    host.setAttribute("data-visible", "true");
  } catch {
    try {
      window.sessionStorage.removeItem(VISUAL_SNAPSHOT_KEY);
    } catch {
      // Storage indisponível: segue com o boot normal.
    }
  }
}

function releaseFrozenSnapshot() {
  const snapshot = document.getElementById("sigapro-refresh-snapshot");
  const currentLocation = currentLocationKey();
  const restoreScroll =
    pendingRefreshScrollY !== null &&
    pendingRefreshLocation === currentLocation
      ? pendingRefreshScrollY
      : null;

  const finish = () => {
    if (snapshot) {
      snapshot.removeAttribute("data-visible");
      snapshot.replaceChildren();
    }
    document.getElementById("sigapro-refresh-snapshot-css")?.remove();
    document.documentElement.removeAttribute("data-sigapro-booting");
    pendingRefreshScrollY = null;
    pendingRefreshLocation = "";
    persistNavigationState();
  };

  if (restoreScroll === null || restoreScroll <= 0) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    return;
  }

  let attempts = 0;
  const restoreWhenLayoutIsReady = () => {
    attempts += 1;
    const documentHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
    );
    const maxScroll = Math.max(0, documentHeight - window.innerHeight);
    const canReachTarget = maxScroll + 2 >= restoreScroll;

    if (canReachTarget) {
      window.scrollTo({ top: restoreScroll, left: 0, behavior: "auto" });
      if (Math.abs(window.scrollY - restoreScroll) <= 3 || attempts >= 180) {
        finish();
        return;
      }
    } else if (attempts >= 180) {
      window.scrollTo({ top: Math.min(restoreScroll, maxScroll), left: 0, behavior: "auto" });
      finish();
      return;
    }

    window.requestAnimationFrame(restoreWhenLayoutIsReady);
  };

  // Não remover o frame congelado enquanto a página real ainda não possui
  // altura suficiente para voltar exatamente ao ponto em que o F5 ocorreu.
  window.requestAnimationFrame(restoreWhenLayoutIsReady);
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
window.addEventListener("beforeunload", () => {
  persistNavigationState();
  persistVisualSnapshot();
}, { capture: true });
window.addEventListener("pagehide", () => {
  persistNavigationState();
  persistVisualSnapshot();
}, { capture: true });
window.addEventListener("sigapro-app-stable", releaseFrozenSnapshot, { once: true });

// O snapshot só é revelado depois que o CSS real do bundle já foi carregado.
// Isso evita qualquer frame sem estilo ou mudança de largura no F5.
restoreFrozenSnapshot();

createRoot(document.getElementById("root")!).render(<App />);

// Segurança: nunca deixar o overlay preso se uma tela pública/erro impedir o sinal de estabilidade.
window.setTimeout(releaseFrozenSnapshot, 8000);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {
      // O refresh precisa continuar normal mesmo se o navegador bloquear SW.
    });
  });
}
