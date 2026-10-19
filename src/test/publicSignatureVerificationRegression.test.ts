import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const app = read("src/App.tsx");
const verificationPage = read("src/pages/saas/PublicSignatureVerificationPage.tsx");
const verificationUrl = read("src/lib/signatureVerification.ts");
const publicRpc = read("neon/migrations/20261017_public_artifact_signature_verification.sql");

describe("public signature QR verification", () => {
  it("uses a permanent official-domain verification URL", () => {
    expect(verificationUrl).toContain('VITE_PUBLIC_APP_URL || "https://sigapromunicipal.com.br"');
    expect(verificationUrl).toContain('/v/${encodeURIComponent(code)}');
  });

  it("keeps the public verification heading readable on the dark institutional header", () => {
    expect(verificationPage).toContain('data-public-verification-heading="true"');
    expect(verificationPage).toContain("!text-white");
    expect(verificationPage).toContain("Verificação de assinatura eletrônica");
  });

  it("keeps the QR route public and outside authenticated municipal routes", () => {
    expect(app).toContain('path="/v/:codigo"');
    expect(app).toContain('path="/verificar-assinatura"');
    expect(app).toContain('pathname.startsWith("/v/")');
    expect(app).toContain('pathname === "/verificar-assinatura"');
    expect(app).toContain("isPublicVerificationRoute ? \"100\" : \"85\"");
  });

  it("verifies the printed code against the official database without exposing sensitive evidence", () => {
    expect(verificationPage).toContain("verify_process_artifact_signature_public_v1");
    expect(publicRpc).toContain("security definer");
    expect(publicRpc).toContain("grant execute on function public.verify_process_artifact_signature_public_v1(text) to public");
    expect(publicRpc).toContain("'valid', true");
    expect(publicRpc).not.toContain("evidence_ip");
    expect(publicRpc).not.toContain("evidence_user_agent");
  });
});
