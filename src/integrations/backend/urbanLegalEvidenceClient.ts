import { backendClient } from "@/integrations/backend/databaseClient";
import {
  validateLegalEvidenceDraft, type UrbanLegalEvidence,
} from "@/lib/urbanLegalKnowledge";
import type { UrbanMetric } from "@/lib/urbanPrecheck";

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!backendClient) throw new Error("Banco de normas municipais indisponível.");
  const { data, error } = await backendClient.rpc(name, args);
  if (error) throw new Error("Acervo legal: " + (error.message || String(error)));
  return data as T;
}

export async function listUrbanLegalEvidence(municipalityId: string): Promise<UrbanLegalEvidence[]> {
  if (!municipalityId) return [];
  const result = await call<unknown>("list_urban_legal_evidence_v1", {
    _municipality_id: municipalityId,
  });
  if (!Array.isArray(result)) throw new Error("Resposta do acervo legal municipal inválida.");
  return result as UrbanLegalEvidence[];
}

export async function confirmUrbanLegalEvidence(input: {
  municipalityId: string;
  documentTitle: string;
  documentSha256: string;
  pageNumber: number;
  metric: UrbanMetric;
  excerpt: string;
}): Promise<void> {
  validateLegalEvidenceDraft({
    title: input.documentTitle, hash: input.documentSha256,
    page: input.pageNumber, metric: input.metric, excerpt: input.excerpt,
  });
  if (!input.municipalityId) throw new Error("Prefeitura não identificada.");
  await call("save_urban_legal_evidence_v1", {
    _municipality_id: input.municipalityId,
    _document_title: input.documentTitle,
    _document_sha256: input.documentSha256,
    _page_number: input.pageNumber,
    _metric: input.metric,
    _excerpt: input.excerpt,
  });
}
