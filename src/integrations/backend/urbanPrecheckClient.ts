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
  await invoke("activate_urban_regulation_v2", { _version_id: versionId });
}

/** Urban matrix staging is an administrative, tenant-scoped read-only preview.
 * Only the Neon RPC may decide which municipality the caller may inspect. */
export type UrbanMatrixBatchSummary = {
  id: string; document_title: string; document_sha256: string;
  source_municipality: string; version: number; status: string;
  total_rows: number; reviewed_rows: number; created_at: string;
};

export type UrbanMatrixBatchDetail = {
  id: string; municipality_id: string; document_title: string;
  document_sha256: string; source_municipality: string;
  source_rows: Array<Record<string, unknown>>;
  reviewed_indexes: number[]; status: string; version: number;
};

export async function listUrbanMatrixBatches(municipalityId: string): Promise<UrbanMatrixBatchSummary[]> {
  if (!municipalityId) return [];
  const result = await invoke<unknown>("list_urban_matrix_batch_staging_v1", { _municipality_id: municipalityId });
  if (!Array.isArray(result)) throw new Error("O histórico de importação retornou um formato inválido.");
  return result as UrbanMatrixBatchSummary[];
}

export async function readUrbanMatrixBatch(
  municipalityId: string, batchId: string,
): Promise<UrbanMatrixBatchDetail | null> {
  const result = await invoke<unknown>("get_urban_matrix_batch_staging_v1", {
    _municipality_id: municipalityId, _batch_id: batchId,
  });
  if (result === null) return null;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Não foi possível conferir a origem das linhas do lote.");
  }
  const item = result as Partial<UrbanMatrixBatchDetail>;
  if (item.municipality_id !== municipalityId || item.id !== batchId ||
      !Array.isArray(item.source_rows) || !Array.isArray(item.reviewed_indexes)) {
    throw new Error("O lote não pertence à prefeitura selecionada ou contém dados incompletos.");
  }
  return item as UrbanMatrixBatchDetail;
}


export type UrbanMatrixReadingAction = "reading_verified" | "needs_correction" | "archive" | "restore";
export type UrbanMatrixRowReadingAudit = {
  id: string;
  batch_id: string;
  row_index: number;
  page_number: number;
  action: "reading_verified" | "needs_correction";
  note: string;
  created_at: string;
  actor_profile_id: string;
};
export type UrbanMatrixBatchEvent = {
  id: string; batch_id: string; action: "archive" | "restore";
  note: string; created_at: string; actor_profile_id: string;
};
export type UrbanMatrixReadingAudit = {
  row_reviews: UrbanMatrixRowReadingAudit[];
  batch_events: UrbanMatrixBatchEvent[];
};

export async function listUrbanMatrixReadingAudit(municipalityId: string): Promise<UrbanMatrixReadingAudit> {
  const raw = await invoke<unknown>("list_urban_matrix_reading_audit_v2", {
    _municipality_id: municipalityId,
  });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("A trilha de conferencia do documento retornou formato invalido.");
  }
  const data = raw as Partial<UrbanMatrixReadingAudit>;
  if (!Array.isArray(data.row_reviews) || !Array.isArray(data.batch_events)) {
    throw new Error("Historico de conferencias ainda nao esta disponivel neste banco.");
  }
  return data as UrbanMatrixReadingAudit;
}

export async function recordUrbanMatrixReadingAction(
  municipalityId: string, batchId: string, documentSha256: string,
  action: UrbanMatrixReadingAction, rowIndex: number | null,
  pageNumber: number | null, note: string,
): Promise<void> {
  if (!municipalityId || !batchId || !/^[a-f0-9]{64}$/.test(documentSha256) ||
    !["reading_verified", "needs_correction", "archive", "restore"].includes(action) ||
    note.trim().length < 20 || note.trim().length > 1200) {
    throw new Error("Confira o documento e informe uma justificativa de 20 a 1200 caracteres.");
  }
  if (action === "reading_verified" || action === "needs_correction") {
    if (!Number.isInteger(rowIndex) || rowIndex === null || rowIndex < 0 ||
      !Number.isInteger(pageNumber) || pageNumber === null || pageNumber < 1) {
      throw new Error("Informe a linha e pagina exatas do documento-fonte.");
    }
  } else if (rowIndex !== null || pageNumber !== null) {
    throw new Error("Arquivamento e restauracao nao alteram indices individuais.");
  }
  await invoke("record_urban_matrix_reading_action_v2", {
    _municipality_id: municipalityId,
    _batch_id: batchId,
    _document_sha256: documentSha256,
    _action: action,
    _row_index: rowIndex,
    _page_number: pageNumber,
    _note: note.trim(),
  });
}


