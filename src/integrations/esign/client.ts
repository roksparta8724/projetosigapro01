import { backendClient } from "@/integrations/backend/databaseClient";

export type ElectronicSignatureResult = {
  ok: boolean;
  signature?: {
    signature_id?: string;
    signature_block_id?: string;
    verification_code?: string;
    signed_at?: string;
    document_hash?: string;
  };
  document?: {
    id?: string;
    title?: string;
    hash?: string;
    version?: number;
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

export async function signDocumentWithPassword(input: {
  documentId: string;
  password: string;
}) {
  const response = await fetch("/api/e-sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    cache: "no-store",
    body: JSON.stringify({
      documentId: input.documentId,
      password: input.password,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ElectronicSignatureResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Não foi possível concluir a assinatura eletrônica.");
  }

  return payload;
}

export type PublicSignatureVerification = {
  valid: boolean;
  verification_code: string;
  document?: {
    title?: string;
    version?: number;
    hash?: string;
  };
  process?: {
    protocol?: string;
    title?: string;
  };
  municipality?: {
    name?: string;
  };
  signed_at?: string;
  signers?: Array<{
    name?: string;
    role?: string;
    title?: string;
    registration?: string;
    signed_at?: string;
    document_hash?: string;
    auth_method?: string;
  }>;
};

export async function verifyElectronicSignature(code: string): Promise<PublicSignatureVerification | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const { data, error } = await backendClient.rpc("verify_signature_receipt_v1", {
    _verification_code: normalized,
  });
  if (error) throw error;
  return data || null;
}
