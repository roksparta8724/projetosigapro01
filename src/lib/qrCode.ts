import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QRCodeCanvas } from "qrcode.react";

export function createQrCodeDataUrl(value: string, size = 256) {
  const normalized = String(value || "").trim();
  if (!normalized || typeof document === "undefined") return "";

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = `${size}px`;
  host.style.height = `${size}px`;
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(
        createElement(QRCodeCanvas, {
          value: normalized,
          size,
          level: "Q",
          bgColor: "#ffffff",
          fgColor: "#0B4F71",
        }),
      );
    });

    const canvas = host.querySelector("canvas");
    return canvas?.toDataURL("image/png") || "";
  } catch {
    return "";
  } finally {
    root.unmount();
    host.remove();
  }
}
