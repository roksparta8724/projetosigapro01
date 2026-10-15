export type ElectronicSignatureRecord = {
  id: string;
  processId: string;
  entityType: string;
  entityId: string;
  documentVersion?: number | null;
  signerProfileId: string;
  signerName: string;
  signerRole?: string | null;
  signerProfileLabel?: string | null;
  signerTitle?: string | null;
  departmentId?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  authMethod: "password" | "govbr" | "certificate";
  assuranceLevel: "simple_password" | "advanced_govbr" | "qualified_icp_brasil";
  contentSha256: string;
  signatureCode: string;
  signatureFingerprint: string;
  statement?: string | null;
  signedAt: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
};

function normalizeForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCanonicalJson);
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeForCanonicalJson((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalSignaturePayload(value: unknown) {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Bytes(data: ArrayBuffer | Uint8Array) {
  const source =
    data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return toHex(new Uint8Array(digest));
}

export async function sha256Text(value: string) {
  return sha256Bytes(new TextEncoder().encode(value));
}

export async function sha256Canonical(value: unknown) {
  return sha256Text(canonicalSignaturePayload(value));
}

export async function sha256RemoteFile(url: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (!response.ok) {
    throw new Error("Não foi possível ler o arquivo para calcular sua integridade antes da assinatura.");
  }
  return sha256Bytes(await response.arrayBuffer());
}

export function electronicSignatureLevelLabel(level: ElectronicSignatureRecord["assuranceLevel"]) {
  if (level === "qualified_icp_brasil") return "Assinatura eletrônica qualificada — ICP-Brasil";
  if (level === "advanced_govbr") return "Assinatura eletrônica avançada";
  return "Assinatura eletrônica por login e senha";
}
