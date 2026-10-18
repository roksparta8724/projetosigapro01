import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = read("src/pages/saas/ProcessDetailPage.tsx");
const backend = read("src/integrations/backend/platformImpl.ts");
const migration = read("neon/migrations/20261018_process_dispatch_end_to_end.sql");
const routeGuard = read("neon/migrations/20261018_protocol_dispatch_route_guard.sql");

describe("process dispatch end-to-end workflow", () => {
  it("allows governed municipal administration to forward through the official organogram", () => {
    expect(page).toContain("{ allowMunicipalAdmin: true }");
    expect(page).toContain("Governança administrativa da Prefeitura");
    expect(page).toContain("pode realizar o encaminhamento institucional pelo organograma");
  });

  it("keeps the dispatch button transactional and gives visible feedback", () => {
    expect(page).toContain('processActionBusy === "dispatch"');
    expect(page).toContain('"Encaminhando..."');
    expect(page).toContain('data-dispatch-feedback="true"');
    expect(page).toContain("Processo encaminhado com sucesso para");
  });

  it("does not replace the real business status with a parallel dispatch status", () => {
    expect(migration).toContain("_next_status := _process.status");
    expect(migration).not.toContain("set status='despacho_intersetorial'");
    expect(migration).toContain("current_department=_destination.name");
    expect(migration).toContain("current_queue=_destination.name");
  });

  it("promotes Protocol to Urban Analysis only after documents and the protocol guide are valid", () => {
    expect(migration).toContain("Existem documentos obrigatórios pendentes");
    expect(migration).toContain("A Guia de Protocolo ainda não está compensada");
    expect(migration).toContain("_next_status := 'analise_tecnica'::public.process_status");
    expect(migration).toContain("_next_triage_status := 'concluido'");
  });

  it("validates destination ownership and receipt against the official municipal structure", () => {
    expect(migration).toContain("public.departments");
    expect(migration).toContain("O destino selecionado não pertence ao organograma ativo desta Prefeitura");
    expect(migration).toContain("Somente a unidade de destino pode confirmar o recebimento");
    expect(migration).toContain("Somente a unidade de destino pode concluir este despacho");
  });

  it("prevents initial Habite-se triage from being routed to Administration by mistake", () => {
    expect(page).toContain("requiresInitialUrbanAnalysisDispatch");
    expect(page).toContain("initialUrbanAnalysisDestination");
    expect(page).toContain("Fluxo inicial do Habite-se: encaminhe para Análise Urbanística.");
    expect(page).toContain("Nesta etapa, o Habite-se deve sair do Protocolo diretamente para a Análise Urbanística.");
    expect(routeGuard).toContain("guard_initial_protocol_dispatch_route");
    expect(routeGuard).toContain("_process.status = 'triagem'::public.process_status");
    expect(routeGuard).toContain("coalesce(_origin_area,'') = 'protocolos'");
    expect(routeGuard).toContain("coalesce(_destination_area,'') <> 'analise'");
  });

  it("surfaces database validation errors instead of hiding them behind a generic message", () => {
    expect(backend).toContain("throw new Error(formatDatabaseError(error))");
  });
});
