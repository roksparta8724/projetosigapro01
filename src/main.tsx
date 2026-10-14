import { createRoot } from "react-dom/client";
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
    // Storage pode estar indisponível em navegação privada; não bloqueie a aplicação.
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
    console.warn("[SIGAPRO][DevBootstrap] Não foi possível remover Service Workers antigos.", error);
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
    console.warn("[SIGAPRO][DevBootstrap] Não foi possível limpar caches antigos.", error);
  }
}

function renderBootstrapFailure(error: unknown) {
  console.error("[SIGAPRO][Bootstrap] Falha ao carregar a aplicação.", error);

  const root = document.getElementById("root");
  if (!root) return;

  const message =
    import.meta.env.DEV && error instanceof Error && error.message
      ? error.message
      : "O navegador não conseguiu iniciar a aplicação. Atualize a página para tentar novamente.";

  root.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f5f7fb;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
      <section style="width:min(620px,100%);border:1px solid #e2e8f0;border-radius:24px;background:#fff;padding:28px;box-shadow:0 24px 60px rgba(15,23,42,.10)">
        <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b91c1c">Inicialização protegida</div>
        <h1 style="margin:10px 0 0;font-size:22px;line-height:1.25">O SIGAPRO encontrou uma falha ao iniciar</h1>
        <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:#475569">A interface foi preservada para não deixar uma tela branca. O erro técnico está abaixo para diagnóstico local.</p>
        <pre style="margin:18px 0 0;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;border-radius:16px;background:#0f172a;color:#f8fafc;padding:16px;font-size:12px;line-height:1.55">${String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        <button type="button" onclick="window.location.reload()" style="margin-top:18px;border:0;border-radius:999px;background:#123f32;color:#fff;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer">Atualizar tela</button>
      </section>
    </main>
  `;
}

async function bootApplication() {
  clearLegacyRefreshArtifacts();

  if ("scrollRestoration" in window.history) {
    // A posição do F5 pertence ao navegador. Não force scroll em loop.
    window.history.scrollRestoration = "auto";
  }

  // Em localhost, resíduos de preview/produção não podem controlar o Vite.
  await clearLocalDevelopmentCaches();

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    renderBootstrapFailure(new Error("Elemento #root não encontrado."));
    return;
  }

  try {
    const { default: App } = await import("./App.tsx");
    createRoot(rootElement).render(<App />);
  } catch (error) {
    renderBootstrapFailure(error);
  }
}

void bootApplication();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
