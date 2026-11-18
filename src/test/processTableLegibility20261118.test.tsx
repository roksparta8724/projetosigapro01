// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const css = readFileSync("src/styles/sigapro-process-table-legibility.css", "utf8");
const component = readFileSync("src/components/platform/CompactProcessRegistry.tsx", "utf8");
const wrapper = readFileSync("src/components/platform/PremiumProcessRegistry.tsx", "utf8");
const title = "HOMOLOGAÇÃO PIX 2 - TESTE DE DOCUMENTAÇÃO E TRAMITAÇÃO MUNICIPAL";
const process = {
  id: "qa-row-2026",
  municipalityId: "11111111-1111-4111-8111-111111111111",
  protocol: "PM-2026-00005",
  title,
  status: "pendencia_documental",
  ownerName: "Interessado",
  technicalLead: "Não informado",
  type: "aprovacao",
  tags: [],
  dispatches: [],
  timeline: [],
  analysis: null,
  sla: { currentStage: "Pendência documental", dueDate: "30/10/2026", hoursRemaining: 16, breached: false },
} as unknown as ProcessRecord;

describe("SIGAPRO — tabela de processos sem dados cortados (940–1120px)", () => {
  it("exibe o assunto inteiro, situação e prazo sem perder os campos originais", () => {
    const { container } = render(
      <MemoryRouter>
        <PremiumProcessRegistry processes={[process]} embedded />
      </MemoryRouter>
    );
    const registry = container.querySelector('[data-sigapro-table-legibility="v2"]');
    expect(registry).toBeInTheDocument();
    const row = registry?.querySelector('[data-sei-process-row="true"]');
    expect(row?.querySelector(".sig-process-subject-title")).toHaveTextContent(title);
    expect(row?.querySelector(".sig-process-status")).toHaveTextContent("Pendência documental");
    expect(row?.querySelector(".sig-process-due-chip")).toHaveTextContent("30/10/2026");
    expect(row?.querySelector(".sig-process-responsible-name")).toBeInTheDocument();
    expect(row?.querySelector(".sig-process-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir processo/i })).toBeInTheDocument();
  });

  it("redistribui oito colunas sem cortar Etapa, Pendências ou Assunto", () => {
    expect(css).toContain("@container sigapro-process-registry (min-width: 940px) and (max-width: 1119px)");
    expect(css).toContain("80px 112px minmax(145px, 1.5fr) minmax(154px, 1.5fr)");
    expect(css).toContain('grid-template-areas: "marker number subject stage owner deadline pending actions" !important');
    expect(css).toContain(".sig-process-head-pending");
    expect(css).toContain("white-space: nowrap !important");
    expect(css).toContain(".sig-process-subject-title");
    expect(css).toContain("-webkit-line-clamp: unset !important");
    expect(css).toContain("overflow: visible !important");
    expect(css).toContain(".sig-process-status");
    expect(css).toContain("flex-wrap: wrap !important");
  });

  it("mantém ação abrir e marcadores operáveis sem exigir scroll horizontal da tabela", () => {
    expect(component).toContain('data-sigapro-table-legibility="v2"');
    expect(component).toContain('aria-label={"Selecionar processo " + number}');
    expect(component).toContain('aria-label={"Mais ações do processo " + number}');
    expect(css).toContain(".sig-reference-extra-count-narrow");
    expect(css).toContain("display: inline-flex !important");
    expect(css).not.toContain("overflow-x: auto");
    expect(wrapper).toContain('import "@/styles/sigapro-process-table-legibility.css"');
  });
});
