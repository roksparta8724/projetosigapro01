// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProcessDetailHero } from "@/components/platform/ProcessDetailHero";

const base = {
  protocol: "PM-2026-00003",
  subject: "Reforma e licenciamento de edificação",
  municipality: "Prefeitura de Campo Limpo Paulista",
  processType: "Licenciamento Urbanístico",
  currentStage: "Concluído",
  ownerName: "Proprietário de teste",
  responsibleUnit: "Secretaria de Obras / Urbanismo",
  assignedTo: "Técnico de teste",
  deadline: "Prazo 22/11/2026 · conferir SLA",
  visiblePendingCount: 2,
};

describe("SIGAPRO — cabeçalho premium de todos os processos", () => {
  it("renderiza título, número oficial, etapa, interessado e os DOIS mini-cards", () => {
    const { container } = render(<ProcessDetailHero {...base} actions={<button type="button">Sair do processo</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: base.subject })).toBeInTheDocument();
    expect(screen.getByText(base.protocol)).toBeInTheDocument();
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    expect(screen.getByText(/Interessado: Proprietário de teste/)).toBeInTheDocument();
    expect(container.querySelectorAll("[data-process-detail-hero-mini-card]")).toHaveLength(2);
    expect(screen.getByText(base.responsibleUnit)).toBeInTheDocument();
    expect(screen.getByText("Responsável: Técnico de teste")).toBeInTheDocument();
    expect(screen.getByText(/2 exigência\(s\) visível\(is\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair do processo" })).toBeInTheDocument();
  });

  it("não expõe unidade, técnico ou SLA internos no acompanhamento restrito", () => {
    render(<ProcessDetailHero {...base} restrictedView />);
    expect(screen.getByText("Acompanhamento do protocolo")).toBeInTheDocument();
    expect(screen.getByText("Acompanhe a etapa atual do protocolo")).toBeInTheDocument();
    expect(screen.queryByText(base.responsibleUnit)).toBeNull();
    expect(screen.queryByText("Responsável: Técnico de teste")).toBeNull();
    expect(screen.queryByText(base.deadline)).toBeNull();
  });

  it("mostra fallback COMPACTO e nunca deixa painel azul sem conteúdo", () => {
    const { container } = render(<ProcessDetailHero {...base} protocol="PM-2026-00003" subject=" " responsibleUnit="" deadline="" ownerName="" visiblePendingCount={0} />);
    expect(screen.getByText("Assunto não informado no cadastro")).toBeInTheDocument();
    expect(screen.getByText("Unidade não informada")).toBeInTheDocument();
    expect(screen.getByText("Prazo não informado")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma exigência visível nesta consulta")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-process-detail-hero-mini-card]")).toHaveLength(2);
  });

  it("substitui PageHero genérico, sem altura fixa nem conflito com os temas", () => {
    const page = readFileSync("src/pages/saas/ProcessDetailPage.tsx", "utf8");
    const component = readFileSync("src/components/platform/ProcessDetailHero.tsx", "utf8");
    const css = readFileSync("src/components/platform/ProcessDetailHero.css", "utf8");
    expect(page).toContain("<ProcessDetailHero");
    expect(page).not.toContain("<PageHero");
    expect(page).toContain("formatOfficialProcessTitle({ title: process.title, type: process.type })");
    expect(page).toContain("formatProcessSlaDeadline(process.sla?.dueDate, process.sla?.hoursRemaining)");
    expect(page).toContain("visiblePendingCount={visibleRequirements.length}");
    expect(page).toContain('deadline={isFinalProcessStatus ? "Processo concluído"');
    expect(page).toContain("compact={isFinalProcessStatus}");
    expect(page).toContain("navigate(processExitPath)");
    expect(component).toContain('data-process-detail-hero="premium"');
    expect(component).toContain('data-process-detail-hero-mini-card="unit"');
    expect(component).toContain('data-process-detail-hero-mini-card="deadline"');
    expect(css).toContain("height: auto");
    expect(css).toContain("min-height: 0");
    expect(css).toContain(".sig-detail-hero-title");
    expect(css).toContain("visibility: visible !important");
    expect(css).not.toContain("min-height: 200px");
    expect(page).not.toContain('min-h-[420px]');
  });
});
