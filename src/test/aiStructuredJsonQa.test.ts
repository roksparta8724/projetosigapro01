import {describe,expect,it,vi,afterEach} from "vitest";
import {parseOnePdfReadingJson} from "@/lib/aiStructuredJson";
import {extractVisualPdf} from "../../server/architectural-pdf-provider";

const object={
  document_type:"architectural_plan",has_site_plan:false,
  metrics:[{metric:"lot_area_m2",value:250,page:1,quote:"Área do lote 250 m²",confidence:"high"}],
  warnings:["Leitura documental requer conferência humana"],
};
afterEach(()=>vi.unstubAllGlobals());

describe("SIGAPRO QA — origem CLOUDFLARE_MODEL_INVALID_JSON do vídeo 18h43",()=>{
  it("aceita só um JSON válido, também se envolto em cerca ou texto explicativo",()=>{
    const plain=JSON.stringify(object);
    expect(parseOnePdfReadingJson(plain)).toEqual(object);
    expect(parseOnePdfReadingJson("Resultado estruturado:\n\`\`\`json\n"+plain+"\n\`\`\`\nFim da extração.")).toEqual(object);
  });
  it("preserva texto com aspas e chaves e não interpreta o conteúdo como outra estrutura",()=>{
    const doc={...object,warnings:['Texto literal: "{recuo} 5,00 m"']};
    expect(parseOnePdfReadingJson("Resumo: "+JSON.stringify(doc))).toEqual(doc);
  });
  it("recusa segundo JSON, chaves ausentes, truncamento e payload gigante",()=>{
    const plain=JSON.stringify(object);
    for(const value of [
      plain+"\n"+plain,
      plain.slice(0,-1),
      '{"document_type":"architectural_plan","metrics":[]}',
      "{}",
      "Nenhuma resposta válida",
      "{".repeat(65)+"}",
      "a".repeat(65001),
    ])expect(()=>parseOnePdfReadingJson(value)).toThrow("CLOUDFLARE_MODEL_INVALID_JSON");
  });
  it("detecta finish_reason length antes de validar JSON sem repetir uma cobrança",async()=>{
    const token="qa-free-provider-token";
    let call=0;
    vi.stubGlobal("fetch",vi.fn(async()=>{
      call++;
      if(call===1)return {ok:true,json:async()=>({success:true,
        result:[{format:"markdown",data:"## Página 1\nÁrea do lote 250 m²\nImplantação"}]})};
      return {ok:true,json:async()=>({choices:[{finish_reason:"length",
        message:{content:'{"document_type":"architectural_plan","metrics":['}}]})};
    }));
    await expect(extractVisualPdf(new TextEncoder().encode("%PDF-"),"qa04.pdf",{
      kind:"cloudflare",key:token,accountId:"a".repeat(32),model:"@cf/zai-org/glm-4.7-flash",
    })).rejects.toThrow("CLOUDFLARE_MODEL_INCOMPLETE");
    expect(call).toBe(2);
  });
  it("aceita JSON único válido do modelo e mantém recuos do texto bloqueados",async()=>{
    let call=0;
    vi.stubGlobal("fetch",vi.fn(async()=>{
      call++;
      if(call===1)return {ok:true,json:async()=>({success:true,
        result:[{format:"markdown",data:"## Página 1\nÁrea do lote 250 m²\nRecuo frontal: 5,00 m"}]})};
      return {ok:true,json:async()=>({choices:[{finish_reason:"stop",
        message:{content:"Dados processados:\n"+JSON.stringify({
          ...object,metrics:[...object.metrics,
            {metric:"front_setback_m",value:5,page:1,quote:"Recuo frontal: 5,00 m",confidence:"high"}],
        })}}]})};
    }));
    const x=await extractVisualPdf(new TextEncoder().encode("%PDF-"),"qa04.pdf",{
      kind:"cloudflare",key:"qa",accountId:"a".repeat(32),model:"@cf/zai-org/glm-4.7-flash",
    });
    expect(x.readings.find(r=>r.metric==="lot_area_m2")?.value).toBe(250);
    expect(x.readings.find(r=>r.metric==="front_setback_m")?.value).toBeNull();
    expect(x.automaticallyApproved).toBe(false);
    expect(call).toBe(2);
  });
});
