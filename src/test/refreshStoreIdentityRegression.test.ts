import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isConfirmedStoreIdentity } from "@/lib/confirmedStoreIdentity";

const dataHook = readFileSync(
  resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8"
);
const registry = readFileSync(
  resolve(process.cwd(), "src/pages/saas/ExternalProcessControlPage.tsx"), "utf8"
);

describe("F5: continuidade segura da sessao", () => {
  it("reconhece os dois IDs da mesma conta", () => {
    expect(isConfirmedStoreIdentity("auth-A", "auth-A", "perfil-A")).toBe(true);
    expect(isConfirmedStoreIdentity("perfil-A", "auth-A", "perfil-A")).toBe(true);
  });

  it("rejeita outra conta e autenticacao ausente", () => {
    expect(isConfirmedStoreIdentity("perfil-B", "auth-A", "perfil-A")).toBe(false);
    expect(isConfirmedStoreIdentity("auth-B", "auth-A", "perfil-A")).toBe(false);
    expect(isConfirmedStoreIdentity("perfil-A", null, "perfil-A")).toBe(false);
    expect(isConfirmedStoreIdentity("unknown", "auth-A", "perfil-A")).toBe(false);
  });

  it("preserva a identidade validada na recuperacao de dados", () => {
    expect(dataHook).toContain(
      "isConfirmedStoreIdentity(remoteContextUserId, authenticatedUserId, authenticatedProfileId)"
    );
  });

  it("impede consulta antecipada de processos", () => {
    expect(registry).toContain("!dataReadyForCurrentUser ||");
    expect(registry).toContain(
      "const needsRecovery = visibleRecords.length === 0;"
    );
  });
});
