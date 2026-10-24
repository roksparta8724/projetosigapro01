import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc } }));
import { listUrbanRegulations } from "@/integrations/backend/urbanPrecheckClient";

const valid = {
  id: "rule-1", municipality_id: "municipality-a", zone_code: "ZR1",
  use_code: "RES", effective_from: "2020-01-01", version: 1, status: "active",
  rules: [{ metric: "front_setback_m", limit: 5, reference: "Lei municipal fictícia 123/2020" }],
};
describe("SIGAPRO — consulta de legislação isolada por prefeitura", () => {
  beforeEach(() => rpc.mockReset());
  it.each(["", "   "])("não executa consulta sem prefeitura: %j", async municipalityId => {
    await expect(listUrbanRegulations(municipalityId)).rejects.toThrow("Prefeitura inválida");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("aceita normas da prefeitura solicitada", async () => {
    rpc.mockResolvedValueOnce({ data: [valid], error: null });
    await expect(listUrbanRegulations("municipality-a")).resolves.toEqual([valid]);
    expect(rpc).toHaveBeenCalledWith("list_urban_regulation_versions_v1", { _municipality_id: "municipality-a" });
  });
  it("rejeita resposta com legislação de outra prefeitura", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...valid, municipality_id: "municipality-b" }], error: null });
    await expect(listUrbanRegulations("municipality-a")).rejects.toThrow("inconsistente");
  });
  it("não interpreta falha do banco como cadastro vazio", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Conexão indisponível" } });
    await expect(listUrbanRegulations("municipality-a")).rejects.toThrow("Conexão indisponível");
  });
});
