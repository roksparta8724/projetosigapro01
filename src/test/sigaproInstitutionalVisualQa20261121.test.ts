import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const src=(name:string)=>readFileSync(name,"utf8");
describe("SIGAPRO visual identity QA",()=>{
  it("embeds logo on both topbars instead of requesting image assets",()=>{
    const frame=src("src/components/platform/PortalFrame.tsx");
    expect(frame.match(/<TopbarBrandMark \/>/g)).toHaveLength(2);
    expect(frame).not.toContain('getPublicAssetUrl("favicon-sigapro.svg")');
  });
  it("removes the oversized Voltar-only institutional panel",()=>{
    const config=src("src/pages/saas/ConfiguracoesPage.tsx");
    expect(config).toContain('className="sig-institutional-config-panel"');
    expect(config).not.toContain('onClick={() => navigate(-1)}');
  });
  it("falls back to the authorized original only if the private thumbnail cannot be served",()=>{
    const code=src("src/lib/privateAvatarRead.ts");
    expect(code).toContain('response = await getPrivateImage("original")');
    expect(code).toContain('Authorization: "Bearer " + token');
  });
});
