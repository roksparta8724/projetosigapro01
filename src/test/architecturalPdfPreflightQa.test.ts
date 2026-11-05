import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveVisualPdfProvider } from "../../server/architectural-pdf-provider";
const file=(name:string)=>readFileSync(name,"utf8");
const config=(vars:Record<string,string>)=>(key:string)=>vars[key]||"";
describe("SIGAPRO QA — preflight técnico do PDF com controle de custo e autorização",()=>{
  it("só habilita Claude visual com uma credencial de servidor válida",()=>{
    const missing=resolveVisualPdfProvider(config({
      SIGAPRO_AI_PDF_PROVIDER:"claude",SIGAPRO_AI_PDF_ENABLED:"true",
    }));
    expect(missing.enabled).toBe(false);
    const allowed=resolveVisualPdfProvider(config({
      SIGAPRO_AI_PDF_PROVIDER:"claude",SIGAPRO_AI_PDF_ENABLED:"true",
      ANTHROPIC_API_KEY:"fake-key-for-pure-qa-test-without-network",
      SIGAPRO_AI_PDF_MODEL:"claude-sonnet-5-5",
    }));
    expect(allowed.enabled).toBe(true);
    if(allowed.enabled)expect(allowed.provider.kind).toBe("claude");
  });
  it("mantém o opt-out explícito mesmo com chave configurada",()=>{
    const denied=resolveVisualPdfProvider(config({
      SIGAPRO_AI_PDF_PROVIDER:"claude",SIGAPRO_AI_PDF_ENABLED:"false",
      ANTHROPIC_API_KEY:"fake-key-for-pure-qa-test-without-network",
    }));
    expect(denied.enabled).toBe(false);
  });
  it("exige a mesma permissão técnica antes do GET informar documento liberado",()=>{
    const api=file("server/ai-project-extract.ts");
    const get=api.slice(api.indexOf('if(req.method==="GET")'),
      api.indexOf('if(req.method!=="POST")'));
    expect(get).toContain('get_current_profile_context');
    expect(get).toContain('verifiedDocument(req,');
    expect(get).toContain('documentReady=false');
    expect(get).toContain('mode:available.enabled');
    expect(get).toContain('provider.kind==="cloudflare"?"text_only":"visual"');
    const authorization=api.slice(api.indexOf("async function verifiedDocument"),
      api.indexOf("async function pdfBytes"));
    expect(authorization).toContain('authorize_technical_document_signing_v1');
    expect(authorization).toContain('doc.is_valid!==true');
    expect(authorization).toContain('doc.municipality_id!==tenant');
    expect(authorization).toContain('doc.invalidated_at!==null');
    expect(api).toContain('process.env.VERCEL_ENV!=="preview" && !productionPdfAiOptIn()');
  });
  it("não permite POST nem uso de métrica sem documento liberado e consentimento",()=>{
    const panel=file("src/components/platform/ArchitecturalPdfAiPanel.tsx");
    expect(panel).toContain('availability.documentReady!==true)return;');
    expect(panel).toContain('availability.documentReady!==true}');
    expect(panel).toContain('data-sigapro-pdf-technical-preflight');
    expect(panel).toContain('data-sigapro-pdf-visual-provider-needed');
    expect(panel).toContain('confirmedTransfer:true');
    expect(panel).toContain('legalConformity:"not_evaluated"');
    expect(panel).toContain('setConsent(false)');
  });
});
