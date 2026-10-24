import { isValidUrbanReferenceDate } from "@/lib/urbanPrecheckAssist";
import { backendClient } from "@/integrations/backend/databaseClient";
import { normalizeUrbanCode, validateUrbanRules, URBAN_METRICS, type UrbanMeasurements, type UrbanRegulationVersion, type UrbanRule } from "@/lib/urbanPrecheck";

async function invoke<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!backendClient) throw new Error("Banco municipal indisponível.");
  const { data, error } = await backendClient.rpc(name, args);
  if (error) throw new Error("Banco municipal: " + (error.message || String(error)));
  return data as T;
}

export async function listUrbanRegulations(municipalityId: string): Promise<UrbanRegulationVersion[]> {
  const response = await invoke<unknown>("list_urban_regulation_versions_v1", { _municipality_id: municipalityId });
  if (!Array.isArray(response)) throw new Error("Resposta inválida do cadastro legal municipal.");
  if (response.some((item) => !item || typeof item !== "object" ||
    item.municipality_id !== municipalityId ||
    typeof item.id !== "string" || !item.id ||
    typeof item.zone_code !== "string" || !item.zone_code ||
    typeof item.use_code !== "string" || !item.use_code ||
    !validateUrbanRules(item.rules) ||
    !["draft", "active", "superseded"].includes(item.status) ||
    !Number.isInteger(item.version) || item.version < 1 ||
    !isValidUrbanReferenceDate(item.effective_from, "9999-12-31"))) {
    throw new Error("Cadastro legal inconsistente para esta prefeitura.");
  }
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
  // The RPC enforces tenant access. Validate its response as a second boundary:
  // never display a row belonging to a different process or malformed history.
  if (response.some((entry) => !entry || typeof entry !== "object" ||
    entry.process_id !== processId ||
    typeof entry.id !== "string" || !entry.id ||
    typeof entry.municipality_id !== "string" || !entry.municipality_id ||
    typeof entry.regulation_version_id !== "string" || !entry.regulation_version_id ||
    typeof entry.measurements !== "object" || entry.measurements === null ||
    Array.isArray(entry.measurements))) {
    throw new Error("Histórico de pré-análises inconsistente para este processo.");
  }
  return response as UrbanPrecheckHistoryEntry[];
}

export async function saveUrbanPrecheckRun(
  processId: string, versionId: string, referenceDate: string, measurements: UrbanMeasurements,
  legalReview: { evidenceIds: string[]; note: string; documentScopeConfirmed: boolean },
): Promise<void> {
  if (!isValidUrbanReferenceDate(referenceDate, new Date().toISOString().slice(0, 10))) throw new Error("Data legal inválida.");
  if (!legalReview || typeof legalReview !== "object" || !Array.isArray(legalReview.evidenceIds) ||
      legalReview.evidenceIds.length > 50 || typeof legalReview.note !== "string" ||
      legalReview.note.length > 1200) throw new Error("Revisão legal incompleta ou excessiva.");
  const validMetrics = new Set<string>(URBAN_METRICS.map(item => item.key));
  if (!measurements || typeof measurements !== "object" || Array.isArray(measurements)) {
    throw new Error("Medições inválidas: informe as leituras documentadas.");
  }
  const entries = Object.entries(measurements);
  if (!entries.length || entries.length > URBAN_METRICS.length || entries.some(([metric, entry]) =>
    !validMetrics.has(metric) || !entry || typeof entry !== "object" ||
    !Number.isFinite(entry.value) || entry.value < 0 ||
    (metric === "floor_count" && !Number.isInteger(entry.value)) ||
    typeof entry.evidence !== "string" || entry.evidence.trim().length < 3 ||
    entry.evidence.length > 500
  )) throw new Error("Medições inválidas: confira valores e provas documentais.");
  if (legalReview.evidenceIds.some(id => typeof id !== "string" || !id.trim() || id.length > 128) ||
      new Set(legalReview.evidenceIds).size !== legalReview.evidenceIds.length ||
      typeof legalReview.note !== "string" || typeof legalReview.documentScopeConfirmed !== "boolean") {
    throw new Error("Revisão legal inválida.");
  }
  if (!processId.trim() || !versionId.trim()) throw new Error("Processo ou versão normativa inválida.");
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
