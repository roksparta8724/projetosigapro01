import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal staff account and avatar recovery regressions", () => {
  const admin = read("src/pages/saas/TenantAdminPage.tsx");
  const dataHook = read("src/hooks/usePlatformData.tsx");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const avatar = read("src/components/platform/UserAvatar.tsx");
  const r2Client = read("src/integrations/r2/client.ts");
  const r2Router = read("api/r2.ts");
  const legacyAvatar = read("server/api/profile-avatar-open.ts");
  const vite = read("vite.config.ts");
  const migration = read("neon/migrations/20261017_municipal_admin_create_staff_accounts.sql");

  it("creates internal municipal server accounts instead of requiring a pre-existing profile", () => {
    expect(admin).toContain("Criar conta de servidor");
    expect(admin).toContain("Senha provisória");
    expect(admin).toContain("Departamento / unidade");
    expect(admin).toContain("temporaryPassword");
    expect(dataHook).toContain("temporaryPassword: input.temporaryPassword");
    expect(backend).toContain('db.rpc("provision_municipal_staff_account"');
    expect(backend).toContain('credentials: "omit"');
    expect(backend).toContain("/sign-up/email");
  });

  it("keeps the administrator inside the own municipality and protects master accounts", () => {
    expect(admin).toContain('user.role !== "master_admin"');
    expect(admin).toContain('user.role !== "master_ops"');
    expect(migration).toContain("_actor_municipality_id is distinct from _municipality_id");
    expect(migration).toContain("Papeis Master nao podem ser criados");
    expect(migration).toContain("A conta pertence a outra Prefeitura");
    expect(migration).toContain("Este cadastro e exclusivo para servidores internos");
  });

  it("shows the saved photo with crop and leaves the frame empty when there is no photo", () => {
    expect(admin).toContain("profile.avatarScale ?? 1");
    expect(admin).toContain("profile.avatarOffsetX ?? 0");
    expect(admin).toContain("profile.avatarOffsetY ?? 0");
    expect(avatar).toContain("sig-user-avatar-fallback");
    expect(avatar).not.toContain("sig-user-avatar-initials");
    expect(avatar).not.toContain("sig-user-avatar-icon");
  });

  it("recovers old Supabase avatars and caches them in the current R2 storage", () => {
    expect(backend).toContain("getLegacyProfileAvatarOpenUrl");
    expect(r2Client).toContain("/api/profile-avatar-open?source=");
    expect(r2Router).toContain('action === "profile-avatar-open"');
    expect(legacyAvatar).toContain("legacy-profile-avatars/");
    expect(legacyAvatar).toContain("PutObjectCommand");
    expect(legacyAvatar).toContain("/storage/v1/object/public/avatars/");
    expect(vite).toContain("/api/profile-avatar-open");
    expect(vite).toContain("resolveRequestedR2Bucket");
  });
});
