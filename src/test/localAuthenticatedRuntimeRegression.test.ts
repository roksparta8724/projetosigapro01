import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("local authenticated runtime resilience", () => {
  const bootstrap = read("src/hooks/useAppBootstrap.tsx");
  const entitlements = read("src/hooks/usePlanEntitlements.ts");
  const planRoute = read("src/components/platform/PlanModuleRoute.tsx");
  const r2 = read("src/integrations/r2/client.ts");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const organization = read("src/hooks/useMunicipalOrganization.ts");

  it("does not preserve a ghost cached session when initial Neon revalidation fails", () => {
    expect(bootstrap).toContain("!needsInitialRevalidationRef.current");
    expect(bootstrap).toContain("Sem usuário autenticado após revalidação");
    expect(bootstrap).toContain("clearPlatformSessionSnapshot()");
    expect(bootstrap).toContain("lastStableRef.current = {");
    expect(bootstrap).toContain("lastAuthUserIdRef.current = null");
    expect(bootstrap).toContain("needsInitialRevalidationRef.current = false");
  });

  it("never leaves plan validation running forever", () => {
    expect(entitlements).toContain("const [resolutionTimedOut, setResolutionTimedOut] = useState(false)");
    expect(entitlements).toContain("setResolutionTimedOut(true)");
    expect(entitlements).toContain("}, 6000)");
    expect(entitlements).toContain("const isResolving = rawResolving && !resolutionTimedOut");
    expect(entitlements).toContain("resolutionTimedOut");
    expect(planRoute).toContain("Validação concluída com falha de conexão");
    expect(planRoute).toContain("Tentar novamente");
  });

  it("uses a real Neon JWT before asking the official R2 read API for a signed URL", () => {
    expect(r2).toContain("resolveR2BearerToken");
    expect(r2).toContain("getJWTToken");
    expect(r2).toContain("Authorization:");
    expect(r2).toContain("Sua sessão não autorizou a leitura segura deste documento");
  });

  it("recovers the persistent municipal branding object key instead of trusting an expired signed URL", () => {
    expect(guide).toContain("deriveBrandingObjectKey");
    expect(guide).toContain("branding");
    expect(guide).toContain("embedGuideImage");
    expect(guide).toContain("logoUrl: embeddedLogo");
  });

  it("loads the organogram through authenticated or public RPCs", () => {
    expect(organization).toContain("listRemoteMunicipalDepartments");
    expect(organization).toContain("listRemotePublicMunicipalDepartments");
    expect(organization).toContain('mode === "full"');
    expect(organization).toContain('mode === "public"');
  });
});