import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/surface-polarity.css";

const CONTINUITY_KEY = "sigapro.refresh.continuity.v1";
const PLATFORM_SESSION_CACHE_KEY = "sigapro.platform.session.v1";
const LEGACY_REFRESH_KEYS = [
  "sigapro.navigation.state.v1",
  "sigapro.visual.snapshot.v4",
];

function currentLocationKey() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function currentIdentity() {
  try {
    const raw = window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY);
    const session = raw
      ? (JSON.parse(raw) as { id?: string; accountStatus?: string })
      : null;

    return session?.id &&
      session.accountStatus !== "blocked" &&
      session.accountStatus !== "inactive"
      ? String(session.id)
      : "";
  } catch {
    return "";
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

function collectSnapshotCss() {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) css += rule.cssText + "\n";
    } catch {
      // Folhas externas/CORS não entram no snapshot; estilos inline continuam válidos.
    }
  }
  return css;
}

function buildRefreshVisualSnapshot(root: HTMLElement) {
  const viewportWidth = Math.max(1, window.innerWidth);
  const viewportHeight = Math.max(1, window.innerHeight);
  const zoomValue = Number.parseFloat(document.documentElement.style.zoom || "1") || 1;
  const css = collectSnapshotCss();
  const html = root.innerHTML
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\sautofocus(?:="[^"]*")?/gi, "");

  const stageTop = -window.scrollY;
  const stageLeft = -window.scrollX;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + viewportWidth + '" height="' + viewportHeight + '" viewBox="0 0 ' + viewportWidth + ' ' + viewportHeight + '">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:' + (viewportWidth / zoomValue) + 'px;min-height:' + (viewportHeight / zoomValue) + 'px;zoom:' + zoomValue + ';overflow:hidden;background:' +
          (getComputedStyle(document.body).backgroundColor || 'var(--sig-initial-bg,#f5f7fb)') + ';">' +
          '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>' +
          '<div style="position:relative;left:' + stageLeft + 'px;top:' + stageTop + 'px;">' + html + '</div>' +
        '</div>' +
      '</foreignObject>' +
    '</svg>';

  return { svg, viewportWidth, viewportHeight, zoomValue };
}

function persistRefreshContinuity() {
  if (!isInternalPath(window.location.pathname)) return;

  const userId = currentIdentity();
  const root = document.getElementById("root");
  if (!userId || !root || root.innerHTML.length < 500) return;

  try {
    const visual = buildRefreshVisualSnapshot(root);
    window.sessionStorage.setItem(
      CONTINUITY_KEY,
      JSON.stringify({
        host: window.location.host,
        location: currentLocationKey(),
        userId,
        savedAt: Date.now(),
        ...visual,
      }),
    );
  } catch {
    // A continuidade visual nunca interfere na persistência oficial.
  }
}

function clearLegacyRefreshArtifacts() {
  try {
    for (const key of LEGACY_REFRESH_KEYS) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage pode estar indisponivel em navegacao privada.
  }

  document.documentElement.removeAttribute("data-sigapro-booting");
  document.documentElement.removeAttribute("data-sigapro-internal");

  const legacyOverlay = document.getElementById("sigapro-refresh-snapshot");
  legacyOverlay?.remove();
}

async function clearLocalDevelopmentCaches() {
  if (import.meta.env.PROD) return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn("[SIGAPRO][DevBootstrap] Nao foi possivel remover Service Workers antigos.", error);
  }

  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("sigapro-enterprise-"))
          .map((name) => window.caches.delete(name)),
      );
    }
  } catch (error) {
    console.warn("[SIGAPRO][DevBootstrap] Nao foi possivel limpar caches antigos.", error);
  }
}

function renderBootstrapFailure(error: unknown) {
  console.error("[SIGAPRO][Bootstrap] Falha ao carregar a aplicacao.", error);

  const root = document.getElementById("root");
  if (!root) return;

  const message =
    import.meta.env.DEV && error instanceof Error && error.message
      ? error.message
      : "O navegador nao conseguiu iniciar a aplicacao. Atualize a pagina para tentar novamente.";

  root.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--sig-initial-bg,#f5f7fb);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
      <section style="width:min(620px,100%);border:1px solid #e2e8f0;border-radius:24px;background:#fff;padding:28px;box-shadow:0 24px 60px rgba(15,23,42,.10)">
        <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b91c1c">Inicializacao protegida</div>
        <h1 style="margin:10px 0 0;font-size:22px;line-height:1.25">O SIGAPRO encontrou uma falha ao iniciar</h1>
        <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:#475569">A interface real nao foi substituida por um shell artificial. O erro tecnico abaixo fica disponivel apenas para diagnostico.</p>
        <pre style="margin:18px 0 0;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;border-radius:16px;background:#0f172a;color:#f8fafc;padding:16px;font-size:12px;line-height:1.55">${String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        <button type="button" onclick="window.location.reload()" style="margin-top:18px;border:0;border-radius:999px;background:#123f32;color:#fff;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer">Atualizar tela</button>
      </section>
    </main>
  `;
}

function scheduleLocalCacheMaintenance() {
  if (import.meta.env.PROD) return;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void clearLocalDevelopmentCaches();
    });
  });
}

function bootApplication() {
  clearLegacyRefreshArtifacts();

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "auto";
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    renderBootstrapFailure(new Error("Elemento #root nao encontrado."));
    return;
  }

  try {
    createRoot(rootElement).render(<App />);

    const releaseRefreshSnapshot = () => {
      document.documentElement.removeAttribute("data-sigapro-initial-render");
      document.getElementById("sigapro-refresh-snapshot")?.remove();
    };

    if (document.getElementById("sigapro-refresh-snapshot")) {
      window.addEventListener("sigapro-app-stable", releaseRefreshSnapshot as EventListener, { once: true });
      window.setTimeout(releaseRefreshSnapshot, 8000);
    } else {
      window.requestAnimationFrame(releaseRefreshSnapshot);
    }

    scheduleLocalCacheMaintenance();
  } catch (error) {
    renderBootstrapFailure(error);
  }
}

window.addEventListener("beforeunload", persistRefreshContinuity, { capture: true });
window.addEventListener("pagehide", persistRefreshContinuity, { capture: true });

window.addEventListener("sigapro-platform-session-updated", () => {
  try {
    const raw = window.sessionStorage.getItem(CONTINUITY_KEY);
    const snapshot = raw
      ? (JSON.parse(raw) as { userId?: string })
      : null;

    if (snapshot?.userId && snapshot.userId !== currentIdentity()) {
      window.sessionStorage.removeItem(CONTINUITY_KEY);
    }
  } catch {
    window.sessionStorage.removeItem(CONTINUITY_KEY);
  }
});

bootApplication();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
