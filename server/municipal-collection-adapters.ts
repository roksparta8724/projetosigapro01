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

// Adaptadores reais são registrados aqui somente depois de homologação com o
// fornecedor. Registro vazio é intencional: nunca simulamos uma API municipal.
const adapters = new Map<string, MunicipalCollectionAdapter>();

export function getMunicipalCollectionAdapter(code: string) {
  return adapters.get(String(code || "").trim().toLowerCase()) ?? null;
}

export function assertAdapterOperation(adapter: MunicipalCollectionAdapter, operation: MunicipalCollectionOperation) {
  if (!adapter.operations.includes(operation)) {
    throw new Error(`O fornecedor não declarou suporte à operação ${operation}.`);
  }
}
