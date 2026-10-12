import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const VISUAL_SNAPSHOT_KEY = "sigapro.visual.snapshot.v2";
const NAVIGATION_STATE_KEY = "sigapro.navigation.state.v1";
let pendingRefreshScrollY: number | null = null;
let pendingRefreshLocation = "";
let scrollPersistRaf = 0;
let snapshotReleaseInProgress = false;
let appHasSignaledStable = false;

function currentLocationKey() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
  if (!isInternalPath(window.location.pathname) || !appHasSignaledStable) return;
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
        pageZoom: document.documentElement.style.zoom || "1",
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Falha de storage nunca pode afetar a navegação.
  }
}

function persistVisualSnapshotScrollOnly() {
  if (!isInternalPath(window.location.pathname)) return;
  try {
    const raw = window.sessionStorage.getItem(VISUAL_SNAPSHOT_KEY);
    if (!raw) return;
    const snapshot = JSON.parse(raw) as {
      host?: string;
      path?: string;
      scrollY?: number;
      savedAt?: number;
      [key: string]: unknown;
    };
    if (snapshot.host !== window.location.host || snapshot.path !== currentLocationKey()) return;
    snapshot.scrollY = window.scrollY || 0;
    snapshot.savedAt = Date.now();
    window.sessionStorage.setItem(VISUAL_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // noop
  }
}

function restoreFrozenSnapshot() {
  if (!isInternalPath(window.location.pathname)) return;

  const earlyHost = document.getElementById("sigapro-refresh-snapshot");
  if (earlyHost?.getAttribute("data-restored-early") === "true") {
    try {
      const raw = window.sessionStorage.getItem(VISUAL_SNAPSHOT_KEY);
      if (raw) {
        const snapshot = JSON.parse(raw) as { path?: string; scrollY?: number };
        if (snapshot.path === currentLocationKey()) {
          pendingRefreshScrollY = Math.max(0, Number(snapshot.scrollY) || 0);
          pendingRefreshLocation = currentLocationKey();
        }
      }
    } catch {
      // O snapshot já está desenhado; falha de leitura não deve removê-lo.
    }
    return;
  }

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
      pageZoom?: string;
      savedAt?: number;
    };

    const currentLocation = currentLocationKey();
    const valid =
      snapshot.host === window.location.host &&
      snapshot.path === currentLocation &&
      typeof snapshot.html === "string" &&
      snapshot.html.length > 500 &&
      snapshot.pageZoom === (document.documentElement.style.zoom || "1") &&
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
    host.style.setProperty("--sig-snapshot-scroll-y", `${pendingRefreshScrollY}px`);
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
  const hasFrozenFrame = snapshot?.getAttribute("data-visible") === "true";
  if (!hasFrozenFrame) {
    document.documentElement.removeAttribute("data-sigapro-booting");
    return;
  }
  if (snapshotReleaseInProgress) return;
  snapshotReleaseInProgress = true;

  const currentLocation = currentLocationKey();
  const restoreScroll =
    pendingRefreshScrollY !== null &&
    pendingRefreshLocation === currentLocation
      ? pendingRefreshScrollY
      : 0;

  const finish = () => {
    if (snapshot) {
      snapshot.removeAttribute("data-visible");
      snapshot.removeAttribute("data-restored-early");
      snapshot.replaceChildren();
    }
    document.getElementById("sigapro-refresh-snapshot-css")?.remove();
    document.documentElement.removeAttribute("data-sigapro-booting");
    pendingRefreshScrollY = null;
    pendingRefreshLocation = "";
    snapshotReleaseInProgress = false;
    persistNavigationState();
  };

  const waitForFonts = async () => {
    try {
      if ("fonts" in document && document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
        ]);
      }
    } catch {
      // Fontes não podem bloquear a liberação.
    }
  };

  const criticalImagesReady = () => {
    const root = document.getElementById("root");
    if (!root) return false;
    const images = Array.from(root.querySelectorAll("img"));
    return images.every((img) => img.complete && (img.naturalWidth > 0 || !img.getAttribute("src")));
  };

  const readGeometry = () => {
    const root = document.getElementById("root");
    const rect = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return "missing";
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(",");
    };

    const anchors = [
      root?.querySelector(".sig-premium-topbar") ?? null,
      root?.querySelector(".sig-sidebar-shell") ?? null,
      root?.querySelector(".sig-main-shell") ?? null,
      root?.querySelector(".sig-page-footer") ?? null,
    ];

    const dynamicBlocks = root
      ? Array.from(
          root.querySelectorAll(
            ".sig-section-card,.sig-stat-card,.sig-metric-card,[data-ui=card],[role=tablist],header,main,footer",
          ),
        ).slice(0, 40)
      : [];

    return [
      ...anchors.map(rect),
      ...dynamicBlocks.map(rect),
      document.documentElement.scrollHeight,
      document.documentElement.scrollWidth,
    ].join("|");
  };

  void waitForFonts().then(() => {
    let attempts = 0;
    let stableFrames = 0;
    let lastGeometry = "";

    const waitUntilPixelStable = () => {
      attempts += 1;

      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      );
      const maxScroll = Math.max(0, documentHeight - window.innerHeight);
      const targetScroll = Math.min(Math.max(0, restoreScroll || 0), maxScroll);
      window.scrollTo({ top: targetScroll, left: 0, behavior: "auto" });

      const scrollStable = Math.abs(window.scrollY - targetScroll) <= 2;
      const imagesStable = criticalImagesReady();
      const geometry = readGeometry();
      const geometryStable = geometry === lastGeometry && geometry.indexOf("missing") === -1;

      stableFrames = scrollStable && imagesStable && geometryStable ? stableFrames + 1 : 0;
      lastGeometry = geometry;

      // Six identical animation frames means menu, topbar, cards, text, icons and
      // footer have stopped changing before the frozen frame is removed.
      if (stableFrames >= 12 || attempts >= 300) {
        finish();
        return;
      }

      window.requestAnimationFrame(waitUntilPixelStable);
    };

    window.requestAnimationFrame(waitUntilPixelStable);
  });
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
      persistVisualSnapshotScrollOnly();
    });
  },
  { passive: true },
);
window.addEventListener("beforeunload", () => {
  persistNavigationState();
  persistVisualSnapshotScrollOnly();
}, { capture: true });
window.addEventListener("pagehide", () => {
  persistNavigationState();
  persistVisualSnapshotScrollOnly();
}, { capture: true });
window.addEventListener("sigapro-app-stable", () => {
  appHasSignaledStable = true;
  persistVisualSnapshot();
  releaseFrozenSnapshot();
});

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
