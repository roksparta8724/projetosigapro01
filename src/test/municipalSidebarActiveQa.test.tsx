import { render } from "@testing-library/react";
import { Landmark, LayoutDashboard, Network, Wallet } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppSidebar, type AppSidebarGroup } from "@/components/platform/AppSidebar";

const groups: AppSidebarGroup[] = [{
  title: "Administração",
  items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/prefeitura", label: "Prefeitura", icon: Landmark },
    { to: "/prefeitura/organograma", label: "Organograma", icon: Network },
    {
      to: "/prefeitura/financeiro",
      label: "Financeiro",
      icon: Wallet,
      children: [{ to: "/prefeitura/financeiro", label: "Visão geral", icon: LayoutDashboard }],
    },
  ],
}];

function selectedDesktopLinks(pathname: string) {
  const { container } = render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppSidebar pathname={pathname} groups={groups} />
    </MemoryRouter>,
  );
  const sidebar = container.querySelector("aside.sig-sidebar-shell");
  expect(sidebar).not.toBeNull();
  return {
    selected: Array.from(sidebar!.querySelectorAll('a[data-sidebar-active="true"]'))
      .map((node) => node.getAttribute("href")),
    municipal: sidebar!.querySelector('a[href="/prefeitura"]'),
    organogram: sidebar!.querySelector('a[href="/prefeitura/organograma"]'),
  };
}

describe("SIGAPRO QA — localização ativa no menu institucional", () => {
  it.each([
    "/prefeitura",
    "/prefeitura/",
    "/prefeitura/visao-geral/processos",
    "/prefeitura/visao-geral/pendencias",
    "/prefeitura/visao-geral/atividades",
  ])("destaca Prefeitura e preserva sua seleção acessível em %s", (pathname) => {
    const { selected, municipal } = selectedDesktopLinks(pathname);
    expect(selected).toEqual(["/prefeitura"]);
    expect(municipal).toHaveAttribute("aria-current", "page");
    expect(municipal).toHaveAttribute("data-sidebar-active", "true");
  });

  it("não seleciona Prefeitura na página independente Organograma", () => {
    const { selected, municipal, organogram } = selectedDesktopLinks("/prefeitura/organograma");
    expect(selected).toEqual(["/prefeitura/organograma"]);
    expect(municipal).not.toHaveAttribute("aria-current");
    expect(organogram).toHaveAttribute("aria-current", "page");
  });

  it("não acende Prefeitura indevidamente nas páginas operacionais", () => {
    const { selected, municipal } = selectedDesktopLinks("/prefeitura/financeiro");
    expect(selected).not.toContain("/prefeitura");
    expect(municipal).toHaveAttribute("data-sidebar-active", "false");
  });

  it("conserva destaque independente do Dashboard", () => {
    const { selected } = selectedDesktopLinks("/dashboard");
    expect(selected).toEqual(["/dashboard"]);
  });
});
