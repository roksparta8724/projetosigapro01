import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const raster = vi.hoisted(() => {
  let sequence = 0;
  const revoke = vi.fn();
  const resolveAuthorizedAvatarUrl = vi.fn(async (_source: string) => {
    const url = "blob:https://sigapro.local/avatar-" + (++sequence);
    return { url, revoke: () => revoke(url) };
  });
  return { resolveAuthorizedAvatarUrl, revoke };
});
vi.mock("@/lib/privateAvatarRead", () => ({
  privateAvatarObjectKey: (source: string) => source.startsWith("/api/profile-avatar-open?objectKey=") ? source : "",
  resolveAuthorizedAvatarUrl: raster.resolveAuthorizedAvatarUrl,
}));
import {
  clearAuthorizedAvatarRuntimeCache, getAuthorizedAvatarRuntimeUrl, loadAuthorizedAvatarRuntimeUrl,
} from "@/lib/authorizedAvatarRuntimeCache";

const photoA = "/api/profile-avatar-open?objectKey=municipalities%2Fmunicipal-a%2Fprofiles%2Favatars%2Fuser-a%2Fphoto.webp";
const photoB = "/api/profile-avatar-open?objectKey=municipalities%2Fmunicipal-a%2Fprofiles%2Favatars%2Fuser-b%2Fphoto.webp";

afterEach(() => {
  clearAuthorizedAvatarRuntimeCache();
  vi.clearAllMocks();
});

describe("SIGAPRO — fotos rápidas e cadastro premium em homologação", () => {
  it("carrega a mesma foto autorizada somente uma vez e a reutiliza entre páginas", async () => {
    const [first, second] = await Promise.all([
      loadAuthorizedAvatarRuntimeUrl("viewer-a", photoA),
      loadAuthorizedAvatarRuntimeUrl("viewer-a", photoA),
    ]);
    expect(first).toBe(second);
    expect(raster.resolveAuthorizedAvatarUrl).toHaveBeenCalledTimes(1);
    expect(getAuthorizedAvatarRuntimeUrl("viewer-a", photoA)).toBe(first);
    expect(getAuthorizedAvatarRuntimeUrl("viewer-a", photoB)).toBe("");
  });

  it("mantém URLs distintas por foto e revoga tudo na troca de conta", async () => {
    const a = await loadAuthorizedAvatarRuntimeUrl("viewer-a", photoA);
    const b = await loadAuthorizedAvatarRuntimeUrl("viewer-a", photoB);
    expect(b).not.toBe(a);
    expect(getAuthorizedAvatarRuntimeUrl("viewer-a", photoA)).toBe(a);
    await loadAuthorizedAvatarRuntimeUrl("viewer-b", photoA);
    expect(raster.revoke).toHaveBeenCalledWith(a);
    expect(raster.revoke).toHaveBeenCalledWith(b);
    expect(getAuthorizedAvatarRuntimeUrl("viewer-a", photoA)).toBe("");
  });

  it("a listagem e o Master utilizam a identidade da sessão para não refazer GET por navegação", () => {
    const registry = read("src/components/platform/CompactUserRegistry.tsx");
    const master = read("src/pages/saas/MasterAdminPage.tsx");
    const municipal = read("src/pages/saas/TenantAdminPage.tsx");
    expect(registry).toContain("authenticatedOwnerId={authorizedViewerId}");
    expect(master).toContain("authenticatedOwnerId={authorizedAvatarViewerId}");
    expect(municipal).toContain("authenticatedOwnerId={authorizedAvatarViewerId}");
    expect(read("src/lib/authorizedAvatarRuntimeCache.ts")).toContain("const MAX_CACHED_IMAGES = 24;");
  });

  it("a miniatura de recarga pertence somente ao próprio cabeçalho autenticado", () => {
    const avatar = read("src/components/platform/UserAvatar.tsx");
    expect(avatar).toContain("!props.preservePhotoDuringRefresh || !privateSource");
    expect(avatar).toContain("props.preservePhotoDuringRefresh");
    expect(avatar).toContain('source:${owner}:${props.imageUrl || ""}');
    expect(avatar).toContain("clearAvatarSessionThumbnailForOwner(authenticatedOwnerId)");
  });

  it("não há painel superior vazio: header, resumo e tabela ficam na mesma seção compacta", () => {
    const admin = read("src/pages/saas/TenantAdminPage.tsx");
    const start = admin.indexOf('{workspaceView === "usuarios" ? (');
    const end = admin.indexOf('{workspaceView === "organograma" ? (', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const users = admin.slice(start, end);
    expect(users).toContain('data-municipal-users-pane="premium-v7"');
    expect(users).toContain('data-municipal-users-toolbar="compact-v7"');
    expect(users).toContain('data-municipal-users-summary="compact-v6"');
    expect(users).toContain("<CompactUserRegistry");
    expect(users).not.toContain('<TableCard title="Gestão de usuários"');
    expect(users).not.toContain("<PageStatsRow");
    expect(users.indexOf("data-municipal-users-toolbar")).toBeLessThan(users.indexOf("<CompactUserRegistry"));
    expect(admin).toContain('hideSectionHeader={workspaceView === "usuarios"}');
  });

  it("mantém o tema invertido premium limitado à aba e não afeta os demais cards", () => {
    const css = read("src/styles/municipal-users-premium-v7.css");
    expect(css).toContain('[data-municipal-users-pane="premium-v7"]');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain('data-sigapro-user-registry="compact"');
    expect(read("src/main.tsx")).toContain('import "./styles/municipal-users-premium-v7.css";');
  });
});
