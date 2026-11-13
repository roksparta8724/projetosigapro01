import type { ProcessRecord } from "@/lib/platform";
import type { HabiteSePermitRecord } from "@/integrations/permits/habiteSePermitClient";
import type {
  ArtifactSignatureSigner,
  ArtifactSignatureSnapshot,
} from "@/integrations/esign/artifactClient";

/**
 * An issued permit must be printed from the exact signed snapshot, not from
 * mutable process fields or current municipal defaults. Backend authorization,
 * signed artifact verification and legal competence remain server-side.
 */
export type VerifiedHabiteSePrint = {
  process: ProcessRecord;
  permit: HabiteSePermitRecord;
  director: ArtifactSignatureSigner;
  secretary: ArtifactSignatureSigner | null;
  verificationCode: string;
  evidenceHash: string;
};

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort()
    .map(key => JSON.stringify(key) + ":" + stable(record[key])).join(",") + "}";
}

function requiredString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function stringField(value: unknown): value is string {
  return typeof value === "string";
}

export function resolveVerifiedHabiteSePrint(
  process: ProcessRecord,
  permit: HabiteSePermitRecord | null,
  signatures: ArtifactSignatureSnapshot,
): VerifiedHabiteSePrint | null {
  if (!permit || permit.status !== "emitido") return null;
  const block = signatures.block;
  const payload = block?.payload;
  if (!block || !payload || block.artifact_type !== "habite_se_permit" ||
    block.artifact_key !== "habite-se-permit" ||
    !requiredString(block.artifact_hash) ||
    !/^[a-f0-9]{64}$/i.test(block.artifact_hash) ||
    !requiredString(block.verification_code) ||
    !/^[a-z0-9]{10,64}$/i.test(block.verification_code)) return null;
  if (payload.schema !== "sigapro.habite-se-permit.v1" ||
    payload.processId !== process.id ||
    payload.permitNumber !== permit.permitNumber ||
    !requiredString(payload.protocol)) return null;

  const director = signatures.signers.find(
    item => item.slot === "diretoria" && requiredString(item.signed_at),
  );
  if (!director) return null;

  const signedForm = payload.formData;
  if (!signedForm || typeof signedForm !== "object" || Array.isArray(signedForm)) return null;
  // Both the signed artifact and the issued permit are returned by the
  // authenticated Neon API. Reject disagreeing versions instead of combining.
  if (stable(signedForm) !== stable(permit.formData)) return null;

  for (const key of ["owner", "ownerDocument", "professional",
    "propertyAddress", "usage", "constructionStandard"] as const) {
    if (!stringField(payload[key])) return null;
  }
  if (typeof payload.areaM2 !== "number" ||
    !Number.isFinite(payload.areaM2) || payload.areaM2 < 0) return null;

  const officialProcess: ProcessRecord = {
    ...process,
    protocol: payload.protocol,
    ownerName: payload.owner as string,
    ownerDocument: payload.ownerDocument as string,
    technicalLead: payload.professional as string,
    address: payload.propertyAddress as string,
    property: {
      ...process.property,
      area: payload.areaM2,
      usage: payload.usage as string,
      constructionStandard: payload.constructionStandard as string,
    },
  };
  return {
    process: officialProcess,
    permit: {...permit, formData: signedForm as HabiteSePermitRecord["formData"]},
    director,
    secretary: signatures.signers.find(
      item => item.slot === "secretaria" && requiredString(item.signed_at),
    ) ?? null,
    verificationCode: block.verification_code,
    evidenceHash: block.artifact_hash,
  };
}
