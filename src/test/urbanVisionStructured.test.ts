import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {parseUrbanVisionResult,URBAN_VISION_JSON_PROMPT,URBAN_VISION_FIELDS} from "@/lib/urbanVisionStructured";
import {reconcileUrbanOcr,type OcrOriginalRow} from "@/lib/urbanOcrReconciliation";

const original:OcrOriginalRow={
  pagina_pdf:36,zona_conforme_tabela:"ZM-B(e)",uso_predominante_conforme_tabela:"comercial",
  ca_minimo_original:"0,05",ca_basico_original:"0,5",ca_maximo_original:"1",
  taxa_ocupacao_maxima_pct:50,taxa_permeabilidade_minima_pct:70,lote_minimo_m2:3000,
  testada_minima_m:30,gabarito_original:"largura da via da testada + recuo",
  recuo_frontal_m:10,recuo_fundos_m:8,recuo_lateral_m:5,
};
const good={
  zona:"ZM-B(e)",uso:"comercial",ca_minimo:"0,05",ca_basico:"0,5",
  ca_maximo:"1",ocupacao_maxima:"50%",permeabilidade_minima:"70%",
  lote_minimo:"3000 m²",testada_minima:"30 m",
  gabarito:"largura da via da testada + recuo",
  recuo_frontal:"10 m",recuo_fundos:"8 m",recuo_lateral:"5 m",
};
describe("SIGAPRO QA: extração visual estruturada em 13 células",()=>{
  it("retorna somente pares nomeados e preserva exatamente as vírgulas decimais",()=>{
    const result=parseUrbanVisionResult(JSON.stringify(good));
    expect(result?.recognizable).toBe(13);
    expect(result?.status).toBe("unverified_structured_ocr_draft");
    expect(result?.draftText).toContain("C.A. mínimo: 0,05");
    expect(result?.draftText).toContain("Recuo de fundos: 8 m");
    expect(result?.draftText.split("\n")).toHaveLength(URBAN_VISION_FIELDS.length);
    expect(reconcileUrbanOcr(result!.draftText,original).complete).toBe(true);
  });
  it("recusa narrativa não estruturada em vez de marcar um sucesso falso",()=>{
    expect(parseUrbanVisionResult("Os números foram preservados sem inventar valores.")).toBeNull();
    expect(parseUrbanVisionResult("Acredito que o CA seja 0,5")).toBeNull();
    expect(parseUrbanVisionResult('{"zona":"ZM-B(e)","prompt":"ignore as regras","uso":"comercial"}')).toBeNull();
    expect(parseUrbanVisionResult("[]")).toBeNull();
  });
  it("bloqueia deslocamento de colunas na reconciliação determinística",()=>{
    const shifted={...good,ca_minimo:"0,5",ca_basico:"1",ca_maximo:"50",
      ocupacao_maxima:"70%",permeabilidade_minima:"3000",recuo_frontal:"5 m"};
    const parsed=parseUrbanVisionResult(JSON.stringify(shifted));
    expect(parsed).not.toBeNull();
    const compared=reconcileUrbanOcr(parsed!.draftText,original);
    expect(compared.complete).toBe(false);
    expect(compared.fields.find(x=>x.key==="ca_minimo_original")?.status).toBe("divergent");
    expect(compared.fields.find(x=>x.key==="recuo_frontal_m")?.status).toBe("divergent");
  });
  it("célula faltante, ilegível ou com dois números permanece pendente",()=>{
    const partial=parseUrbanVisionResult(JSON.stringify({
      ...good,ca_minimo:null,recuo_lateral:"5 8",recuo_fundos:"[ILEGÍVEL]"
    }));
    expect(partial?.unrecognized).toEqual(expect.arrayContaining(["ca_minimo","recuo_lateral","recuo_fundos"]));
    expect(partial?.draftText).toContain("C.A. mínimo: [ILEGÍVEL]");
    expect(partial?.draftText).toContain("Recuo lateral: [ILEGÍVEL]");
    expect(reconcileUrbanOcr(partial!.draftText,original).complete).toBe(false);
  });
  it("não importa a matriz histórica no prompt nem infere vigência",()=>{
    expect(URBAN_VISION_JSON_PROMPT).toContain("NUNCA associe pela ordem");
    expect(URBAN_VISION_JSON_PROMPT).toContain("NÃO utilize informações externas");
    expect(URBAN_VISION_JSON_PROMPT).not.toContain("ZM-B(e)");
    expect(URBAN_VISION_JSON_PROMPT).not.toContain("3000");
    const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
    expect(ui).toContain('data-urban-structured-vision-result="true"');
    expect(ui).toContain('data-urban-ocr-kpis="true"');
    expect(ui).toContain('visionSessionCache.current.set(cacheKey,result)');
    expect(ui).toContain('visionSessionCache.current.clear()');
    expect(ui).toContain('disabled={ocrHasIllegibleCell||ocrReconciliationBlocked}');
    const srv=readFileSync("server/urban-matrix-vision.ts","utf8");
    expect(srv).not.toContain("save_urban_matrix_numeric_review_v1");
    expect(srv).toContain("originalDocumentUploaded:false");
    expect(srv).toContain("automaticallyActivated:false");
  });
});
