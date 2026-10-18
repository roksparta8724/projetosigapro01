import { backendClient } from "@/integrations/backend/databaseClient";

export class ArtifactSignatureError extends Error {
  readonly stage?: string;
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { stage?: string; code?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "ArtifactSignatureError";
    this.stage = options.stage;
    this.code = options.code;
    this.status = options.status;
  }
}

export type ArtifactSignerSlot =
  | "analise_tecnica"
  | "conferencia_fiscal"
  | "diretoria"
  | "secretaria"
  | "profissional";

export type ArtifactSignatureSigner = {
  id?: string;
  profile_id?: string;
  name?: string;
  role?: string;
  title?: string;
  registration?: string | null;
  slot?: ArtifactSignerSlot | string;
  signed_at?: string;
  hash?: string;
  auth_method?: string;
};

export type ArtifactSignatureRequest = {
  id: string;
  status: "pending" | "completed" | "cancelled" | "stale" | string;
  signer_slot: ArtifactSignerSlot | string;
  artifact_key: string;
  artifact_hash?: string | null;
  requested_at: string;
  requested_by_profile_id?: string | null;
  requested_by_name?: string | null;
  assigned_profile_id?: string | null;
  completed_at?: string | null;
  completed_by_profile_id?: string | null;
  completed_by_name?: string | null;
  note?: string | null;
};

export type ArtifactSignatureRequestSnapshot = {
  request: ArtifactSignatureRequest | null;
  candidate_count: number;
};



export type ArtifactWithdrawalRecord = {
  id: string;
  artifact_hash: string;
  withdrawn_by_name: string;
  withdrawn_at: string;
  withdrawn_at_exact?: string | null;
  recorded_by_profile_id?: string | null;
  recorded_at?: string | null;
  updated_at?: string | null;
};

export type ArtifactVersionHistoryEntry = {
  id: string;
  artifact_type: string;
  artifact_key: string;
  artifact_version: number;
  artifact_hash: string;
  verification_code: string;
  completed_at: string;
  payload: Record<string, unknown>;
  signers: Array<{
    profile_id?: string | null;
    name?: string | null;
    role?: string | null;
    title?: string | null;
    slot?: string | null;
    signed_at?: string | null;
    status?: string | null;
  }>;
};

export type ArtifactWithdrawalSnapshot = {
  withdrawal: ArtifactWithdrawalRecord | null;
};

export type ArtifactSignatureSnapshot = {
  block: {
    id?: string;
    artifact_type?: string;
    artifact_key?: string;
    artifact_version?: number;
    artifact_hash?: string;
    verification_code?: string;
    completed_at?: string;
    payload?: Record<string, unknown>;
  } | null;
  signers: ArtifactSignatureSigner[];
};

export type SignProcessArtifactResult = {
  ok: boolean;
  signature?: {
    signature_id?: string;
    signature_block_id?: string;
    verification_code?: string;
    signed_at?: string;
    artifact_hash?: string;
    artifact_version?: number;
    signer?: {
      profile_id?: string;
      name?: string;
      role?: string;
      title?: string;
      registration?: string | null;
      slot?: ArtifactSignerSlot | string;
    };
  };
  artifact?: {
    type?: string;
    key?: string;
    hash?: string;
  };
};

function normalizeApiError(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  for (const key of ["message", "error_description", "detail", "details", "hint", "code"]) {
    const candidate = normalizeApiError(record[key]);
    if (candidate) return candidate;
  }

  const nested = normalizeApiError(record.error);
  if (nested) return nested;

  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : "";
  } catch {
    return "";
  }
}

function normalizeWithdrawalError(value: unknown, fallback: string): string {
  const message = normalizeApiError(value);
  if (
    /schema cache|PGRST20[245]|Could not find the function|Could not find the table/i.test(
      message,
    )
  ) {
    return "O módulo de retirada foi atualizado e está sincronizando com o banco. Recarregue a página e tente novamente.";
  }
  return message || fallback;
}


async function readApiResponse(response: Response) {
  const raw = await response.text();
  if (!raw) return {} as Record<string, unknown>;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      error:
        response.status === 401 || response.status === 403
          ? "A requisição de assinatura foi bloqueada antes de chegar ao SIGAPRO."
          : raw.slice(0, 600),
    };
  }
}

