import { databaseClient as db } from "@/integrations/backend/databaseClient";

export type UnitProcessCompletion = {
  process_id: string;
  status: "concluido" | "reaberto";
  unit_name: string;
  updated_at: string;
};

function readCompletion(value: unknown): UnitProcessCompletion {
  if (!value || typeof value !== "object") throw new Error("Resposta de unidade inválida.");
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (typeof record.process_id !== "string" ||
      (status !== "concluido" && status !== "reaberto")) {
    throw new Error("Resposta de conclusão da unidade inválida.");
  }
  return {
    process_id: record.process_id,
    status,
    unit_name: typeof record.unit_name === "string" ? record.unit_name : "",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
  };
}

export async function listMyUnitProcessCompletions(): Promise<UnitProcessCompletion[]> {
  const { data, error } = await db.rpc("list_my_process_unit_completions_v1");
  if (error) throw new Error(error.message || "Não foi possível consultar a unidade.");
  if (!Array.isArray(data)) throw new Error("Resposta de unidade não disponível.");
  return data.map(readCompletion);
}

export async function setMyUnitProcessCompletion(
  processId: string, completed: boolean,
): Promise<UnitProcessCompletion> {
  if (!processId.trim()) throw new Error("Processo não identificado.");
  const { data, error } = await db.rpc("set_my_process_unit_completion_v1", {
    _process_id: processId,
    _completed: completed,
  });
  if (error) throw new Error(error.message || "A conclusão da unidade não foi gravada.");
  return readCompletion(data);
}
