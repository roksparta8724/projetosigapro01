// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/hooks/useAuthorizedAvatarUrl", () => ({
  useAuthorizedAvatarUrl: (source: string | null | undefined) => String(source || ""),
}));

const photoA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
const photoB = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8AAAgMBAp0SttgAAAAASUVORK5CYII=";
afterEach(() => cleanup());

describe("foto do topo não pisca durante revalidação", () => {
  it("preserva a MESMA imagem DOM quando a URL da conta fica vazia transitoriamente", () => {
    const { rerender } = render(<UserAvatar authenticatedOwnerId="user-1" name="Ana" imageUrl={photoA} />);
    const image = screen.getByRole("img", { name: "Ana" });
    expect(image.getAttribute("src")).toBe(photoA);

    act(() => rerender(<UserAvatar authenticatedOwnerId="user-1" name="Ana" imageUrl={null} />));
    expect(screen.getByRole("img", { name: "Ana" })).toBe(image);
    expect(image.getAttribute("src")).toBe(photoA);

    act(() => rerender(<UserAvatar authenticatedOwnerId="user-1" name="Ana" imageUrl={photoA} />));
    expect(screen.getByRole("img", { name: "Ana" })).toBe(image);
  });

  it("troca de conta remove imediatamente a foto da conta anterior", () => {
    const { rerender } = render(<UserAvatar authenticatedOwnerId="user-1" name="Ana" imageUrl={photoA} />);
    expect(screen.getByRole("img", { name: "Ana" })).toBeTruthy();
    act(() => rerender(<UserAvatar authenticatedOwnerId="user-2" name="Bruno" imageUrl={null} />));
    expect(screen.queryByRole("img", { name: "Ana" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Bruno" })).toBeNull();
    expect(screen.getByText("BR")).toBeTruthy();
  });

  it("usuários sem owner explícito não compartilham a foto antiga em listagens", () => {
    const { rerender } = render(<UserAvatar name="Ana" imageUrl={photoA} />);
    act(() => rerender(<UserAvatar name="Bruno" imageUrl={null} />));
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("a apresentação de topo não ignora o cache de foto quando o perfil veio parcial", () => {
    const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
    expect(portal).toContain("const cachedHeaderProfile = signedInProfileId");
    expect(portal).toContain("const profileHasAvatar = Boolean(resolveProfileAvatarDisplayUrl(userProfile))");
    expect(portal).toContain("const cachedHasAvatar = Boolean(resolveProfileAvatarDisplayUrl(cachedHeaderProfile))");
    expect(portal).toContain("const displayProfile = userProfile && (profileHasAvatar || !cachedHasAvatar)");
    expect(portal).toContain("authenticatedOwnerId={authenticatedAvatarOwnerId}");
    expect(portal).toContain("refreshWithoutPageReload");
  });
});
