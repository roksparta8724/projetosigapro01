import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolveVisualPdfProvider, extractVisualPdf } from "../../server/architectural-pdf-provider";

const KEY="sk-ant-test-a-long-secret-key-not-real-123456789";
function env(vars:Record<string,string>){
  return (name:string)=>vars[name]||"";
}
afterEach(()=>vi.unstubAllGlobals());
describe("SIGAPRO — Claude PDF visual via stored R2 attachments",()=>{
  it("reuses explicitly selected Claude without requiring an OpenAI key",()=>{
    const provider=resolveVisualPdfProvider(env({
      SIGAPRO_AI_PROVIDER:"claude", ANTHROPIC_API_KEY:KEY,
    }));
    expect(provider.enabled).toBe(true);
    if(provider.enabled){
      expect(provider.provider.kind).toBe("claude");
      expect(provider.provider.model).toBe("claude-sonnet-5-5");
    }
  });
  it("selects the existing Cloudflare Workers AI REST credentials without a new API key",()=>{
    const cfg=resolveVisualPdfProvider(env({
      SIGAPRO_AI_PROVIDER:"cloudflare",
      SIGAPRO_CF_ACCOUNT_ID:"a".repeat(32),
      SIGAPRO_CF_API_TOKEN:KEY,
    }));
    expect(cfg.enabled).toBe(true);
    if(cfg.enabled){
      expect(cfg.provider.kind).toBe("cloudflare");
      expect(cfg.provider.model).toBe("@cf/zai-org/glm-4.7-flash");
    }
  });
  it("automatically reuses an existing QA Claude key without another flag",()=>{
    const cfg=resolveVisualPdfProvider(env({ANTHROPIC_API_KEY:KEY}));
    expect(cfg.enabled).toBe(true);
    if(cfg.enabled)expect(cfg.provider.kind).toBe("claude");
    const alternate=resolveVisualPdfProvider(env({SIGAPRO_CLAUDE_API_KEY:KEY}));
    expect(alternate.enabled).toBe(true);
  });
  it("does not mistake R2 or chat-only Workers AI credentials for a PDF vision provider",()=>{
    expect(resolveVisualPdfProvider(env({R2_ACCESS_KEY_ID:"secret",R2_SECRET_ACCESS_KEY:"r2secret"})).enabled)
      .toBe(false);
    expect(resolveVisualPdfProvider(env({SIGAPRO_AI_PROVIDER:"cloudflare",SIGAPRO_CF_API_TOKEN:"token"})).enabled)
      .toBe(false);
    expect(resolveVisualPdfProvider(env({SIGAPRO_AI_PROVIDER:"claude",OPENAI_API_KEY:KEY})).enabled)
      .toBe(false);
    expect(resolveVisualPdfProvider(env({SIGAPRO_AI_PROVIDER:"claude",ANTHROPIC_API_KEY:KEY,
      SIGAPRO_AI_PDF_ENABLED:"false"})).enabled).toBe(false);
  });
  it("prioritizes an existing Claude PDF credential when chat uses OpenAI",()=>{
    const detected=resolveVisualPdfProvider(env({
      SIGAPRO_AI_PROVIDER:"openai",ANTHROPIC_API_KEY:KEY,
    }));
    expect(detected.enabled).toBe(true);
    if(detected.enabled)expect(detected.provider.kind).toBe("claude");
    const forced=resolveVisualPdfProvider(env({
      SIGAPRO_AI_PROVIDER:"openai",ANTHROPIC_API_KEY:KEY,
      SIGAPRO_AI_PDF_PROVIDER:"openai",SIGAPRO_AI_PDF_ENABLED:"true",
    }));
    expect(forced.enabled).toBe(false);
  });
  it("supports opt-in Claude independent of the chat provider",()=>{
    const cfg=resolveVisualPdfProvider(env({
      SIGAPRO_AI_PROVIDER:"cloudflare",SIGAPRO_AI_PDF_ENABLED:"true",
      SIGAPRO_AI_PDF_PROVIDER:"claude",ANTHROPIC_API_KEY:KEY,
    }));
    expect(cfg.enabled).toBe(true);
    if(cfg.enabled)expect(cfg.provider.kind).toBe("claude");
  });
  it("sends a PDF document to the fixed Claude API, parses schema and never approves",async()=>{
    const fake=vi.fn(async(url:string,options:RequestInit)=>{
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(options.redirect).toBe("error");
      const headers=options.headers as Record<string,string>;
      expect(headers["x-api-key"]).toBe(KEY);
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      const body=JSON.parse(String(options.body));
      expect(body.model).toBe("claude-sonnet-5-5");
      expect(body.output_config.format.type).toBe("json_schema");
      const doc=body.messages[0].content[0];
      expect(doc.type).toBe("document");
      expect(doc.source.media_type).toBe("application/pdf");
      expect(doc.source.type).toBe("base64");
      expect(doc.source.data).toBe(Buffer.from("%PDF- test architectural plan").toString("base64"));
      expect(JSON.stringify(body)).not.toContain("Bearer");
      return {ok:true,status:200,json:async()=>({
        stop_reason:"end_turn",
        content:[{type:"text",text:JSON.stringify({
          document_type:"architectural_plan",has_site_plan:true,
          metrics:[{metric:"front_setback_m",value:5,page:1,
            quote:"RECUO FRONTAL 5,00 m",confidence:"high"}],warnings:[],
        })}],
      })};
    });
    vi.stubGlobal("fetch",fake);
    const result=await extractVisualPdf(new TextEncoder().encode("%PDF- test architectural plan"),
      "planta.pdf",{kind:"claude",model:"claude-sonnet-5-5",key:KEY});
    expect(fake).toHaveBeenCalledOnce();
    expect(result.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({
      value:5,usableForReview:true,page:1,
    });
    expect(result.automaticallyApproved).toBe(false);
  });
  it("refuses a Claude truncated response and never changes process records",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({
      ok:true,status:200,json:async()=>({stop_reason:"max_tokens",content:[{type:"text",text:"{}"}]}),
    })));
    await expect(extractVisualPdf(new TextEncoder().encode("%PDF-"),
      "planta.pdf",{kind:"claude",model:"claude-sonnet-5-5",key:KEY}))
      .rejects.toThrow("AI_INCOMPLETE");
  });
  it("blocks invalidated architectural drawings, even when a document ID is known",()=>{
    const route=readFileSync("server/ai-project-extract.ts","utf8");
    expect(route).toContain("doc.is_valid!==true");
    expect(route).toContain("doc.invalidated_at!==null");
    expect(route).toContain('sameDocument.version!==doc.version');
    expect(route).toContain('AI_DOCUMENT_REVISED');
  });
  it("blocks setbacks when the site implantation drawing was not recognized",async()=>{
    const {normalizeArchitecturalPdfExtraction}=await import("@/lib/architecturalPdfReadings");
    const output=normalizeArchitecturalPdfExtraction({
      document_type:"architectural_plan",has_site_plan:false,metrics:[
        {metric:"front_setback_m",value:5,page:1,quote:"Recuo frontal: 5 m",confidence:"high"},
        {metric:"floor_area_ratio",value:1.2,page:1,quote:"Coef. apro. = 1.2",confidence:"high"},
      ],warnings:[],
    });
    expect(output.readings.find(x=>x.metric==="front_setback_m")?.usableForReview).toBe(false);
    expect(output.readings.find(x=>x.metric==="floor_area_ratio")?.usableForReview).toBe(true);
  });
  it("exige credencial independente para a Leitura Avançada visual, sem usar ChatGPT Plus",()=>{
    const denied=resolveVisualPdfProvider(env({SIGAPRO_AI_PDF_PROVIDER:"claude",
      ANTHROPIC_API_KEY:KEY}),"openai_visual");
    expect(denied.enabled).toBe(false);
    const cfg=resolveVisualPdfProvider(env({
      SIGAPRO_AI_PDF_PROVIDER:"claude",SIGAPRO_AI_PDF_MODEL:"claude-sonnet-5-5",
      OPENAI_API_KEY:"sk-test-only-fake-openai-credential-00000000001",
      SIGAPRO_OPENAI_PDF_MODEL:"gpt-6.1-sol",
    }),"openai_visual");
    expect(cfg.enabled).toBe(true);
    if(cfg.enabled)expect(cfg.provider).toMatchObject({kind:"openai",model:"gpt-6.1-sol"});
    expect(resolveVisualPdfProvider(env({
      OPENAI_API_KEY:"sk-test-only-fake-openai-credential-00000000001",
      SIGAPRO_OPENAI_PDF_MODEL:"http://untrusted-provider.example",
    }),"openai_visual").enabled).toBe(false);
  });
  it("envia PDF com imagens em alta definição ao endpoint fixo OpenAI Responses e valida JSON",async()=>{
    const token="sk-test-only-fake-openai-credential-00000000001";
    const fetchMock=vi.fn(async(url:string,opts:RequestInit)=>{
      expect(url).toBe("https://api.openai.com/v1/responses");
      expect(opts.redirect).toBe("error");
      expect((opts.headers as Record<string,string>).Authorization).toBe("Bearer "+token);
      const body=JSON.parse(String(opts.body));
      expect(body.store).toBe(false);
      expect(body.model).toBe("gpt-6.1-sol");
      expect(body.input[0].content[0]).toMatchObject({
        type:"input_file",filename:"projeto.pdf",detail:"high",
        file_data:"data:application/pdf;base64,"+Buffer.from("%PDF- fake").toString("base64"),
      });
      expect(body.text.format).toMatchObject({type:"json_schema",
        name:"sigapro_architectural_readings_v1",strict:true});
      return {ok:true,json:async()=>({status:"completed",output:[{type:"message",
        content:[{type:"output_text",text:JSON.stringify({
          document_type:"architectural_plan",has_site_plan:true,warnings:[],
          metrics:[{metric:"rear_setback_m",value:12,page:2,
            quote:"Recuo de fundos 12,00 m",confidence:"high"}],
        })}]}]})};
    });
    vi.stubGlobal("fetch",fetchMock);
    const output=await extractVisualPdf(new TextEncoder().encode("%PDF- fake"),
      "projeto.pdf",{kind:"openai",key:token,model:"gpt-6.1-sol"});
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(output.readings.find(x=>x.metric==="rear_setback_m")).toMatchObject({
      value:12,page:2,usableForReview:true,
    });
    expect(output.automaticallyApproved).toBe(false);
  });
  it("bloqueia falsas leituras visuais em vez de preencher recuos sem fonte",async()=>{
    const token="sk-test-only-fake-openai-credential-00000000001";
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({
      status:"completed",output:[{type:"message",content:[{type:"output_text",
        text:JSON.stringify({document_type:"architectural_plan",has_site_plan:true,
          warnings:[],metrics:[{metric:"front_setback_m",value:3,page:1,
            quote:"Área do lote 250 m²",confidence:"high"}]})}]}],
    })})));
    const output=await extractVisualPdf(new TextEncoder().encode("%PDF- fake"),
      "projeto.pdf",{kind:"openai",key:token,model:"gpt-4.1"});
    expect(output.readings.find(x=>x.metric==="front_setback_m")?.value).toBeNull();
  });

});
