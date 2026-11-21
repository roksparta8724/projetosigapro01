import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveMasterUserMunicipalityScope } from "@/components/platform/MasterUserGovernance";
import type { SessionUser } from "@/lib/platform";

const page = readFileSync("src/pages/saas/MasterAdminPage.tsx", "utf8");
const panel = readFileSync("src/components/platform/MasterUserGovernance.tsx", "utf8");
const styles = readFileSync("src/styles/master-user-governance.css", "utf8");
const frame = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
type ScopeInput = Pick<SessionUser, "role" | "municipalityId" | "tenantId">;
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const known = new Set([a, b]);
const user = (role: ScopeInput["role"], municipalityId?: string | null, tenantId?: string | null): ScopeInput =>
  ({ role, municipalityId, tenantId });

describe("SIGAPRO Master — Gestão por prefeitura e identidade premium", () => {
  it("separa os cadastros por município sem misturar usuários de outras prefeituras", () => {
    expect(resolveMasterUserMunicipalityScope(user("analista", a, a), known)).toBe(a);
    expect(resolveMasterUserMunicipalityScope(user("financeiro", b, b), known)).toBe(b);
    expect(resolveMasterUserMunicipalityScope(user("prefeitura_admin", a, undefined), known)).toBe(a);
    expect(resolveMasterUserMunicipalityScope(user("analista", undefined, b), known)).toBe(b);
  });

  it("mantém administradores Master separados da carteira municipal", () => {
    expect(resolveMasterUserMunicipalityScope(user("master_admin", a, a), known)).toBe("__sigapro_platform__");
    expect(resolveMasterUserMunicipalityScope(user("master_ops", b, b), known)).toBe("__sigapro_platform__");
    expect(panel).toContain('data-master-platform-option="true"');
  });

  it("não atribui automaticamente contas sem vínculo ou com vínculo municipal conflitante", () => {
    expect(resolveMasterUserMunicipalityScope(user("analista", null, null), known)).toBe("__sigapro_unlinked__");
    expect(resolveMasterUserMunicipalityScope(user("analista", a, b), known)).toBe("__sigapro_unlinked__");
    expect(resolveMasterUserMunicipalityScope(user("prefeitura_admin", "unknown", "unknown"), known)).toBe("__sigapro_unlinked__");
    expect(panel).toContain('data-master-review-option="true"');
    expect(panel).toContain("Nenhuma conta deste grupo é automaticamente vinculada");
  });

  it("preserva ações oficiais da conta e impede que a lista do Master altere usuários sozinha", () => {
    expect(page).toContain("renderDetails={renderUserCard}");
    expect(page).toContain("handleMasterEdit(user)");
    expect(page).toContain("handleMasterStatusToggle(user)");
    expect(page).toContain("handleMasterDelete(user)");
    expect(panel).not.toContain("updateTenantUser(");
    expect(panel).not.toContain("setUserAccountStatus(");
    expect(panel).not.toContain("deleteUserAccount(");
    expect(panel).toContain("onManageMunicipality(selectedMunicipality.id)");
    expect(page).toContain("onManageMunicipality={handleSelectTenant}");
    expect(page).toContain('params.set("secao", "cadastro")');
  });

  it("usa diretório por prefeitura, indicadores próprios, perfis e buscas internas", () => {
    expect(page).toContain("<MasterUserGovernance");
    expect(panel).toContain('data-master-user-governance="true"');
    expect(panel).toContain('data-master-municipality-directory="true"');
    expect(panel).toContain('data-master-governance-metrics="true"');
    expect(panel).toContain('data-master-selected-summary="true"');
    expect(panel).toContain("const scopedUsers = byScope.get(activeScope)");
    expect(panel).toContain("const visibleUsers = scopedUsers.filter(");
    expect(panel).toContain('aria-label="Buscar prefeitura"');
    expect(panel).toContain('aria-label="Buscar usuário da prefeitura selecionada"');
    expect(panel).toContain('label={"Usuários vinculados a " + selectedLabel}');
    expect(page).not.toContain('label="Usuários da plataforma SIGAPRO"');
  });

  it("mantém fotos reais e paginação; seleção de Prefeitura reseta filtros cruzados", () => {
    expect(page).toContain("getAvatarProfile={(user) => getUserProfile(user.id, user.email) ?? null}");
    expect(panel).toContain("pageSize={12}");
    expect(panel).toContain("setUserQuery(\"\")");
    expect(panel).toContain("setStatus(\"todos\")");
    expect(panel).toContain("setRole(\"todos\")");
    expect(panel).toContain("setPage(1)");
  });

  it("corrige a proporção do logo Master sem interferir no brasão das prefeituras", () => {
    expect(frame).toContain('variant={isMasterUser ? "compact" : "header"}');
    expect(frame).toContain('contextScope={isMasterUser ? "master" : "municipality"}');
    expect(frame).toContain('!h-[56px] !w-[56px]');
    expect(frame).toContain("compactHeader &&");
  });

  it("aplica visual premium com contraste próprio nos dois temas, isolado no Master", () => {
    expect(styles).toContain('.sig-master-governance');
    expect(styles).toContain('[data-layout-mode="inverse-main"]');
    expect(styles).toContain('.sig-master-governance-option[aria-pressed="true"]');
    expect(styles).toContain(".sig-master-governance-search::placeholder");
    expect(styles).toContain('.sig-master-governance-tabs [role="tab"][data-state="active"]');
    expect(styles).toContain('[data-sigapro-user-registry="compact"]');
    expect(styles).not.toContain(".sig-premium-topbar");
    expect(styles).not.toContain(".sig-finance-ledger");
  });
});
