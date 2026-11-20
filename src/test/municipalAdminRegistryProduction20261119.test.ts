import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseVerifiedMunicipalUserRegistry, reconcileVerifiedMunicipalUsers } from "@/lib/municipalUserRegistry";
import type { SessionUser } from "@/lib/platform";

const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const otherId = "c334d39c-3a77-464c-abd6-a3a539cceba1";
const id = "11111111-1111-4111-8111-111111111111";
const record = {
  id, municipalityId, name: "Usuário Municipal", email: "usuario@example.test",
  role: "analista", accessLevel: 1, department: "Urbanismo",
  accountStatus: "active", createdAt: "2026-11-19T12:00:00Z",
};

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SIGAPRO — cadastro oficial de usuários por Prefeitura", () => {
  it("reconhece a lista autorizada, com perfil e unidade, sem depender de processos", () => {
    const verified = parseVerifiedMunicipalUserRegistry({ verified: true, municipalityId, users: [record] });
    expect(verified?.municipalityId).toBe(municipalityId);
    expect(verified?.users).toHaveLength(1);
    expect(verified?.users[0]).toMatchObject({
      id, municipalityId, tenantId: municipalityId,
      name: "Usuário Municipal", role: "analista", department: "Urbanismo",
      accountStatus: "active",
    });
    expect(verified?.users[0].createdAt).not.toContain("Invalid Date");
  });

  it("não libera lista a perfis externos e nunca assume dado não verificado", () => {
    expect(parseVerifiedMunicipalUserRegistry({
      verified: false, municipalityId: null, users: [],
    })).toBeNull();
    expect(() => parseVerifiedMunicipalUserRegistry({
      municipalityId, users: [record],
    })).toThrow(/confirmar a Prefeitura/i);
  });

  it("rejeita resultados de outra Prefeitura, perfis desconhecidos e duplicações", () => {
    expect(() => parseVerifiedMunicipalUserRegistry({
      verified: true, municipalityId, users: [{ ...record, municipalityId: otherId }],
    })).toThrow(/outra Prefeitura/i);
    expect(() => parseVerifiedMunicipalUserRegistry({
      verified: true, municipalityId, users: [{ ...record, role: "master_admin" }],
    })).toThrow(/desconhecido/i);
    expect(() => parseVerifiedMunicipalUserRegistry({
      verified: true, municipalityId, users: [record, record],
    })).toThrow(/duplicado/i);
  });

  it("reconcilia registros oficiais sem alterar vínculo de outra prefeitura", () => {
    const other: SessionUser = {
      id: "22222222-2222-4222-8222-222222222222",
      municipalityId: otherId, tenantId: otherId,
      name: "Outra Prefeitura", email: "outro@example.test", role: "analista",
      accessLevel: 1, title: "", accountStatus: "active",
    };
    const verified = parseVerifiedMunicipalUserRegistry({ verified: true, municipalityId, users: [record] });
    const merged = reconcileVerifiedMunicipalUsers([other], verified);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(other);
    expect(reconcileVerifiedMunicipalUsers(merged, verified)).toHaveLength(2);
    expect(reconcileVerifiedMunicipalUsers([other], null)).toEqual([other]);
  });

  it("consulta RPC isolada com privilégio municipal e mostra falha em vez de zero fictício", () => {
    const sql = read("neon/migrations/20261119_municipal_admin_user_registry_v1.sql");
    const loader = read("src/integrations/backend/platformImpl.ts");
    const admin = read("src/pages/saas/TenantAdminPage.tsx");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("public.current_profile_id()");
    expect(sql).toContain("public.can_manage_municipality(_municipality_id)");
    expect(sql).toContain("p.municipality_id = _municipality_id");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.list_municipal_user_registry_v1() TO authenticated");
    expect(sql).not.toMatch(/(?:DELETE FROM|TRUNCATE TABLE|DROP TABLE) public\./i);
    expect(loader).toContain('db.rpc("list_municipal_user_registry_v1")');
    expect(loader).toContain("reconcileVerifiedMunicipalUsers(sessionUsers, verified)");
    expect(admin).toContain("municipalRegistryConfirmed");
    expect(admin).toContain("listRemoteMunicipalUserRegistry()");
    expect(admin).toContain('data-municipal-users-sync={platformDataError || municipalRegistry.error ? "error" : "pending"}');
  });
});