async function authHeaders() {
  try {
    const sessionResult = await backendClient?.auth?.getSession?.();
    const session = sessionResult?.data?.session ?? null;
    const token =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export async function signProcessArtifactWithPassword(input: {
  processId: string;
  artifactType: string;
  artifactKey: string;
  signerSlot: ArtifactSignerSlot;
  password: string;
  payload: Record<string, unknown>;
}) {
  const response = await fetch("/api/e-sign-artifact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    cache: "no-store",
    body: JSON.stringify(input),
  });

  const rawPayload = await readApiResponse(response);
  const payload = rawPayload as SignProcessArtifactResult & {
    error?: unknown;
    message?: unknown;
    code?: unknown;
    stage?: unknown;
  };

  if (!response.ok) {
    const message =
      normalizeApiError(payload.error) ||
      normalizeApiError(payload.message) ||
      "Não foi possível concluir a assinatura eletrônica.";
    const stage = normalizeApiError(payload.stage);
    const code = normalizeApiError(payload.code);
    const suffix = [stage ? `etapa: ${stage}` : "", code ? `código: ${code}` : ""]
      .filter(Boolean)
      .join(" • ");
    throw new ArtifactSignatureError(message, {
      stage: stage || undefined,
      code: code || undefined,
      status: response.status,
    });
  }

  return payload;
}

export async function getProcessArtifactSignatures(
  processId: string,
  artifactKey: string,
): Promise<ArtifactSignatureSnapshot> {
  const { data, error } = await backendClient.rpc("get_process_artifact_signatures_v1", {
    _process_id: processId,
    _artifact_key: artifactKey,
  });

  if (error) throw error;

  const raw = (data ?? {}) as Partial<ArtifactSignatureSnapshot>;
  return {
    block: raw.block ?? null,
    signers: Array.isArray(raw.signers) ? raw.signers : [],
  };
}


export async function getProcessArtifactSignatureRequest(
  processId: string,
  artifactKey: string,
  signerSlot: ArtifactSignerSlot,
): Promise<ArtifactSignatureRequestSnapshot> {
  const { data, error } = await backendClient.rpc(
    "get_process_artifact_signature_request_v1",
    {
      _process_id: processId,
      _artifact_key: artifactKey,
      _signer_slot: signerSlot,
    },
  );

  if (error) throw error;

  const raw = (data ?? {}) as Partial<ArtifactSignatureRequestSnapshot>;
  return {
    request: raw.request ?? null,
    candidate_count: Number(raw.candidate_count ?? 0),
  };
}

export async function requestProcessArtifactSignature(input: {
  processId: string;
  artifactKey: string;
  artifactHash: string;
  signerSlot: "diretoria";
}): Promise<ArtifactSignatureRequestSnapshot & { ok?: boolean; created?: boolean }> {
  const { data, error } = await backendClient.rpc(
    "request_process_artifact_signature_v1",
    {
      _process_id: input.processId,
      _artifact_key: input.artifactKey,
      _artifact_hash: input.artifactHash || "",
      _signer_slot: input.signerSlot,
    },
  );

  if (error) {
    throw new ArtifactSignatureError(normalizeApiError(error) || "Não foi possível solicitar a assinatura da Diretoria.", {
      stage: "request",
      code: "DIRECTOR_SIGNATURE_REQUEST_FAILED",
    });
  }

  const raw = (data ?? {}) as Partial<
    ArtifactSignatureRequestSnapshot & { ok?: boolean; created?: boolean }
  >;

  return {
    ok: raw.ok,
    created: raw.created,
    request: raw.request ?? null,
    candidate_count: Number(raw.candidate_count ?? 0),
  };
}


export async function getProcessArtifactVersionHistory(
  processId: string,
  artifactKey: string,
): Promise<ArtifactVersionHistoryEntry[]> {
  const { data, error } = await backendClient.rpc(
    "get_process_artifact_version_history_v1",
    {
      _process_id: processId,
      _artifact_key: artifactKey,
    },
  );

  if (error) {
    throw new ArtifactSignatureError(
      normalizeApiError(error) || "Não foi possível carregar o histórico de versões assinadas.",
      {
        stage: "history",
        code: "ARTIFACT_HISTORY_READ_FAILED",
      },
    );
  }

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return Array.isArray(raw.versions)
    ? (raw.versions as ArtifactVersionHistoryEntry[])
    : [];
}


export async function getProcessArtifactWithdrawal(
  processId: string,
  artifactKey: string,
): Promise<ArtifactWithdrawalSnapshot> {
  const { data, error } = await backendClient
    .from("process_artifact_withdrawals")
    .select(
      "id,artifact_hash,withdrawn_by_name,withdrawn_at,withdrawn_at_exact,recorded_by_profile_id,recorded_at,updated_at",
    )
    .eq("process_id", processId)
    .eq("artifact_key", artifactKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ArtifactSignatureError(
      normalizeWithdrawalError(error, "Não foi possível carregar o registro de entrega física."),
      {
        stage: "withdrawal",
        code: "WITHDRAWAL_READ_FAILED",
      },
    );
  }

  return {
    withdrawal: (data ?? null) as ArtifactWithdrawalRecord | null,
  };
}

export async function saveProcessArtifactWithdrawal(input: {
  processId: string;
  artifactKey: string;
  artifactHash?: string;
  withdrawnByName: string;
}): Promise<ArtifactWithdrawalSnapshot & { ok?: boolean }> {
  const row = {
    process_id: input.processId,
    artifact_key: input.artifactKey,
    artifact_hash: input.artifactHash || null,
    withdrawn_by_name: input.withdrawnByName,
  };

  const { data, error } = await backendClient
    .from("process_artifact_withdrawals")
    .upsert(row, { onConflict: "process_id,artifact_key" })
    .select(
      "id,artifact_hash,withdrawn_by_name,withdrawn_at,withdrawn_at_exact,recorded_by_profile_id,recorded_at,updated_at",
    )
    .single();

  if (error) {
    throw new ArtifactSignatureError(
      normalizeWithdrawalError(error, "Não foi possível registrar a entrega física."),
      {
        stage: "withdrawal",
        code: "WITHDRAWAL_SAVE_FAILED",
      },
    );
  }

  return {
    ok: true,
    withdrawal: (data ?? null) as ArtifactWithdrawalRecord | null,
  };
}
