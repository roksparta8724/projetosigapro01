// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import { hasOperationalUnit, isProcessInMyUnit, isProcessPersonallyLinked } from "@/lib/processPersonalScope";
import type { ProcessRecord, SessionUser } from "@/lib/platform";

const alex = {
  id: "profile-alex",
  role: "setor_intersetorial",
  name: "Alex Oliveira Santos",
  title: "Assistente Administrativo",
  department: "Administração",
  tenantId: "municipio-qa",
  municipalityId: "municipio-qa",
  email: "alex@example.test",
  accessLevel: 1,
  accountStatus: "active",
} as unknown as SessionUser;
const record = (id: string, folder: string, props: Partial<ProcessRecord> = {}) => ({
  id,
  tenantId: "municipio-qa",
  municipalityId: "municipio-qa",
  protocol: "PM-2026-" + id,
  externalProtocol: "",
  title: "Processo " + id,
  status: "analise_tecnica",
  type: "aprovacao",
  ownerName: "Proprietário",
  technicalLead: "Jonatas Rodrigues",
  createdBy: "profissional-externo",
  triage: { status: "concluido" },
  analysis: { assignedTo: "Jonatas Rodrigues" },
  tags: [],
  auditTrail: [],
  timeline: [],
  dispatches: [],
  requirements: [],
  processControl: { currentFolder: folder },
  sla: { currentStage: folder, dueDate: "", breached: false, hoursRemaining: 100 },
  payment: { guideNumber: "", status: "pendente", guides: [] },
  ...props,
} as unknown as ProcessRecord);

describe("Processos individuais e da unidade na mesa municipal", () => {
  it("não confunde engenheiro externo com servidor interno da prefeitura", () => {
    const process = record("00001", "Protocolo");
    expect(isProcessPersonallyLinked(process, alex)).toBe(false);
    expect(isProcessInMyUnit(process, alex)).toBe(true);
  });
  it("reconhece atribuição, triagem, despacho e auditoria por identidade", () => {
    expect(isProcessPersonallyLinked(record("00001", "Análise Urbanística", {
      analysis: { assignedTo: "Outra pessoa", assignedProfileId: alex.id },
    }), alex)).toBe(true);
    expect(isProcessPersonallyLinked(record("00002", "Protocolo", {
      triage: { status: "em_triagem", assignedTo: "Alex Oliveira Santos" },
    }), alex)).toBe(true);
    expect(isProcessPersonallyLinked(record("00003", "Análise Urbanística", {
      dispatches: [{ id: "d1", from: "Protocolo", to: "Análise", status: "aguardando",
        subject: "Roteamento", dueDate: "", requestedByProfileId: alex.id }],
    }), alex)).toBe(true);
    expect(isProcessPersonallyLinked(record("00004", "Análise Urbanística", {
      auditTrail: [{ id: "a1", actor: "Servidor", actorProfileId: alex.id,
        category: "despacho", title: "Encaminhou", detail: "", visibleToExternal: false, at: "" }],
    }), alex)).toBe(true);
  });
  it("limita Minha unidade à pasta de tramitação e nunca inventa propriedade pessoal", () => {
    const other = record("00005", "Análise Urbanística");
    expect(isProcessInMyUnit(other, alex)).toBe(false);
    expect(isProcessPersonallyLinked(other, alex)).toBe(false);
    expect(hasOperationalUnit({ ...alex, role: "prefeitura_admin" })).toBe(false);
    expect(hasOperationalUnit({ ...alex, role: "master_admin" })).toBe(false);
  });
  it("faz Meus processos e Minha unidade funcionarem com regras distintas e sem registros fictícios", () => {
    const inUnit = record("00001", "Protocolo");
    const personallyHandled = record("00002", "Análise Urbanística", {
      auditTrail: [{ id: "a1", actor: alex.name, actorProfileId: alex.id,
        category: "despacho", title: "Encaminhou", detail: "", visibleToExternal: false, at: "" }],
    });
    const unrelated = record("00003", "Análise Urbanística");
    const { container } = render(
      <MemoryRouter>
        <PremiumProcessRegistry embedded operatorName={alex.name} operator={alex}
          processes={[inUnit, personallyHandled, unrelated]} />
      </MemoryRouter>
    );
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Meus processos" }));
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Minha unidade" }));
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(3);
  });
  it("explica lista pessoal vazia e oferece acesso à pasta da unidade", () => {
    const { container } = render(
      <MemoryRouter><PremiumProcessRegistry embedded operatorName={alex.name} operator={alex}
        processes={[record("00005", "Protocolo")]} /></MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Meus processos" }));
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(0);
    expect(screen.getByText(/Nenhum processo atribuído ou movimentado por esta conta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Minha unidade" }));
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(1);
  });
});
