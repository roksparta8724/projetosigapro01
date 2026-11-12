import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const sign=readFileSync("server/api/r2-sign-get.ts","utf8");
const upload=readFileSync("server/api/r2-upload.ts","utf8");

describe("SIGAPRO: somente PDF original com bytes autênticos recebe URL assinada",()=>{
  it("consultas R2 e BYOS conferem o SHA real da DAM antes de assinar",()=>{
    expect(sign).toContain("import { assertStoredDamOriginal, DAM_ORIGINAL_KEY }");
    expect(sign).toContain("const expectedDamSha = isGuideOriginal");
    expect(sign).toContain("await assertStoredDamOriginal(municipalTarget.client,{");
    expect(sign).toContain("await assertStoredDamOriginal(client,{");
    const byos=sign.indexOf("await assertStoredDamOriginal(municipalTarget.client,{");
    const byosSign=sign.indexOf("const signedUrl = await getSignedUrl(",byos);
    const r2=sign.indexOf("await assertStoredDamOriginal(client,{");
    const r2Sign=sign.indexOf("signedUrl = await getSignedUrl(",r2);
    expect(byosSign).toBeGreaterThan(byos);
    expect(r2Sign).toBeGreaterThan(r2);
    expect(sign).toContain("expectedBytes:Number(head.ContentLength||0)");
    expect(sign).toContain("if (objectKey.includes(\"/dam-originals/\") && bucket !== documentsBucket)");
  });
  it("somente originais DAM usam GET completo, demais anexos mantêm HEAD leve",()=>{
    expect(sign).toContain("if (isGuideOriginal) {");
    expect(sign).toContain("new HeadObjectCommand");
    expect(sign).toContain("authorize_payment_guide_original_read_v1");
    expect(sign).toContain("authorizePrivateR2DocumentRead(req, objectKey, municipalityId)");
  });
  it("falha de integridade nunca retorna uma URL assinada em resposta de sucesso",()=>{
    expect(sign).toContain("throw lastError instanceof Error");
    expect(sign).toContain("classifyR2SignFailure(error)");
    expect(upload).toContain("await assertStoredDamOriginal(client, {");
    expect(upload).toContain("await assertStoredDamOriginal(municipalTarget.client, {");
  });
});