/** Quadro II remains an unverified transcription workspace, never an active legal rule. */
export type UrbanQuadroIIPage = {
  page_number: number;
  topic: string;
  visual_warning: boolean;
  draft_count: number;
};
export type UrbanQuadroIIDraft = {
  id: string;
  page_number: number;
  category_code: string;
  use_description: string;
  permitted_zones_text: string;
  road_hierarchy_text: string;
  parking_requirement_text: string;
  special_conditions_text: string;
  source_excerpt: string;
  status: "draft_unverified";
  created_by_profile_id: string;
  created_at: string;
};
export type UrbanQuadroIIWorkspace = {
  status: "no_source" | "archived_source" | "pending_legal_review";
  batch_id?: string;
  document_title?: string;
  document_sha256?: string;
  pages: UrbanQuadroIIPage[];
  entries: UrbanQuadroIIDraft[];
  legal_approval?: false;
  ready_for_ai?: false;
};
export type UrbanQuadroIIDraftInput = {
  pageNumber: number;
  categoryCode: string;
  useDescription: string;
  permittedZones: string;
  roadHierarchy: string;
  parkingRequirement: string;
  specialConditions: string;
  sourceExcerpt: string;
};
export async function listUrbanQuadroIIWorkspace(municipalityId: string): Promise<UrbanQuadroIIWorkspace> {
  if (!municipalityId) throw new Error("Selecione uma prefeitura antes de acessar o Quadro II.");
  const raw = await invoke<unknown>("list_urban_quadro_ii_workspace_v1", { _municipality_id: municipalityId });
  if (!raw || Array.isArray(raw) || typeof raw !== "object") throw new Error("Resposta inválida da matriz Quadro II.");
  const result = raw as Partial<UrbanQuadroIIWorkspace>;
  if (!["no_source", "archived_source", "pending_legal_review"].includes(String(result.status)) ||
      !Array.isArray(result.pages) || !Array.isArray(result.entries)) {
    throw new Error("O acervo do Quadro II não retornou a estrutura esperada.");
  }
  if (result.status === "pending_legal_review" &&
    (!result.batch_id || !/^[a-f0-9]{64}$/.test(result.document_sha256 || ""))) {
    throw new Error("Quadro II sem vínculo verificável com documento oficial.");
  }
  return result as UrbanQuadroIIWorkspace;
}
export async function saveUrbanQuadroIIDraft(
  municipalityId: string, batchId: string, documentSha256: string,
  entry: UrbanQuadroIIDraftInput, requestId: string,
): Promise<void> {
  if (!municipalityId || !batchId || !/^[a-f0-9]{64}$/.test(documentSha256) ||
    !Number.isInteger(entry.pageNumber) || entry.pageNumber < 38 || entry.pageNumber > 51 ||
    !entry.categoryCode.trim() || entry.categoryCode.trim().length > 32 ||
    entry.useDescription.trim().length < 5 || entry.useDescription.trim().length > 200 ||
    entry.sourceExcerpt.trim().length < 20 || entry.sourceExcerpt.trim().length > 1600 ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId)) {
    throw new Error("Confira página, classificação, descrição e trecho literal no PDF antes de arquivar.");
  }
  await invoke("save_urban_quadro_ii_draft_entry_v1", {
    _municipality_id: municipalityId,
    _batch_id: batchId,
    _document_sha256: documentSha256,
    _page_number: entry.pageNumber,
    _category_code: entry.categoryCode.trim(),
    _use_description: entry.useDescription.trim(),
    _permitted_zones_text: entry.permittedZones.trim(),
    _road_hierarchy_text: entry.roadHierarchy.trim(),
    _parking_requirement_text: entry.parkingRequirement.trim(),
    _special_conditions_text: entry.specialConditions.trim(),
    _source_excerpt: entry.sourceExcerpt.trim(),
    _request_id: requestId,
  });
}

export type UrbanPrecheckHistoryEntry = {
  id: string; municipality_id: string; process_id: string; regulation_version_id: string;
  measurements: UrbanMeasurements; reviewer_profile_id: string; created_at: string;
};
export async function listUrbanPrecheckHistory(processId: string): Promise<UrbanPrecheckHistoryEntry[]> {
  const response = await invoke<unknown>("list_urban_prechecks_v1", { _process_id: processId });
  if (!Array.isArray(response)) throw new Error("Histórico de pré-análises indisponível.");
  return response as UrbanPrecheckHistoryEntry[];
}

/**
 * Production Neon uses the reviewed, idempotent v5 writer. The earlier v1
 * writer is intentionally REVOKED. Never fall back to it.
 * Review evidence is empty here because legal/exceptional cases require
 * a separate authenticated legal-evidence validation flow.
 */
export async function saveUrbanPrecheckRun(
  processId: string, versionId: string, referenceDate: string, measurements: UrbanMeasurements,
  requestId: string,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error("Data legal inválida.");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestId)) throw new Error("Identificador de gravação inválido.");
  await invoke("save_urban_precheck_run_v5", {
    _process_id: processId,
    _regulation_version_id: versionId,
    _reference_date: referenceDate,
    _measurements: measurements,
    _legal_review: { evidence_ids: [], note: "", document_scope_confirmed: false },
    _request_id: requestId,
  });
}
