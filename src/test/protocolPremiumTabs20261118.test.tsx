// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InternalTabs } from "@/components/platform/InternalTabs";

const protocol = readFileSync("src/pages/saas/ProtocolDeskPage.tsx", "utf8");
const css = readFileSync("src/styles/sigapro-protocol-section-nav.css", "utf8");

const sections = [
  { value: "visao-geral", label: "Resumo", helper: "Indicadores e prioridades" },
  { value: "todos", label: "Todos os protocolos", helper: "Consulta e rastreabilidade" },
  { value: "fila", label: "Fila de triagem", helper: "Processos da unidade" },
  { value: "entradas", label: "Entradas", helper: "Origem dos registros" },
  { value: "documentos", label: "Pendências", helper: "Documentos e exigências" },
  { value: "pagamentos", label: "Pagamentos", helper: "Guias e confirmações" },
  { value: "balcao", label: "Balcão", helper: "Atendimento assistido" },
  { value: "online", label: "Portal externo", helper: "Recebimentos digitais" },
  { value: "historico", label: "Histórico", helper: "Eventos e movimentações" },
];

function InteractiveProtocolTabs() {
  const [value, setValue] = useState("todos");
  const location = useLocation();
  return <>
    <InternalTabs
      className="sig-protocol-section-nav"
      items={sections}
      value={value}
      onChange={setValue}
    />
    <output data-testid="active-tab">{value}</output>
    <output data-testid="query">{location.search}</output>
  </>;
}

describe("SIGAPRO — navegação premium do Protocolo", () => {
  it("preserva as nove pastas e os IDs existentes com rótulos curtos", () => {
    expect(protocol).toContain('className="sig-protocol-section-nav"');
    for (const { value, label } of sections) {
      expect(protocol).toContain(`{ value: "${value}", label: "${label}"`);
    }
    expect(protocol).not.toContain('label: "Pagamento do protocolo"');
    expect(protocol).not.toContain('label: "Atendimento balcão"');
    expect(protocol).not.toContain('label: "Atendimento online"');
  });

  it("não comprime nove cards numa largura igual nem quebra palavras", () => {
    expect(css).toContain("flex: 0 0 185px !important");
    expect(css).toContain("min-width: 185px !important");
    expect(css).toContain("overflow-x: auto !important");
    expect(css).toContain("flex-wrap: nowrap !important");
    expect(css).toContain("scrollbar-width: thin");
    expect(css).toContain("word-break: normal !important");
    expect(css).toContain("hyphens: none !important");
    expect(css).toContain("-webkit-line-clamp: 2");
    expect(css).not.toContain("repeat(auto-fit");
  });

  it("destaca a aba ativa sem transformar o card inteiro em azul escuro", () => {
    expect(css).toContain('.sig-nav-item[data-nav-active="true"]');
    expect(css).toContain("background: linear-gradient(180deg, #e6f4fc 0%, #d9edf8 100%) !important");
    expect(css).toContain("box-shadow: inset 0 3px 0 #11719c");
    expect(css).toContain("outline: 3px solid #3d9fce !important");
  });

  it("mantém clique, ordem operacional e URL de cada seção funcionando", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/prefeitura/protocolos?secao=todos"]}>
        <InteractiveProtocolTabs />
      </MemoryRouter>
    );
    const nav = container.querySelector(".sig-protocol-section-nav");
    expect(nav).toBeInTheDocument();
    expect(nav?.querySelectorAll(".sig-nav-item")).toHaveLength(9);
    const buttons = Array.from(nav!.querySelectorAll("button"));
    expect(buttons[0]).toHaveTextContent("Todos os protocolos");
    expect(buttons[buttons.length - 1]).toHaveTextContent("Resumo");
    fireEvent.click(screen.getByRole("button", { name: /Pagamentos/i }));
    expect(screen.getByTestId("active-tab")).toHaveTextContent("pagamentos");
    expect(screen.getByTestId("query")).toHaveTextContent("secao=pagamentos");
    expect(screen.getByRole("button", { name: /Pagamentos/i })).toHaveAttribute("aria-current", "page");
  });
});
