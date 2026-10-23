import { backendClient } from "@/integrations/backend/databaseClient";
import { normalizeUrbanCode, validateUrbanRules, type UrbanMeasurements, type UrbanRegulationVersion, type UrbanRule } from "@/lib/urbanPrecheck";

async function invoke<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!backendClient) throw new Error("Banco municipal indisponível.");
  const { data, error } = await backendClient.rpc(name, args);
  if (error) throw new Error("Banco municipal: " + (error.message || String(error)));
  return data as T;
}

export async function listUrbanRegulations(municipalityId: string): Promise<UrbanRegulationVersion[]> {
  const response = await invoke<unknown>("list_urban_regulation_versions_v1", { _municipality_id: municipalityId });
  if (!Array.isArray(response)) throw new Error("Resposta inválida do cadastro legal municipal.");
  return response as UrbanRegulationVersion[];
}

export async function saveUrbanRegulationDraft(
  municipalityId: string, zone: string, usage: string, effectiveFrom: string, rules: UrbanRule[],
): Promise<void> {
  if (!zone.trim() || !usage.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || !validateUrbanRules(rules)) {
    throw new Error("Informe zona, uso, vigência, limites e referência legal para cada parâmetro.");
  }
  await invoke("save_urban_regulation_draft_v1", {
    _municipality_id: municipalityId, _zone_code: normalizeUrbanCode(zone),
    _use_code: normalizeUrbanCode(usage), _effective_from: effectiveFrom, _rules: rules,
  });
}

export async function activateUrbanRegulation(versionId: string): Promise<void> {
  await invoke("activate_urban_regulation_v1", { _version_id: versionId });
}

export type UrbanPrecheckHistoryEntry = {
  id: string; municipality_id: string; process_id: string; regulation_version_id: string;
  measurements: UrbanMeasurements; reference_date: string | null; reviewer_profile_id: string; created_at: string;
};
export async function listUrbanPrecheckHistory(processId: string): Promise<UrbanPrecheckHistoryEntry[]> {
  const response = await invoke<unknown>("list_urban_prechecks_v1", { _process_id: processId });
  if (!Array.isArray(response)) throw new Error("Histórico de pré-análises indisponível.");
  return response as UrbanPrecheckHistoryEntry[];
}

export async function saveUrbanPrecheckRun(
  processId: string, versionId: string, referenceDate: string, measurements: UrbanMeasurements,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error("Data legal inválida.");
  await invoke("save_urban_precheck_run_v2", {
    _process_id: processId, _regulation_version_id: versionId,
    _reference_date: referenceDate, _measurements: measurements,
  });
}
