import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getMunicipalDirectorCandidates, userCanSignPermitAsDirector } from "@/lib/constructionPermit";
import type { SessionUser } from "@/lib/platform";

const municipalityId = "municipality-a";
const director = {
  id: "director-1",
  name: "Diretor Municipal",
  role: "prefeitura_supervisor",
  accessLevel: 2,
  tenantId: municipalityId,
  municipalityId,
  title: "Supervisor da Prefeitura",
  profileLabel: "",
  email: "director@example.test",
  accountStatus: "active",
  userType: "Interno",
  department: "Urbanismo e Obras",
} as SessionUser;

describe("construction permit Director routing", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/components/platform/ConstructionPermitPanel.tsx"), "utf8");
  const client = readFileSync(resolve(process.cwd(), "src/integrations/permits/constructionPermitClient.ts"), "utf8");
  const migration = readFileSync(resolve(process.cwd(), "neon/migrations/20261017_construction_permit_director_request_reliable.sql"), "utf8");

  it("recognizes the Urbanism supervisor as Director authority", () => {
    expect(getMunicipalDirectorCandidates([director], municipalityId)).toHaveLength(1);
    expect(userCanSignPermitAsDirector(director)).toBe(true);
  });

  it("keeps the analyst request enabled while browser users synchronize", () => {
    expect(panel).toContain('data-request-director-signature="true"');
    expect(panel).toContain("A Diretoria será validada diretamente no banco oficial ao enviar");
    expect(panel).not.toContain("disabled={directors.length === 0");
  });

  it("confirms the Director returned by the database", () => {
    expect(client).toContain("director_name");
    expect(panel).toContain("requestResult.directorName");
  });

  it("validates and notifies the active Director in the database", () => {
    expect(migration).toContain("public.profile_operational_area(p.id)='analise'");
    expect(migration).toContain("insert into public.notifications");
  });
});
