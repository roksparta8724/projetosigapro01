import { backendClient } from "@/integrations/backend/databaseClient";

export type OfficialAnalysisSheetRead = {
  found: boolean;
  revision: number;
  payload: Record<string, unknown> | null;
  updated_at?: string | null;
  updated_by_profile_id?: string | null;
};

export async function readOfficialAnalysisSheet(processId: string): Promise<OfficialAnalysisSheetRead> {
  const { data, error } = await backendClient.rpc("get_process_analysis_sheet_v2", {
    _process_id: processId,
  });
  if (error) {
    throw new Error("Ficha oficial indisponível no banco: " + (error.message || String(error)));
  }
  const result = (data || {}) as Partial<OfficialAnalysisSheetRead>;
  const revision = Number(result.revision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Revisão da ficha oficial inválida.");
  }
  return {
    found: result.found === true,
    revision,
    payload: result.payload && typeof result.payload === "object" ? result.payload : null,
    updated_at: result.updated_at,
    updated_by_profile_id: result.updated_by_profile_id,
  };
}

export async function writeOfficialAnalysisSheet(
  processId: string,
  payload: Record<string, unknown>,
  expectedRevision: number,
): Promise<number> {
  const { data, error } = await backendClient.rpc("save_process_analysis_sheet_v2", {
    _process_id: processId,
    _payload: payload,
    _expected_revision: expectedRevision,
  });
  if (error) {
    throw new Error("O banco não confirmou o salvamento da ficha: " + (error.message || String(error)));
  }
  const revision = Number((data as { revision?: number } | null)?.revision);
  if (!Number.isSafeInteger(revision) || revision <= expectedRevision) {
    throw new Error("Revisão oficial não confirmada após a gravação.");
  }
  return revision;
}
