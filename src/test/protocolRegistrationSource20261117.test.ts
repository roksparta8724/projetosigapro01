import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyProtocolRegistrationSource } from "@/lib/protocolRegistrationSource";
import type { ProcessRecord } from "@/lib/platform";

const process = (role?: string, professionalProfileId?: string) =>
  ({ createdByRole: role, professionalProfileId }) as ProcessRecord;

describe("SIGAPRO — procedência dos cards do Protocolo", () => {
  it("reconhece cadastro municipal pela autoria, não pelo profissional técnico", () => {
    expect(classifyProtocolRegistrationSource(process("setor_intersetorial"))).toBe("internal");
    expect(classifyProtocolRegistrationSource(process("prefeitura_supervisor", "external-tech"))).toBe("internal");
    expect(classifyProtocolRegistrationSource(process("analista"))).toBe("internal");
    expect(classifyProtocolRegistrationSource(process("financeiro"))).toBe("internal");
  });

  it("reconhece origem profissional e preserva caso de origem desconhecida", () => {
    expect(classifyProtocolRegistrationSource(process("profissional_externo"))).toBe("external");
    expect(classifyProtocolRegistrationSource(process(" PROFISSIONAL_EXTERNO "))).toBe("external");
    expect(classifyProtocolRegistrationSource(process(undefined, "external-tech"))).toBe("unknown");
    expect(classifyProtocolRegistrationSource(process("other-unverified"))).toBe("unknown");
  });

  it("não copia identificadores de servidor municipal para campos de profissional", () => {
    const source = readFileSync("src/integrations/backend/platformImpl.ts", "utf8");
    expect(source).toContain("const creatorIsExternalProfessional = [");
    expect(source).toContain("(creatorIsExternalProfessional ? process.created_by_profile_id : undefined)");
    expect(source).toContain("(creatorIsExternalProfessional ? (process.created_by ?? creatorProfile?.user_id) : undefined)");
    expect(source).toContain("(creatorIsExternalProfessional ? creatorProfile?.email : undefined)");
    expect(source).toContain("(creatorIsExternalProfessional ? creatorProfile?.full_name : undefined)");
  });

  it("não classifica despacho intersetorial como visita presencial nem inventa canal", () => {
    const page = readFileSync("src/pages/saas/ProtocolDeskPage.tsx", "utf8");
    expect(page).toContain('classifyProtocolRegistrationSource(item) === "internal"');
    expect(page).toContain('classifyProtocolRegistrationSource(item) === "external"');
    expect(page).toContain('classifyProtocolRegistrationSource(item) === "unknown"');
    expect(page).toContain('data-sigapro-protocol-unidentified-origin="true"');
    expect(page).not.toContain('isExternalProfessionalSubmission(item) || !deskProtocolIds.has(item.id)');
  });
});
