import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const VISUAL_SNAPSHOT_KEY = "sigapro.visual.snapshot.v1";

function isInternalPath(pathname: string) {
  const publicPaths = ["/", "/inicio", "/apresentacao", "/planos-publicos"];
  const authPaths = ["/acesso", "/criar-conta", "/recuperar-senha"];
  return (
    !publicPaths.includes(pathname) &&
    !authPaths.includes(pathname) &&
    !pathname.startsWith("/cliente/")
  );
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
        path: window.location.pathname,
        html: root.innerHTML,
        scrollY: window.scrollY || 0,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Falha de storage nunca pode afetar a navegação.
  }
}

function releaseFrozenSnapshot() {
  const snapshot = document.getElementById("sigapro-refresh-snapshot");
  if (snapshot) {
    snapshot.removeAttribute("data-visible");
    snapshot.replaceChildren();
  }
  document.documentElement.removeAttribute("data-sigapro-booting");
}

window.addEventListener("beforeunload", persistVisualSnapshot, { capture: true });
window.addEventListener("pagehide", persistVisualSnapshot, { capture: true });
window.addEventListener("sigapro-app-stable", releaseFrozenSnapshot, { once: true });

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
