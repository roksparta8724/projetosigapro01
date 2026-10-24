import { isValidUrbanReferenceDate } from "@/lib/urbanPrecheckAssist";
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
  if (!zone.trim() || !usage.trim() || !isValidUrbanReferenceDate(effectiveFrom, "9999-12-31") || !validateUrbanRules(rules)) {
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
  legal_review?: {
    evidence_ids?: string[];
    note?: string;
    document_scope_confirmed?: boolean;
    reviewed_by_profile_id?: string;
    reviewed_at?: string;
  };
};
export async function listUrbanPrecheckHistory(processId: string): Promise<UrbanPrecheckHistoryEntry[]> {
  const response = await invoke<unknown>("list_urban_prechecks_v1", { _process_id: processId });
  if (!Array.isArray(response)) throw new Error("Histórico de pré-análises indisponível.");
  return response as UrbanPrecheckHistoryEntry[];
}

export async function saveUrbanPrecheckRun(
  processId: string, versionId: string, referenceDate: string, measurements: UrbanMeasurements,
  legalReview: { evidenceIds: string[]; note: string; documentScopeConfirmed: boolean },
): Promise<void> {
  if (!isValidUrbanReferenceDate(referenceDate, new Date().toISOString().slice(0, 10))) throw new Error("Data legal inválida.");
  if (!Array.isArray(legalReview.evidenceIds) || legalReview.evidenceIds.length > 50 ||
      legalReview.note.length > 1200) throw new Error("Revisão legal incompleta ou excessiva.");
  await invoke("save_urban_precheck_run_v4", {
    _process_id: processId, _regulation_version_id: versionId,
    _reference_date: referenceDate, _measurements: measurements,
    _legal_review: {
      evidence_ids: legalReview.evidenceIds,
      note: legalReview.note,
      document_scope_confirmed: legalReview.documentScopeConfirmed,
    },
  });
}
