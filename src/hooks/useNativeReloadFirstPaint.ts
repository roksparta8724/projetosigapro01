import { useLayoutEffect } from "react";

const GATE_ID = "sigapro-native-reload-render-gate";

/**
 * Chrome's native Reload discards the React document. When a same-account
 * reload has an opt-in render hold, keep the browser from painting an EMPTY
 * root until the real authenticated workspace and, if present, the real
 * signed-in profile photo are ready.
 *
 * Nothing is copied to localStorage, no DOM snapshot is created and no
 * protected data is rendered before route authorization. index.html installs
 * the gate only for a verified same-user/same-route reload and releases it
 * after at most 1.8s, even if an auth or network request never resolves.
 */
export function useNativeReloadFirstPaint(
  workspaceAuthorized: boolean,
  expectedAvatarSource: string | null | undefined,
): void {
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const gate = document.getElementById(GATE_ID);
    if (!gate || !workspaceAuthorized) return;

    if (!expectedAvatarSource) {
      gate.remove();
      return;
    }

    const frame = document.getElementById("sigapro-authenticated-route-ready");
    if (!frame) return;

    let finished = false;
    let observedImage: HTMLImageElement | null = null;

    const removeGate = () => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      if (observedImage) {
        observedImage.removeEventListener("load", removeGate);
        observedImage.removeEventListener("error", removeGate);
      }
      gate.remove();
    };

    const checkAvatar = () => {
      if (finished) return;
      const image = frame.querySelector<HTMLImageElement>(".sig-topbar-user-avatar img");
      if (!image) return;

      if (observedImage && observedImage !== image) {
        observedImage.removeEventListener("load", removeGate);
        observedImage.removeEventListener("error", removeGate);
      }
      observedImage = image;
      if (image.complete) {
        removeGate();
        return;
      }
      image.addEventListener("load", removeGate, { once: true });
      image.addEventListener("error", removeGate, { once: true });
    };

    const observer = new MutationObserver(checkAvatar);
    observer.observe(frame, { childList: true, subtree: true });
    checkAvatar();

    return () => {
      observer.disconnect();
      if (observedImage) {
        observedImage.removeEventListener("load", removeGate);
        observedImage.removeEventListener("error", removeGate);
      }
    };
  }, [workspaceAuthorized, expectedAvatarSource]);
}
