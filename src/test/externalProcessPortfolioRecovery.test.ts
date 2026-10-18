import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleProcessesByScope,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const backend = read("src/integrations/backend/platformImpl.ts");
const page = read("src/pages/saas/ExternalProcessControlPage.tsx");
const migration = read(
  "neon/migrations/20261018_external_process_visibility_recovery.sql",
);

describe("external process portfolio recovery", () => {
  it("keeps all official processes owned by the professional visible regardless of municipal stage", () => {
    const session = {
      id: "profile-external",
      name: "Profissional Externo",
      role: "profissional_externo",
      accessLevel: 1,
      tenantId: "municipality-a",
      municipalityId: "municipality-a",
      title: "Profissional Externo",
      email: "professional@example.test",
      accountStatus: "active",
      userType: "Externo",
      department: "Profissional Externo",
    } satisfies SessionUser;

    const records = [
      {
        id: "p1",
        createdByProfileId: "profile-external",
        professionalProfileId: "profile-external",
        status: "analise_tecnica",
        tenantId: "municipality-a",
        municipalityId: "municipality-a",
      },
      {
        id: "p2",
        createdByProfileId: "profile-external",
        professionalProfileId: "profile-external",
        status: "deferido",
        tenantId: "municipality-a",
        municipalityId: "municipality-a",
      },
      {
        id: "p3",
        createdByProfileId: "profile-external",
        professionalProfileId: "profile-external",
        status: "triagem",
        tenantId: "municipality-a",
        municipalityId: "municipality-a",
      },
    ] as unknown as ProcessRecord[];

    expect(
      getVisibleProcessesByScope(session, "municipality-a", records).map(
        (process) => process.id,
      ),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("falls back to the canonical database RPC instead of emptying the portfolio", () => {
    expect(backend).toContain('db.rpc("list_visible_processes_v1")');
    expect(backend).toContain("let processRows =");
    expect(backend).toContain("processLoadError");
    expect(backend).toContain("nonCriticalErrors");
    expect(backend).toContain("processRows.map((process)");
    expect(migration).toContain("public.has_process_access(p.id)");
    expect(migration).toContain("returns setof public.processes");
  });

  it("does not tell the professional that processes were deleted while data is reconnecting", () => {
    expect(page).toContain("Carregando seus processos");
    expect(page).toContain("Reconectando sua carteira oficial");
    expect(page).toContain("Seus processos não foram apagados");
    expect(page).toContain("refreshRemoteStore");
    expect(page).toContain("recoveryAttemptedRef");
  });
});
