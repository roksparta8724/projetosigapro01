import { describe, expect, it } from "vitest";
import { enforceAuthenticatedAvatarRead } from "../../server/avatar-access";

describe("SIGAPRO protected avatar gate — QA general homologation", () => {
  it("enforces authenticated R2 reads on the current reviewed homologation branch", () => {
    expect(enforceAuthenticatedAvatarRead({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "fix/homologacao-geral-sei-dashboard-bank-20261113",
    })).toBe(true);
  });

  it("retains enforcement on the original QA branch", () => {
    expect(enforceAuthenticatedAvatarRead({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "fix/qa-triagem-analise-pagamento-20261101",
    })).toBe(true);
  });

  it("does not modify production configuration or unrelated previews implicitly", () => {
    expect(enforceAuthenticatedAvatarRead({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "fix/homologacao-geral-sei-dashboard-bank-20261113",
    })).toBe(false);
    expect(enforceAuthenticatedAvatarRead({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "other-preview",
    })).toBe(false);
  });
});
