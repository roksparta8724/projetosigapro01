import { backendClient } from "@/integrations/backend/databaseClient";
import type { PaymentGuideKind, ProcessDocument } from "@/lib/platform";

/** Registers only a GOVBR/other-provider PDF; never issues a charge or confirms payment. */
export async function attachMunicipalCollectionGuide(input: {
  municipalityId: string;
  processId: string;
  reference: string;
  guideKind: PaymentGuideKind;
  document: ProcessDocument;
}): Promise<{ synced: number; inserted: number; stored: number }> {
  const session = (await backendClient?.auth?.getSession?.())?.data?.session;
  const token = session?.access_token || session?.accessToken || session?.token || "";
  if (!token) throw new Error("Faça login para anexar a guia oficial.");
  const response = await fetch("/api/collection-configuration", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: "attach",
      municipalityId: input.municipalityId,
      processId: input.processId,
      reference: input.reference,
      guideKind: input.guideKind,
      document: input.document,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.synced !== 1) {
    throw new Error(result?.error || "O Neon não confirmou o vínculo da guia municipal ao processo.");
  }
  return result as { synced: number; inserted: number; stored: number };
}
