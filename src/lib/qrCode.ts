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
          level: "M",
          marginSize: 4,
          boostLevel: false,
          bgColor: "#ffffff",
          fgColor: "#000000",
        }),
      );
    });

    const canvas = host.querySelector("canvas");
    if (!canvas) return "";

    // PNG is intentionally used by the UI as well as the PDF. Unlike an SVG,
    // the QR modules cannot inherit global theme fill/stroke rules, so the
    // black modules, white quiet zone and finder patterns remain pixel-perfect.
    return canvas.toDataURL("image/png", 1);
  } catch {
    return "";
  } finally {
    root.unmount();
    host.remove();
  }
}
