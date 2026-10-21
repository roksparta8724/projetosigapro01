import { describe, expect, it } from "vitest";
import { isCollectionAuthError, isCollectionSchemaMissing, isCollectionSuccessMessage, municipalCollectionError } from "@/lib/collectionDiagnostics";

describe("Municipal collection: Neon authentication and readiness diagnostics", () => {
  it("never classifies JWK key errors as missing migrations", () => {
    expect(isCollectionAuthError("jwk not found")).toBe(true);
    expect(isCollectionSchemaMissing("jwk not found")).toBe(false);
    expect(municipalCollectionError(new Error("jwk not found"))).toContain("Sessão de acesso incompatível");
    expect(municipalCollectionError(new Error("jwk not found"))).not.toMatch(/migra[cç][aã]o|isolado/i);
  });

  it("reports missing functions only when database schema is really missing", () => {
    const message = "Could not find the function public.get_municipal_collection_bank_details_v1 in the schema cache";
    expect(isCollectionSchemaMissing(message)).toBe(true);
    expect(municipalCollectionError(message)).toContain("banco conectado");
  });

  it("retains operational validation details instead of inventing a success", () => {
    expect(municipalCollectionError("Provedor ainda não homologado"))
      .toBe("Provedor ainda não homologado");
  });
  it("does not render unavailable payments or failed saves as successful", () => {
    expect(isCollectionSuccessMessage("A estrutura de arrecadação ainda não está disponível neste ambiente")).toBe(false);
    expect(isCollectionSuccessMessage("Nenhuma configuração foi salva")).toBe(false);
    expect(isCollectionSuccessMessage("Falha de autenticação JWT / JWK")).toBe(false);
    expect(isCollectionSuccessMessage("Conexão salva com sucesso")).toBe(true);
    expect(isCollectionSuccessMessage("Configuração salva como nova versão de homologação")).toBe(true);
  });

});
