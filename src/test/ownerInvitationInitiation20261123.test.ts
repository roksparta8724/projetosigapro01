import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildOwnerInvitationUrl, normalizeInvitedProtocol, normalizeInvitationTenant } from "@/lib/ownerInvitation";
describe("convite para chat a partir do processo do profissional",()=>{
  it("gera um link HTTPS para criar conta de proprietario e preenche o protocolo",()=>{
    const link=buildOwnerInvitationUrl("https://homologacao.example.com","campolimpopaulista","PRE-2026-00003");
    const parsed=new URL(link);
    expect(parsed.pathname).toBe("/criar-conta");
    expect(parsed.searchParams.get("tenant")).toBe("campolimpopaulista");
    expect(parsed.searchParams.get("perfil")).toBe("proprietario");
    expect(parsed.searchParams.get("protocolo")).toBe("PRE-2026-00003");
    expect(link).not.toContain("cpf");
  });
  it("rejects malformed protocols, invalid slugs and unencrypted origins",()=>{
    expect(normalizeInvitedProtocol("<script>")).toBe("");
    expect(normalizeInvitationTenant("bad host/")).toBe("");
    expect(()=>buildOwnerInvitationUrl("http://example.com","campolimpopaulista","PRE-2026-00003")).toThrow();
  });
  it("permite ao profissional iniciar o convite e ao proprietario retomar cadastro apos login",()=>{
    const professional = readFileSync("src/pages/saas/ExternalMessagesPage.tsx","utf8");
    const owner = readFileSync("src/pages/saas/OwnerPortalPage.tsx","utf8");
    const signup = readFileSync("src/pages/saas/CriarContaPage.tsx","utf8");
    const login = readFileSync("src/pages/saas/AcessoPage.tsx","utf8");
    expect(professional).toContain("Copiar convite");
    expect(professional).toContain("processBelongsToExternalProfessional");
    expect(owner).toContain("readOwnerInvitation()?.protocol");
    expect(owner).toContain("clearOwnerInvitation()");
    expect(signup).toContain('role: (isInvitedOwner ? "property_owner" : "profissional_externo")');
    expect(signup).toContain('const invitedTenantSlug = tenantSlug || tenant.subdomain || ""');
    expect(login).toContain('createAccountParams.set("tenant", tenantSlug || tenant.subdomain || "")');
    expect(login).toContain("rememberOwnerInvitation(effectiveSlug, invitationProtocol)");

  });
});
