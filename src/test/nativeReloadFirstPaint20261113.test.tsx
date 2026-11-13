// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useNativeReloadFirstPaint } from "@/hooks/useNativeReloadFirstPaint";

const gateId = "sigapro-native-reload-render-gate";
const documentReadyId = "sigapro-authenticated-route-ready";

function insertGateAndFrame() {
  const gate = document.createElement("link");
  gate.id = gateId;
  gate.rel = "expect";
  gate.setAttribute("blocking", "render");
  gate.setAttribute("href", "#" + documentReadyId);
  document.head.appendChild(gate);

  const frame = document.createElement("main");
  frame.id = documentReadyId;
  frame.className = "sig-app-frame";
  const avatar = document.createElement("span");
  avatar.className = "sig-topbar-user-avatar";
  frame.appendChild(avatar);
  document.body.appendChild(frame);
  return { gate, frame, avatar };
}

beforeEach(() => {
  document.getElementById(gateId)?.remove();
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
  document.getElementById(gateId)?.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Chrome reload: first paint of real authorized workspace", () => {
  it("does not unblock until the current account has been verified", () => {
    const { gate } = insertGateAndFrame();
    const { rerender } = renderHook(
      ({ ready }) => useNativeReloadFirstPaint(ready, null),
      { initialProps: { ready: false } },
    );
    expect(gate.isConnected).toBe(true);
    rerender({ ready: true });
    expect(gate.isConnected).toBe(false);
  });

  it("does not wait for an avatar if the account has no photo", () => {
    const { gate } = insertGateAndFrame();
    renderHook(() => useNativeReloadFirstPaint(true, ""));
    expect(gate.isConnected).toBe(false);
  });

  it("waits for the signed-in photo to load before releasing the document", async () => {
    const { gate, avatar } = insertGateAndFrame();
    const { unmount } = renderHook(() =>
      useNativeReloadFirstPaint(true, "/api/profile-avatar-open?objectKey=platform/profiles/avatars/u/a.png"),
    );
    expect(gate.isConnected).toBe(true);
    const image = document.createElement("img");
    // JSDOM marks an IMG without src as complete (nothing to load); simulate
    // an actual pending authenticated image request instead.
    Object.defineProperty(image, "complete", { value: false, configurable: true });
    image.src = "https://sigapro.local/private-avatar-pending.png";
    avatar.appendChild(image);
    await act(async () => { await Promise.resolve(); });
    expect(gate.isConnected).toBe(true);
    act(() => image.dispatchEvent(new Event("load")));
    await waitFor(() => expect(gate.isConnected).toBe(false));
    unmount();
  });

  it("releases immediately if the authorized avatar has already loaded", () => {
    const { gate, avatar } = insertGateAndFrame();
    const image = document.createElement("img");
    Object.defineProperty(image, "complete", { value: true, configurable: true });
    avatar.appendChild(image);
    renderHook(() => useNativeReloadFirstPaint(true, "known-private-avatar"));
    expect(gate.isConnected).toBe(false);
  });

  it("never caches or screenshots processes and always has a 1.8-second fail-open", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const frame = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));

    expect(html).toContain('navigationEntries[0].type === "reload"');
    expect(html).toContain('continuity.userId === String(cachedSession.id)');
    expect(html).toContain('continuity.location === currentRoute');
    expect(html).toContain('firstPaintGate.rel = "expect"');
    expect(html).toContain('firstPaintGate.setAttribute("blocking", "render")');
    expect(html).toContain('firstPaintGate.remove();');
    expect(html).toContain('}, 1800)');
    expect(frame).toContain('id="sigapro-authenticated-route-ready"');
    expect(frame).toContain("useNativeReloadFirstPaint(");
    expect(html).not.toContain("buildRefreshVisualSnapshot");
    expect(config.git.deploymentEnabled["**"]).toBe(false);
    expect(config.git.deploymentEnabled.main).toBe(true);
  });
});
