import { backendClient } from "@/integrations/backend/databaseClient";
import type {
  ConstructionPermitFormData,
  ConstructionPermitRecord,
} from "@/lib/constructionPermit";

type PermitRpcRow = {
  process_id: string;
  municipality_id: string;
  permit_number: string;
  form_data?: ConstructionPermitFormData | null;
  status?: string | null;
  signature_mode?: "electronic" | "manual" | null;
  director_requested_at?: string | null;
  manual_pdf_prepared_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function mapPermit(row: PermitRpcRow | null | undefined): ConstructionPermitRecord | null {
  if (!row) return null;

  return {
    processId: row.process_id,
    municipalityId: row.municipality_id,
    permitNumber: row.permit_number,
    status:
      row.status === "awaiting_director"
        ? "aguardando_diretor"
        : row.status === "manual_signature"
          ? "assinatura_manual"
          : row.status === "signed"
            ? "emitido"
            : "rascunho",
    preparedAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    formData: row.form_data ?? undefined,
    signatureMode: row.signature_mode ?? undefined,
    directorRequestedAt: row.director_requested_at ?? undefined,
    manualPdfPreparedAt: row.manual_pdf_prepared_at ?? undefined,
  };
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "details", "detail", "hint", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

export async function getOfficialConstructionPermit(
  processId: string,
): Promise<ConstructionPermitRecord | null> {
  const { data, error } = await backendClient.rpc("get_construction_permit_v1", {
    _process_id: processId,
  });

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível carregar o Alvará oficial."),
    );
  }

  const raw = (data ?? {}) as { permit?: PermitRpcRow | null };
  return mapPermit(raw.permit);
}

export async function saveOfficialConstructionPermitDraft(input: {
  processId: string;
  permitNumber: string;
  formData: ConstructionPermitFormData;
}): Promise<ConstructionPermitRecord> {
  const { data, error } = await backendClient.rpc(
    "save_construction_permit_draft_v1",
    {
      _process_id: input.processId,
      _permit_number: input.permitNumber,
      _form_data: input.formData,
    },
  );

  if (error) {
    throw new Error(
      messageFromError(error, "Não foi possível salvar o Alvará no banco oficial."),
    );
  }

  const raw = (data ?? {}) as { permit?: PermitRpcRow | null };
  const permit = mapPermit(raw.permit);
  if (!permit) throw new Error("O banco não retornou o Alvará salvo.");
  return permit;
}

export async function requestOfficialPermitDirectorSignature(
  processId: string,
): Promise<ConstructionPermitRecord> {
  const { data, error } = await backendClient.rpc(
    "request_construction_permit_director_signature_v1",
    { _process_id: processId },
  );

  if (error) {
    throw new Error(
      messageFromError(
        error,
        "Não foi possível encaminhar o Alvará para a Diretoria.",
      ),
    );
  }

  const raw = (data ?? {}) as { permit?: PermitRpcRow | null };
  const permit = mapPermit(raw.permit);
  if (!permit) throw new Error("O banco não retornou a solicitação da Diretoria.");
  return permit;
}

export async function markOfficialPermitForManualSignature(
  processId: string,
): Promise<ConstructionPermitRecord> {
  const { data, error } = await backendClient.rpc(
    "mark_construction_permit_manual_pdf_v1",
    { _process_id: processId },
  );

  if (error) {
    throw new Error(
      messageFromError(
        error,
        "Não foi possível preparar o Alvará para assinatura manual.",
      ),
    );
  }

  const raw = (data ?? {}) as { permit?: PermitRpcRow | null };
  const permit = mapPermit(raw.permit);
  if (!permit) throw new Error("O banco não retornou o Alvará para assinatura manual.");
  return permit;
}
