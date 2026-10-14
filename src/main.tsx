import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const LEGACY_REFRESH_KEYS = [
  "sigapro.navigation.state.v1",
  "sigapro.visual.snapshot.v4",
];

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

  // Remove qualquer residuo de versoes antigas sem criar uma nova camada visual.
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
        <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:#475569">A interface real nao foi substituida por um shell temporario. O erro tecnico abaixo fica disponivel apenas para diagnostico.</p>
        <pre style="margin:18px 0 0;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;border-radius:16px;background:#0f172a;color:#f8fafc;padding:16px;font-size:12px;line-height:1.55">${String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        <button type="button" onclick="window.location.reload()" style="margin-top:18px;border:0;border-radius:999px;background:#123f32;color:#fff;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer">Atualizar tela</button>
      </section>
    </main>
  `;
}

function scheduleLocalCacheMaintenance() {
  if (import.meta.env.PROD) return;

  // Nunca bloquear o primeiro paint do localhost por manutencao de cache.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void clearLocalDevelopmentCaches();
    });
  });
}

function bootApplication() {
  clearLegacyRefreshArtifacts();

  if ("scrollRestoration" in window.history) {
    // O navegador preserva a posicao do F5 sem snapshot clonado.
    window.history.scrollRestoration = "auto";
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    renderBootstrapFailure(new Error("Elemento #root nao encontrado."));
    return;
  }

  try {
    createRoot(rootElement).render(<App />);
    scheduleLocalCacheMaintenance();
  } catch (error) {
    renderBootstrapFailure(error);
  }
}

bootApplication();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
