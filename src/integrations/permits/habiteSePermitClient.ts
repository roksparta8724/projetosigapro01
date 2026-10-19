import { backendClient } from "@/integrations/backend/databaseClient";

export type HabiteSePermitStatus = "rascunho" | "aguardando_diretor" | "emitido";

export type HabiteSePermitFormData = {
  observations: string;
  conditions: string;
  modality: string;
  sourceProcess: string;
  sourcePermit: string;
  completionDate: string;
};

export type HabiteSePermitRecord = {
  id: string;
  processId: string;
  municipalityId?: string | null;
  permitNumber: string;
  status: HabiteSePermitStatus;
  formData: HabiteSePermitFormData;
  analystProfileId?: string | null;
  analystName?: string | null;
  directorProfileId?: string | null;
  directorName?: string | null;
  directorRequestedAt?: string | null;
  issuedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PermitRpcRow = {
  id: string;
  process_id: string;
  municipality_id?: string | null;
  permit_number: string;
  status: string;
  form_data?: Partial<HabiteSePermitFormData> | null;
  analyst_profile_id?: string | null;
  analyst_name?: string | null;
  director_profile_id?: string | null;
  director_name?: string | null;
  director_requested_at?: string | null;
  issued_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const EMPTY_FORM: HabiteSePermitFormData = {
  observations: "",
  conditions: "",
  modality: "Habite-se integral",
  sourceProcess: "",
  sourcePermit: "",
  completionDate: "",
};

function mapForm(value?: Partial<HabiteSePermitFormData> | null): HabiteSePermitFormData {
  return { ...EMPTY_FORM, ...(value ?? {}) };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "details", "detail", "hint", "code"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function mapPermit(row?: PermitRpcRow | null): HabiteSePermitRecord | null {
  if (!row) return null;
  const rawForm = row.form_data ?? {};
  return {
    id: row.id,
    processId: row.process_id,
    municipalityId: row.municipality_id ?? null,
    permitNumber: row.permit_number,
    status:
      row.status === "emitido"
        ? "emitido"
        : row.status === "aguardando_diretor"
          ? "aguardando_diretor"
          : "rascunho",
    formData: mapForm(rawForm),
    analystProfileId: row.analyst_profile_id ?? null,
    analystName: row.analyst_name ?? null,
    directorProfileId: row.director_profile_id ?? null,
    directorName: row.director_name ?? null,
    directorRequestedAt: row.director_requested_at ?? null,
    issuedAt: row.issued_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getHabiteSePermit(processId: string) {
  const { data, error } = await backendClient.rpc("get_habite_se_permit_v1", {
    _process_id: processId,
  });
  if (error) {
    throw new Error(errorMessage(error, "Não foi possível carregar o Alvará de Habite-se."));
  }
  const raw = (data ?? {}) as {
    permit?: PermitRpcRow | null;
    defaults?: Partial<HabiteSePermitFormData> | null;
    can_manage?: boolean;
  };
  return {
    permit: mapPermit(raw.permit),
    defaults: mapForm(raw.defaults),
    canManage: Boolean(raw.can_manage),
  };
}

export async function saveHabiteSePermit(input: {
  processId: string;
  permitNumber?: string | null;
  formData: HabiteSePermitFormData;
}) {
  const { data, error } = await backendClient.rpc("save_habite_se_permit_v1", {
    _process_id: input.processId,
    _form_data: input.formData,
    _permit_number: input.permitNumber || null,
  });
  if (error) {
    throw new Error(errorMessage(error, "Não foi possível salvar o Alvará de Habite-se."));
  }
  const raw = (data ?? {}) as { permit?: PermitRpcRow | null };
  const permit = mapPermit(raw.permit);
  if (!permit) throw new Error("O banco não retornou o Alvará de Habite-se salvo.");
  return permit;
}

export async function setHabiteSePermitAwaitingDirector(processId: string) {
  const { data, error } = await backendClient.rpc(
    "set_habite_se_permit_awaiting_director_v1",
    { _process_id: processId },
  );
  if (error) {
    throw new Error(errorMessage(error, "Não foi possível encaminhar o Alvará de Habite-se à Diretoria."));
  }
  const raw = (data ?? {}) as { permit?: PermitRpcRow | null };
  const permit = mapPermit(raw.permit);
  if (!permit) throw new Error("O banco não retornou o encaminhamento do Alvará.");
  return permit;
}

export async function completeHabiteSeProcess(processId: string) {
  const { data, error } = await backendClient.rpc("complete_habite_se_process_v1", {
    _process_id: processId,
  });
  if (error) {
    throw new Error(
      errorMessage(error, "Não foi possível concluir administrativamente o processo de Habite-se."),
    );
  }

  const raw = (data ?? {}) as {
    ok?: boolean;
    already_completed?: boolean;
    process_id?: string;
    status?: string;
  };

  if (!raw.ok) {
    throw new Error("O banco não confirmou a conclusão administrativa do processo.");
  }

  return {
    ok: true,
    alreadyCompleted: Boolean(raw.already_completed),
    processId: String(raw.process_id || processId),
    status: String(raw.status || "arquivado"),
  };
}

export async function finalizeHabiteSePermit(processId: string) {
  const { data, error } = await backendClient.rpc("finalize_habite_se_permit_v1", {
    _process_id: processId,
  });
  if (error) {
    throw new Error(errorMessage(error, "Não foi possível finalizar o Alvará de Habite-se."));
  }
  const raw = (data ?? {}) as {
    permit?: PermitRpcRow | null;
    verification_code?: string | null;
    already_finalized?: boolean;
  };
  const permit = mapPermit(raw.permit);
  if (!permit) throw new Error("O banco não retornou o Alvará finalizado.");
  return {
    permit,
    verificationCode: raw.verification_code ?? null,
    alreadyFinalized: Boolean(raw.already_finalized),
  };
}
