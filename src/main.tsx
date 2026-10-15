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

clearLegacyRefreshArtifacts();

if ("scrollRestoration" in window.history) {
  // A posição do F5 pertence ao navegador. Nunca force scroll em loop.
  window.history.scrollRestoration = "auto";
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemento #root não encontrado.");
}

// O shell real precisa montar no primeiro ciclo de JavaScript.
// Limpeza de cache/Service Worker em localhost é manutenção de fundo e nunca
// pode atrasar topbar, menu, rodapé ou a rota atual durante F5.
createRoot(rootElement).render(<App />);
void clearLocalDevelopmentCaches();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
