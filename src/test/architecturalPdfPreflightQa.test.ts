import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyVisualPdfHttpFailure, resolveVisualPdfProvider } from "../../server/architectural-pdf-provider";
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
  it("diferencia credencial configurada de crédito de API sem realizar chamada real",()=>{
    const api=file("server/ai-project-extract.ts");
    const ui=file("src/components/platform/ArchitecturalPdfAiPanel.tsx");
    expect(api).toContain('providerConfiguredOnly:true');
    expect(api).toContain('billingVerified:false');
    expect(ui).toContain('data-sigapro-claude-credit-not-verified="true"');
    expect(api).toContain('code==="AI_PROVIDER_BILLING"');
    expect(api).toContain('nenhuma medida foi aplicada');
  });
  it("identifica 402 e limite de gastos 400 sem confundir com token inválido",()=>{
    expect(classifyVisualPdfHttpFailure(402,"claude")).toBe("AI_PROVIDER_BILLING");
    expect(classifyVisualPdfHttpFailure(400,"claude",{
      error:{type:"invalid_request_error",
        message:"Your credit balance is too low to access the Anthropic API."},
    })).toBe("AI_PROVIDER_BILLING");
    expect(classifyVisualPdfHttpFailure(400,"claude",{
      error:{type:"invalid_request_error",message:"Workspace spend limit reached."},
    })).toBe("AI_PROVIDER_BILLING");
    expect(classifyVisualPdfHttpFailure(400,"claude",{
      error:{type:"invalid_request_error",message:"Schema is invalid."},
    })).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyVisualPdfHttpFailure(401,"claude")).toBe("AI_PROVIDER_CREDENTIALS");
    expect(classifyVisualPdfHttpFailure(403,"claude")).toBe("AI_PROVIDER_CREDENTIALS");
    expect(classifyVisualPdfHttpFailure(429,"claude")).toBe("AI_RATE_LIMIT");
    expect(classifyVisualPdfHttpFailure(404,"claude")).toBe("AI_PROVIDER_MODEL_UNAVAILABLE");
    expect(classifyVisualPdfHttpFailure(503,"claude")).toBe("PROVIDER_UNAVAILABLE");
  });
  it("aceita modelo Claude major-only 5 sem mudar o modelo configurado por padrão",()=>{
    const result=resolveVisualPdfProvider(config({
      SIGAPRO_AI_PDF_PROVIDER:"claude",SIGAPRO_AI_PDF_ENABLED:"true",
      ANTHROPIC_API_KEY:"fake-key-for-pure-qa-test-without-network",
      SIGAPRO_AI_PDF_MODEL:"claude-sonnet-5",
    }));
    expect(result.enabled).toBe(true);
    if(result.enabled)expect(result.provider.model).toBe("claude-sonnet-5");
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
  it("oferece Cloudflare textual apenas por seleção explícita sem mexer no Claude padrão",()=>{
    const env=config({
      SIGAPRO_AI_PROVIDER:"cloudflare",
      SIGAPRO_AI_PDF_PROVIDER:"claude",
      SIGAPRO_AI_PDF_ENABLED:"true",
      ANTHROPIC_API_KEY:"fake-key-for-pure-qa-test-without-network",
      SIGAPRO_CF_ACCOUNT_ID:"a".repeat(32),
      SIGAPRO_CF_API_TOKEN:"fake-cloudflare-token-for-unit-testing-12345",
    });
    const configured=resolveVisualPdfProvider(env);
    expect(configured.enabled).toBe(true);
    if(configured.enabled)expect(configured.provider.kind).toBe("claude");
    const textual=resolveVisualPdfProvider(env,"cloudflare_text");
    expect(textual.enabled).toBe(true);
    if(textual.enabled){
      expect(textual.provider.kind).toBe("cloudflare");
      expect(textual.provider.model).toBe("@cf/zai-org/glm-4.7-flash");
    }
    const disabled=resolveVisualPdfProvider(config({
      SIGAPRO_AI_PDF_ENABLED:"false",
      SIGAPRO_CF_ACCOUNT_ID:"a".repeat(32),
      SIGAPRO_CF_API_TOKEN:"fake-cloudflare-token-for-unit-testing-12345",
    }),"cloudflare_text");
    expect(disabled.enabled).toBe(false);
  });
  it("não troca de fornecedor automaticamente sem novo aceite ou isolamento preview",()=>{
    const api=file("server/ai-project-extract.ts");
    const ui=file("src/components/platform/ArchitecturalPdfAiPanel.tsx");
    expect(api).toContain('const textRequested=body.readingMode==="cloudflare_text"');
    expect(api).toContain('if(textRequested && process.env.VERCEL_ENV!=="preview")');
    expect(api).toContain('body.confirmedTransfer!==true');
    expect(api).toContain('textAlternativeAvailable:textAlternative?.enabled===true');
    expect(api).toContain('textRequested?"cloudflare_text":undefined');
    expect(api).toContain('get_current_profile_context');
    expect(api).toContain('verifiedDocument(req,tenant,processId,documentId)');
    expect(ui).toContain('data-sigapro-ai-mode-visual="true"');
    expect(ui).toContain('data-sigapro-ai-mode-cloudflare-text="true"');
    expect(ui).toContain('setReadingMode(next);setConsent(false);setDraft(null)');
    expect(ui).toContain('confirmedTransfer:true,readingMode');
    expect(ui).toContain('data-sigapro-ai-credit-alternative="true"');
    expect(ui).toContain('readingMode==="cloudflare_text"&&');
    expect(ui).toContain('result.source!=="ai_pdf_text"||result.aiProvider!=="cloudflare"');
    expect(ui).toContain('Nenhuma decisão nem mudança de processo será automática.');
    expect(ui).toContain('[overflow-wrap:anywhere]');
  });

});
