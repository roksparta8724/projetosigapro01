import { backendClient } from "@/integrations/backend/databaseClient";

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

  const payload = (await response.json().catch(() => ({}))) as SignProcessArtifactResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Não foi possível concluir a assinatura eletrônica.");
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
