import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("login, municipal administration and avatar regressions", () => {
  const access = read("src/pages/saas/AcessoPage.tsx");
  const bootstrap = read("src/hooks/useAppBootstrap.tsx");
  const tenantAdmin = read("src/pages/saas/TenantAdminPage.tsx");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const userAvatar = read("src/components/platform/UserAvatar.tsx");
  const viteConfig = read("vite.config.ts");
  const migration = read("neon/migrations/20261017_fast_login_municipal_user_provisioning.sql");

  it("redirects immediately after verified authentication instead of waiting for the full store", () => {
    expect(access).toContain("await signIn(email, password)");
    expect(access).toContain("navigate(resolveRedirect(result.role ?? null), { replace: true })");
    expect(access).not.toContain("dataReadyForCurrentUser");
    expect(access).not.toContain("pendingRedirect");
    expect(bootstrap).toContain("void markCurrentProfileAccess()");
  });

  it("lets a prefeitura admin manage users only in the municipal scope while protecting master roles", () => {
    expect(tenantAdmin).toContain('"prefeitura_admin"');
    expect(tenantAdmin).toContain('user.role !== "master_admin"');
    expect(tenantAdmin).toContain('user.role !== "master_ops"');
    expect(tenantAdmin).toContain("temporaryPassword");
    expect(backend).toContain('db.rpc("provision_municipal_staff_account"');
    expect(backend).toContain('credentials: "omit"');
    expect(migration).toContain("_actor_municipality_id is distinct from _municipality_id");
    expect(migration).toContain("Papeis Master nao podem ser criados pela administracao municipal");
    expect(migration).toContain("A conta pertence a outra Prefeitura");
  });

  it("keeps empty profiles visually blank and resolves saved photos from logical R2 buckets on localhost", () => {
    expect(userAvatar).toContain("sig-user-avatar-fallback");
    expect(userAvatar).not.toContain("sig-user-avatar-initials");
    expect(userAvatar).not.toContain("sig-user-avatar-icon");
    expect(viteConfig).toContain("resolveRequestedR2Bucket");
    expect(viteConfig).toContain('value === "institutional-branding" || value === "profile-assets"');
    expect(viteConfig).toContain('value === "process-documents"');
    expect(tenantAdmin).toContain("profile.avatarScale ?? 1");
    expect(tenantAdmin).toContain("profile.avatarOffsetX ?? 0");
    expect(tenantAdmin).toContain("profile.avatarOffsetY ?? 0");
  });
});
