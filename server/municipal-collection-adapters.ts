import { govbrArReadOnlyAdapter } from "./govbr-ar-readonly.js";
export type MunicipalCollectionOperation = "issue" | "query" | "pdf" | "payment" | "reissue" | "cancel";

export type MunicipalCollectionAdapterContext = {
  municipalityId: string;
  environment: "test" | "production";
  baseUrl: string;
  secret: string;
  parameters: Record<string, unknown>;
};

export interface MunicipalCollectionAdapter {
  readonly code: string;
  readonly operations: readonly MunicipalCollectionOperation[];
  testConnection(context: MunicipalCollectionAdapterContext): Promise<{ ok: true; message: string }>;
  execute(operation: MunicipalCollectionOperation, context: MunicipalCollectionAdapterContext, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// GOVBR has a constrained GET-only onboarding connector. Other providers remain unimplemented.
// Being installed NEVER permits issuing charges or confirming any payment.
const adapters = new Map<string, MunicipalCollectionAdapter>([["govbr_ar", govbrArReadOnlyAdapter]]);

export function getMunicipalCollectionAdapter(code: string) {
  return adapters.get(String(code || "").trim().toLowerCase()) ?? null;
}

export function assertAdapterOperation(adapter: MunicipalCollectionAdapter, operation: MunicipalCollectionOperation) {
  if (!adapter.operations.includes(operation)) {
    throw new Error(`O fornecedor não declarou suporte à operação ${operation}.`);
  }
}

/**
 * Server-authoritative, read-only feature discovery. A catalogue entry is NOT
 * an installed adapter and an installed adapter is NOT an active bank contract.
 * No credentials or municipalities' private data are returned.
 */
export function describeMunicipalCollectionAdapter(code: string) {
 const normalized=String(code||"").trim().toLowerCase();
 const a=getMunicipalCollectionAdapter(normalized);
 return {
  supplierCode: normalized,
  connectorInstalled: Boolean(a),
  operations: a ? [...a.operations] : [],
  credentialVerified: false,
  bankSettlementEnabled: false,
  mode: a ? "connector_installed_pending_credential_validation" : "controlled_import_only",
 } as const;
}
