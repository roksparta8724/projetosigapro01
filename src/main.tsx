import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

window.setTimeout(() => {
  document.documentElement.removeAttribute("data-sigapro-booting");
}, 1800);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sigapro-sw.js", { updateViaCache: "none" }).catch(() => {
      // O refresh precisa continuar normal mesmo se o navegador bloquear SW.
    });
  });
}
