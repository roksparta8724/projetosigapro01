// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser, UserProfile } from "@/lib/platform";

// The R2 avatar endpoint remains authenticated. Only the raster URL returned
// by the existing authorized hook is exposed to <img>, never an R2 object key.
vi.mock("@/hooks/useAuthorizedAvatarUrl", () => ({
  useAuthorizedAvatarUrl: (source: string | undefined) =>
    source?.includes("objectKey=") ? "blob:https://sigapromunicipal.com.br/authorized-avatar" : source || "",
}));
import { CompactUserRegistry } from "@/components/platform/CompactUserRegistry";

const users: SessionUser[] = [
  { id: "u-1", name: "Ana Ferreira", role: "analista", email: "ana@example.test",
    title: "Analista Técnico", department: "Urbanismo", accessLevel: 1, accountStatus: "active" },
  { id: "u-2", name: "Bruno Santos", role: "financeiro", email: "bruno@example.test",
    title: "Financeiro", department: "Financeiro", accessLevel: 1, accountStatus: "active" },
];
const recorded: Pick<UserProfile, "avatarStorageRef"|"avatarScale"|"avatarOffsetX"|"avatarOffsetY"> = {
  avatarStorageRef: "r2:municipalities/39dcd27a-b46a-409f-8a9b-a77076f4c125/profiles/avatars/u-1/foto.webp",
  avatarScale: 1.15, avatarOffsetX: 2, avatarOffsetY: 0,
};
afterEach(cleanup);
describe("Gestão de usuários — fotos reais e visual claro", () => {
  it("exibe a foto oficial do perfil autorizado na linha, não o card escuro com iniciais", () => {
    const getAvatarProfile = vi.fn((user: SessionUser) =>
      user.id === "u-1" ? recorded as UserProfile : null);
    const { container } = render(
      <CompactUserRegistry users={users} page={1} onPageChange={vi.fn()}
        getAvatarProfile={getAvatarProfile} renderDetails={() => null} />,
    );
    const row = screen.getByText("Ana Ferreira").closest("tr");
    expect(row).not.toBeNull();
    const image = within(row!).getByRole("img", { name: "Ana Ferreira" });
    expect(image.getAttribute("src")).toBe("blob:https://sigapromunicipal.com.br/authorized-avatar");
    expect(image.getAttribute("src")).not.toContain("objectKey=");
    expect(getAvatarProfile).toHaveBeenCalledWith(users[0]);
    expect(container.querySelector(".bg-slate-900")).toBeNull();
  });
  it("usa iniciais neutras sem imagem fictícia quando o cadastro não tem foto", () => {
    render(<CompactUserRegistry users={[users[1]]} page={1} onPageChange={vi.fn()}
      getAvatarProfile={() => null} renderDetails={() => null} />);
    const row = screen.getByText("Bruno Santos").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).queryByRole("img")).toBeNull();
    expect(within(row!).getByText("BS")).toBeInTheDocument();
  });
});
