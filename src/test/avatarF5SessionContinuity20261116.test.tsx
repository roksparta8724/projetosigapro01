// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "@/components/platform/UserAvatar";
import {
  clearAvatarSessionThumbnails,
  readAvatarSessionThumbnail,
  rememberAvatarSessionThumbnail,
} from "@/lib/avatarSessionThumbnail";
import { readFileSync } from "node:fs";

vi.mock("@/hooks/useAuthorizedAvatarUrl", () => ({
  useAuthorizedAvatarUrl: (source: string | null | undefined) => String(source || ""),
}));
const key = "municipalities/29c50042-72b5-4e11-84b6-1201f5a90a31/profiles/avatars/a/avatar.webp";
const source = "/api/profile-avatar-open?objectKey=" + encodeURIComponent(key);
const photo = "data:image/webp;base64,UklGRrYAAABXRUJQVlA4WAoAAAAQAAAAEwAAAEwAAQUxQSDIAAAAB";
const prefix = "sigapro.tab-avatar.v1:";

beforeEach(() => {
  window.sessionStorage.clear();
  document.cookie = "sigapro_browser_session_v1=1; Path=/; SameSite=Lax";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAvatarSessionThumbnails();
});

describe("SIGAPRO — avatar sem flash em refresh e isolamento", () => {
  it("mostra somente a miniatura da própria conta e do objeto exato", () => {
    sessionStorage.setItem(prefix + "user-one", JSON.stringify({
      owner: "user-one", source, thumbnail: photo, time: Date.now(),
    }));
    expect(readAvatarSessionThumbnail("user-one", source)).toBe(photo);
    expect(readAvatarSessionThumbnail("user-two", source)).toBe("");
    expect(readAvatarSessionThumbnail("user-one", source + "&v=2")).toBe("");
  });

  it("não mostra miniatura de sessão encerrada nem grava foto em localStorage", () => {
    sessionStorage.setItem(prefix + "user-one", JSON.stringify({
      owner: "user-one", source, thumbnail: photo, time: Date.now(),
    }));
    document.cookie = "sigapro_browser_session_v1=; Path=/; Max-Age=0";
    expect(readAvatarSessionThumbnail("user-one", source)).toBe("");
    expect(localStorage.getItem(prefix + "user-one")).toBeNull();
  });

  it("descarta miniatura expirada, inválida ou de outra referência", () => {
    sessionStorage.setItem(prefix + "user-one", JSON.stringify({
      owner: "user-one", source, thumbnail: photo, time: Date.now() - 31 * 60 * 1000,
    }));
    expect(readAvatarSessionThumbnail("user-one", source)).toBe("");
    expect(sessionStorage.getItem(prefix + "user-one")).toBeNull();
  });

  it("não grava um objeto que não seja um avatar R2 autenticado", () => {
    const img = document.createElement("img");
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    Object.defineProperty(img, "naturalHeight", { value: 100 });
    Object.defineProperty(img, "currentSrc", { value: "https://example.com/avatar.png" });
    rememberAvatarSessionThumbnail("user-one", source, img);
    expect(sessionStorage.length).toBe(0);
  });

  it("mantém a mesma imagem no DOM quando a sincronização da conta perde a URL temporariamente", () => {
    const { rerender } = render(<UserAvatar
      authenticatedOwnerId="user-one" preservePhotoDuringRefresh name="Perfil"
      imageUrl={photo}
    />);
    const initial = screen.getByRole("img", { name: "Perfil" });
    act(() => rerender(<UserAvatar
      authenticatedOwnerId="user-one" preservePhotoDuringRefresh name="Perfil" imageUrl={null}
    />));
    expect(screen.getByRole("img", { name: "Perfil" })).toBe(initial);
    expect(initial.getAttribute("src")).toBe(photo);
    act(() => rerender(<UserAvatar
      authenticatedOwnerId="user-one" preservePhotoDuringRefresh name="Perfil"
      photoRemovalConfirmed imageUrl={null}
    />));
    expect(screen.queryByRole("img", { name: "Perfil" })).toBeNull();
  });

  it("não recorta duas vezes a miniatura já preparada do R2", () => {
    const code = readFileSync("src/components/platform/UserAvatar.tsx", "utf8");
    expect(code).toContain("isPreparedPrivatePreview");
    expect(code).toContain("crop && !isPreparedPrivatePreview");
  });

  it("aplica proteção de foto às três instâncias de topbar, incluindo desktop e menu", () => {
    const code = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
    const items = [...code.matchAll(/<UserAvatar[\s\S]*?\/>/g)].map((x) => x[0]);
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items.filter((x) => x.includes("topbarAvatarImageUrl"))) {
      expect(item).toContain("preservePhotoDuringRefresh");
      expect(item).toContain("photoRemovalConfirmed={topbarPhotoRemovalConfirmed}");
    }
  });

  it("não libera o estilo de primeiro quadro por um status de rota sem conteúdo", () => {
    const main = readFileSync("src/main.tsx", "utf8");
    expect(main).toContain('rootElement.querySelector(".sig-app-frame, main, form, h1, h2');
    expect(main).not.toContain('if (!rootElement.hasChildNodes()) return;');
  });
});
