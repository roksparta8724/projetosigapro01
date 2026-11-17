// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CreateProcessMarkerDialog } from "@/components/platform/CreateProcessMarkerDialog";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const file = (path: string) => readFileSync(path, "utf8");
const record = {
  id: "e1d319ac-09f9-4b88-b86d-a9436eab0808",
  tenantId: "t", municipalityId: "m", isOfficial: true,
  protocol: "PM-2026-00001", externalProtocol: "",
  title: "Licenciamento Urbanístico", status: "analise_tecnica",
  technicalLead: "Ana", ownerName: "Proprietário", type: "aprovacao",
  analysis: { assignedTo: "Ana" }, tags: [],
  requirements: [], dispatches: [], timeline: [],
  sla: { currentStage: "Análise Urbanística", dueDate: "", breached: false, hoursRemaining: 50 },
  payment: { guideNumber: "", status: "pendente", guides: [] },
} as unknown as ProcessRecord;

describe("SEI — marcadores pela mesa e conclusão restrita à unidade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria marcador com a cor e o ícone escolhidos na própria mesa", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    render(<CreateProcessMarkerDialog open onOpenChange={vi.fn()}
      existingNames={["Favorito"]} selectedCount={0} onCreate={create} />);
    fireEvent.change(screen.getByLabelText("Nome do marcador"), { target: { value: "Revisão da unidade" } });
    fireEvent.click(screen.getByRole("button", { name: "Vermelho critico" }));
    fireEvent.change(screen.getByLabelText("Símbolo opcional"), { target: { value: "⭐" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar marcador" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      label: "Revisão da unidade", color: "#dc2626", colorId: "red", emoji: "⭐",
    }, false));
  });

  it("impede duplicar um modelo existente, sem sobrescrever a pasta pessoal", () => {
    const create = vi.fn().mockResolvedValue(undefined);
    render(<CreateProcessMarkerDialog open onOpenChange={vi.fn()}
      existingNames={["Favorito"]} selectedCount={0} onCreate={create} />);
    fireEvent.change(screen.getByLabelText("Nome do marcador"), { target: { value: " favorito " } });
    fireEvent.click(screen.getByRole("button", { name: "Criar marcador" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe um marcador");
    expect(create).not.toHaveBeenCalled();
  });

  it("só permite concluir na unidade quando selecionado e autorizado", () => {
    const action = vi.fn();
    const create = vi.fn();
    const { container, rerender } = render(<MemoryRouter><PremiumProcessRegistry
      processes={[record]} onCreateMarker={create} onUnitAction={action}
      unitDataReady unitCompletedIds={[]}
      canDispatchProcess={() => true} /></MemoryRouter>);
    const localAction = screen.getByRole("button", { name: "Concluir nesta unidade" });
    expect(localAction).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Novo marcador" }));
    expect(create).toHaveBeenCalledOnce();
    const rowCheckbox = container.querySelector<HTMLInputElement>(
      '[data-sei-process-row="true"] input[type="checkbox"]'
    );
    expect(rowCheckbox).not.toBeNull();
    fireEvent.click(rowCheckbox!);
    expect(screen.getByRole("button", { name: "Concluir nesta unidade" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Concluir nesta unidade" }));
    expect(action).toHaveBeenCalledWith([record], true);
    rerender(<MemoryRouter><PremiumProcessRegistry
      processes={[record]} onCreateMarker={create} onUnitAction={action}
      unitDataReady unitCompletedIds={[record.id]}
      canDispatchProcess={() => false} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Reabrir na unidade" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reabrir na unidade" }));
    expect(action).toHaveBeenLastCalledWith([record], false);
  });

  it("não habilita conclusão ou criação para administradores municipais somente leitura", () => {
    const { container } = render(<MemoryRouter><PremiumProcessRegistry
      processes={[record]} canDispatchProcess={() => false}
      unitDataReady={false} /></MemoryRouter>);
    expect(container.querySelector('[data-unit-completion-action="true"]')).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Novo marcador" })).toBeNull();
  });

  it("a consulta e a gravação usam somente RPC autenticada, nunca localStorage", () => {
    const client = file("src/integrations/backend/processUnitCompletionClient.ts");
    expect(client).toContain('db.rpc("list_my_process_unit_completions_v1")');
    expect(client).toContain('db.rpc("set_my_process_unit_completion_v1"');
    expect(client).not.toContain("localStorage");
    const page = file("src/pages/saas/MunicipalProcessRegistryPage.tsx");
    expect(page).toContain('["abertos", "Em andamento nesta unidade"]');
    expect(page).toContain('["concluidos", "Concluídos nesta unidade"]');
    expect(page).toContain("setMyUnitProcessCompletion(process.id, action.completed)");
    expect(page).toContain("setPendingUnitAction({ processes: selected, completed })");
    expect(page).toContain("setPendingUnitAction({ processes: [...batchSelected], completed: true })");
    expect(page).toContain("canCompleteInMyUnit(process)");
    expect(page).toContain("unitSyncState === \"ready\"");
  });

  it("migração isola unidade, perfil e prefeitura, guarda auditoria e não muda status municipal", () => {
    const sql = file("neon/migrations/20261117_unit_local_process_completion_sei_v1.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.process_unit_completions");
    expect(sql).toContain("PRIMARY KEY (process_id,unit_key)");
    expect(sql).toContain("public.current_profile_id()");
    expect(sql).toContain("public.profile_operational_area(_profile_id)");
    expect(sql).toContain("public.profile_has_process_access(_process_id,_profile_id)");
    expect(sql).toContain("public.process_audit_entries");
    expect(sql).toContain("public.interdepartmental_dispatches d");
    expect(sql).toContain("d.from_department");
    expect(sql).toContain("d.tenant_id=_process.tenant_id");
    expect(sql).toContain("municipality_id");
    expect(sql).toContain("REVOKE ALL ON public.process_unit_completions FROM PUBLIC,authenticated");
    expect(sql).not.toContain("PUBLIC,anon,authenticated");
    expect(sql).toContain("_old.status = (CASE WHEN _completed THEN 'concluido' ELSE 'reaberto' END) THEN");
    expect(sql).not.toMatch(/UPDATE\s+public\.processes\s+SET/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.processes/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.processes/i);
  });

  it("não oferece conclusão quando a unidade ainda não foi confirmada pelo Neon", () => {
    const action = vi.fn();
    const { container } = render(<MemoryRouter><PremiumProcessRegistry
      processes={[record]} canDispatchProcess={() => true}
      onUnitAction={action} unitDataReady={false}
    /></MemoryRouter>);
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-sei-process-row="true"] input[type="checkbox"]'
    );
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);
    expect(screen.getByRole("button", { name: "Concluir nesta unidade" })).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });

  it("exige autoria do despacho para encerrar a unidade de origem com nome alternativo", () => {
    const page = file("src/pages/saas/MunicipalProcessRegistryPage.tsx");
    const sql = file("neon/migrations/20261117_unit_sender_alias_fix_v2.sql");
    expect(page).toContain("dispatch.requestedByProfileId === session.id");
    expect(sql).toContain("d.created_by_profile_id=_profile_id");
    expect(sql).toContain("public.operational_area_from_label(d.from_department)=_area");
    expect(sql).not.toMatch(/UPDATE\\s+public\\.processes\\s+SET/i);
    expect(sql).not.toMatch(/DELETE\\s+FROM\\s+public\\.processes/i);
  });


  it("habilita conclusão à unidade remetente após despacho mesmo sem poder encaminhar novamente", () => {
    const action = vi.fn();
    const { container } = render(<MemoryRouter><PremiumProcessRegistry
      processes={[record]} canDispatchProcess={() => false}
      canCompleteInUnit={() => true} unitDataReady
      onUnitAction={action}
    /></MemoryRouter>);
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-sei-process-row="true"] input[type="checkbox"]'
    );
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);
    const button = screen.getByRole("button", { name: "Concluir nesta unidade" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(action).toHaveBeenCalledWith([record], true);
  });

});
