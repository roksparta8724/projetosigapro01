import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc } }));
import { activateUrbanRegulation } from "@/integrations/backend/urbanPrecheckClient";

describe("SIGAPRO — integridade da ativação normativa", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); });
  it.each(["", "   "])("não envia ativação sem versão válida %j", async id => {
    await expect(activateUrbanRegulation(id)).rejects.toThrow("Versão normativa inválida");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("envia somente o identificador da versão informada", async () => {
    await activateUrbanRegulation("versao-ficticia-a");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("activate_urban_regulation_v1", { _version_id: "versao-ficticia-a" });
  });
  it("propaga falhas de autorização do servidor", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Acesso negado" } });
    await expect(activateUrbanRegulation("versao-ficticia-a")).rejects.toThrow("Acesso negado");
  });
});
