// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SIGAPRO — foto verificada permanece durante revalidação", () => {
  it("não apaga imagem após 1,2 segundo nem após 10 segundos sem URL temporária", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <UserAvatar authenticatedOwnerId="same-user" preservePhotoDuringRefresh name="Joana" imageUrl={photo} />,
    );
    const visiblePhoto = screen.getByRole("img", { name: "Joana" });
    act(() => rerender(
      <UserAvatar authenticatedOwnerId="same-user" preservePhotoDuringRefresh name="Joana" imageUrl={null} />,
    ));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole("img", { name: "Joana" })).toBe(visiblePhoto);
    expect(visiblePhoto.getAttribute("src")).toBe(photo);
    act(() => rerender(
      <UserAvatar authenticatedOwnerId="same-user" preservePhotoDuringRefresh name="Joana" imageUrl={photo} />,
    ));
    expect(screen.getByRole("img", { name: "Joana" })).toBe(visiblePhoto);
  });

  it("apaga a foto quando o perfil remoto confirma explicitamente a remoção", () => {
    const { rerender } = render(
      <UserAvatar authenticatedOwnerId="same-user" preservePhotoDuringRefresh name="Joana" imageUrl={photo} />,
    );
    expect(screen.getByRole("img", { name: "Joana" })).toBeTruthy();
    act(() => rerender(
      <UserAvatar authenticatedOwnerId="same-user" preservePhotoDuringRefresh photoRemovalConfirmed name="Joana" imageUrl={null} />,
    ));
    expect(screen.queryByRole("img", { name: "Joana" })).toBeNull();
  });

  it("nunca apresenta foto da conta anterior quando a identidade muda", () => {
    const { rerender } = render(
      <UserAvatar authenticatedOwnerId="user-one" preservePhotoDuringRefresh name="Joana" imageUrl={photo} />,
    );
    act(() => rerender(
      <UserAvatar authenticatedOwnerId="user-two" preservePhotoDuringRefresh name="Maria" imageUrl={null} />,
    ));
    expect(screen.queryByRole("img", { name: "Joana" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Maria" })).toBeNull();
  });

  it("o cabeçalho só trata ausência de foto como remoção após confirmação da conta e banco", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
    expect(source).toContain("dataReadyForCurrentUser &&");
    expect(source).toContain('source === "remote" &&');
    expect(source).toContain("photoRemovalConfirmed={topbarPhotoRemovalConfirmed}");
    expect(source).toContain("preservePhotoDuringRefresh");
  });
});
