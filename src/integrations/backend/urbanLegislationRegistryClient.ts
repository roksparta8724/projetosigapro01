import { backendClient } from "@/integrations/backend/databaseClient";

export const LAW_KINDS = [
  { value: "lei_complementar", label: "Lei complementar" },
  { value: "lei_ordinaria", label: "Lei ordinária" },
  { value: "decreto", label: "Decreto" },
  { value: "plano_diretor", label: "Plano diretor" },
  { value: "mapa", label: "Mapa oficial" },
  { value: "anexo", label: "Anexo ou quadro" },
  { value: "portaria", label: "Portaria" },
  { value: "projeto_de_lei", label: "Projeto de lei (sem vigência)" },
  { value: "outro", label: "Outro documento normativo" },
] as const;
export const LAW_SCOPES = [
  { value: "geral", label: "Diretrizes gerais" },
  { value: "aprovacao_ordinaria", label: "Aprovação de obras novas" },
  { value: "habite_se", label: "Habite-se" },
  { value: "parcelamento", label: "Parcelamento do solo" },
  { value: "regularizacao", label: "Regularização especial" },
  { value: "direito_real_laje", label: "Direito real de laje" },
  { value: "zoneamento", label: "Zoneamento" },
  { value: "plano_diretor", label: "Plano diretor" },
  { value: "historico", label: "Histórico / sem vigência comprovada" },
] as const;
export const LAW_RELATIONS = [
  { value: "altera", label: "Altera" },
  { value: "revoga", label: "Revoga" },
  { value: "regulamenta", label: "Regulamenta" },
  { value: "complementa", label: "Complementa" },
  { value: "consolida", label: "Consolida" },
  { value: "substitui", label: "Substitui" },
] as const;

export type LawKind = typeof LAW_KINDS[number]["value"];
export type LawScope = typeof LAW_SCOPES[number]["value"];
export type LawRelation = typeof LAW_RELATIONS[number]["value"];

export type LawRegistryItem = {
  id: string;
  municipality_id: string;
  document_kind: LawKind;
  document_number: string;
  document_year: number;
  revision: number;
  title: string;
  legal_scope: LawScope;
  official_source_url: string | null;
  publication_date: string | null;
  effective_from: string | null;
  related_document_id: string | null;
  relation_type: LawRelation | null;
  storage_key: string;
  file_name: string;
  file_size_bytes: number;
  sha256: string;
  verification_status: "pending_legal_review" | "proposal_not_enacted";
  ready_for_ai: false;
  archived: boolean;
  created_by_profile_id: string;
  created_at: string;
};
export type LawRegistryInput = {
  documentKind: LawKind;
  documentNumber: string;
  documentYear: number;
  title: string;
  legalScope: LawScope;
  officialSourceUrl: string;
  publicationDate: string;
  effectiveFrom: string;
  relatedDocumentId: string;
  relationType: string;
  storageKey: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
};
export function validateLawRegistryInput(
  municipalityId: string, data: LawRegistryInput,
): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(municipalityId)) return "Selecione uma prefeitura válida.";
  if (!LAW_KINDS.some((item) => item.value === data.documentKind) ||
      !LAW_SCOPES.some((item) => item.value === data.legalScope)) {
    return "Confira tipo e finalidade da norma.";
  }
  if (!data.documentNumber.trim() || data.documentNumber.trim().length > 50 ||
      !Number.isInteger(data.documentYear) || data.documentYear < 1900 ||
      data.documentYear > 2100 || data.title.trim().length < 8 ||
      data.title.trim().length > 250) return "Informe número, ano e título completos.";
  if ([data.publicationDate, data.effectiveFrom].some(
    (date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return "Informe as datas oficiais no formato correto.";
  }
  if (data.officialSourceUrl && (!/^https:\/\/[^\s]+$/i.test(data.officialSourceUrl) ||
      data.officialSourceUrl.length > 1200)) {
    return "A fonte oficial precisa ser um endereço https://.";
  }
  if (Boolean(data.relatedDocumentId) !== Boolean(data.relationType) ||
      (data.relationType && !LAW_RELATIONS.some((item) =>
        item.value === data.relationType))) {
    return "Indique a norma relacionada e como ela é afetada, ou deixe ambos vazios.";
  }
  if (!data.storageKey.startsWith("municipalities/" + municipalityId + "/legislation-registry/") ||
      data.storageKey.length > 1200 || !data.fileName.toLowerCase().endsWith(".pdf") ||
      data.fileName.length > 255 || data.fileSizeBytes < 1 ||
      data.fileSizeBytes > 100 * 1024 * 1024 ||
      !/^[0-9a-f]{64}$/.test(data.sha256)) {
    return "PDF, tamanho, município ou SHA-256 inválido.";
  }
  return null;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!backendClient) throw new Error("Banco municipal indisponível.");
  const { data, error } = await backendClient.rpc(name, args);
  if (error) throw new Error(error.message || String(error));
  return data as T;
}
export async function listLawRegistry(
  municipalityId: string, offset = 0,
): Promise<{ items: LawRegistryItem[]; total: number; next_offset: number | null }> {
  const result = await rpc<unknown>("list_urban_legislation_documents_v1", {
    _municipality_id: municipalityId, _offset: offset, _limit: 50,
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Resposta inválida do acervo legislativo.");
  }
  const page = result as { items?: unknown; total?: unknown; next_offset?: unknown };
  if (!Array.isArray(page.items) || typeof page.total !== "number") {
    throw new Error("A consulta ao acervo retornou dados incompletos.");
  }
  return {
    items: page.items as LawRegistryItem[], total: page.total,
    next_offset: typeof page.next_offset === "number" ? page.next_offset : null,
  };
}
export async function registerLaw(
  municipalityId: string, data: LawRegistryInput, requestId: string,
): Promise<{ id: string; revision: number; ready_for_ai: false }> {
  const error = validateLawRegistryInput(municipalityId, data);
  if (error) throw new Error(error);
  return rpc("register_urban_legislation_document_v1", {
    _municipality_id: municipalityId, _payload: data, _request_id: requestId,
  });
}
export async function setLawArchived(
  municipalityId: string, id: string, archive: boolean, reason: string,
): Promise<void> {
  if (reason.trim().length < 12 || reason.trim().length > 1000) {
    throw new Error("A justificativa deve ter entre 12 e 1000 caracteres.");
  }
  await rpc("set_urban_legislation_archive_v1", {
    _municipality_id: municipalityId, _document_id: id,
    _action: archive ? "archive" : "restore",
    _reason: reason.trim(), _request_id: crypto.randomUUID(),
  });
}
