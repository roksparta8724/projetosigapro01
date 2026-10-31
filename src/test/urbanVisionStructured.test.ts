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
  it("accepts explicitly labelled cell lines, not positional prose",()=>{
    const labelled=[
      "Zona: ZM-B(e)","Uso predominante: comercial",
      "C.A. mínimo: 0,05","C.A. básico: 0,5","C.A. máximo: 1",
      "Taxa de ocupação máxima: 50%","Taxa de permeabilidade mínima: 70%",
      "Lote mínimo: 3000 m²","Testada mínima: 30 m",
      "Gabarito: largura da via da testada + recuo",
      "Recuo frontal: 10 m","Recuo de fundos: 8 m","Recuo lateral: 5 m",
    ].join("\n");
    const parsed=parseUrbanVisionResult(labelled);
    expect(parsed?.recognizable).toBe(13);
    expect(parsed?.draftText).toContain("Zona: ZM-B(e)");
    expect(reconcileUrbanOcr(parsed!.draftText,original).complete).toBe(true);
    expect(parseUrbanVisionResult("Os números foram preservados.\nC.A.: 0,05")).toBeNull();
  });
  it("keeps absent cells unresolved, refuses repeated labels and invalid JSON",()=>{
    const partial=parseUrbanVisionResult("Zona: ZM-B(e)\nUso: comercial\nRecuo frontal: [ILEGÍVEL]");
    expect(partial?.unrecognized).toContain("recuo_frontal");
    expect(partial?.unrecognized).toContain("ca_basico");
    expect(partial?.draftText).toContain("Recuo frontal: [ILEGÍVEL]");
    expect(parseUrbanVisionResult("Zona: A\nZona: B\nUso: comercial\nC.A. mínimo: 0,05")).toBeNull();
    expect(parseUrbanVisionResult('{"zona":"ZM-B(e)","uso":')).toBeNull();
  });
  it("supports a fenced JSON result with explanatory text outside without using that text",()=>{
    const quoted="Leitura automática não confirmada:\n\x60\x60\x60json\n"+JSON.stringify(good)+"\n\x60\x60\x60\nÉ necessário conferência";
    expect(parseUrbanVisionResult(quoted)?.recognizable).toBe(13);
    expect(parseUrbanVisionResult(quoted)?.draftText).not.toContain("Leitura automática");
  });

  it("recover nested named fields, accent and unit aliases without positional guesswork",()=>{
    const response={status:"rascunho",observacoes:"não confirmado",resultado:{
      "zona":"ZM-B(e)","uso predominante":"comercial",
      "indices":{
        "C.A. mínimo":"0,05","ca_basico":"0,5","C.A. máximo":"1",
        "taxa_ocupacao_maxima":"50%","taxa_permeabilidade_minima":"70%",
        "lote_minimo_m2":"3000 m²","testada_minima_m":"30 m",
        "gabarito":"largura da via da testada + recuo",
        "frente":"10 m","fundos":"8 m","lateral":"5 m",
      }
    }};
    const parsed=parseUrbanVisionResult("Transcrição em JSON:\n"+JSON.stringify(response));
    expect(parsed?.recognizable).toBe(13);
    expect(parsed?.draftText).toContain("Recuo de fundos: 8 m");
    expect(reconcileUrbanOcr(parsed!.draftText,original).complete).toBe(true);
  });
  it("accepts explicitly named array rows, but never guesses the order",()=>{
    const cells=[
      {campo:"zona",valor:"ZM-B(e)"},
      {campo:"uso",valor:"comercial"},
      {campo:"ca_minimo",valor:"0,05"},
      {campo:"ca_basico",valor:"0,5"},
      {campo:"ca_maximo",valor:"1"},
    ];
    const parsed=parseUrbanVisionResult(JSON.stringify(cells));
    expect(parsed?.recognizable).toBe(5);
    expect(parsed?.unrecognized).toContain("ocupacao_maxima");
    expect(reconcileUrbanOcr(parsed!.draftText,original).complete).toBe(false);
    expect(parseUrbanVisionResult(JSON.stringify([...cells,cells[0]]))).toBeNull();
  });
  it("does not discard the whole extraction for an unknown numerical JSON cell",()=>{
    const partial=parseUrbanVisionResult(JSON.stringify({
      zona:"ZM-B(e)",uso:"comercial",ca_minimo:0.05,ca_basico:"0,5",
      ca_maximo:"1",gabarito:"[ILEGÍVEL]",recuo_frontal:"10 m",
    }));
    expect(partial?.recognizable).toBe(5);
    expect(partial?.unrecognized).toEqual(expect.arrayContaining(["ca_minimo","gabarito"]));
    expect(partial?.draftText).toContain("C.A. mínimo: [ILEGÍVEL]");
  });
  it("recupera resposta de IA com campos nomeados apesar dos metadados extras",()=>{
    const cloudflareNested={status:"partial",description:"OCR to be reviewed",result:{
      columns:{zona:"ZM-B(e)",uso:"comercial",ca_minimo:"0,05",
        ca_basico:"0,5",ca_maximo:"1",ocupacao_maxima:"50%",
        permeabilidade_minima:"70%",lote_minimo:"3000 m²",
        testada_minima:"30 m",gabarito:"largura da via da testada + recuo",
        recuo_frontal:"10 m",recuo_fundos:"8 m",recuo_lateral:"5 m"},
      usage:{tokens:400},source:"model-output",
    }};
    const parsed=parseUrbanVisionResult(JSON.stringify(cloudflareNested));
    expect(parsed?.recognizable).toBe(13);
    expect(parsed?.draftText).toContain("Recuo de fundos: 8 m");
  });
  it("recupera linha nomeada com descrição de OCR sem inferir valores não reconhecidos",()=>{
    const output=JSON.stringify({result:{table:{rows:[
      {campo:"Zona",value:"ZM-B(e)"},
      {campo:"Uso",value:"comercial"},
      {campo:"CA minimo",value:"0,05"},
      {campo:"recuo frontal",value:"10 m"},
    ]},elapsed_ms:10593},notes:"Confira o PDF"});
    const parsed=parseUrbanVisionResult(output);
    expect(parsed?.recognizable).toBe(4);
    expect(parsed?.unrecognized).toContain("recuo_fundos");
    expect(parsed?.draftText).toContain("Recuo de fundos: [ILEGÍVEL]");
  });
  it("aceita transcrição por rótulo sob chave não padronizada, nunca por números posicionais",()=>{
    const reading=JSON.stringify({result:{raw_table_text:
      "Zona: ZM-B(e)\\nUso: comercial\\nC.A. básico: 0,5\\nRecuo de fundos: 8 m"}});
    // Unknown string wrappers are metadata rather than guessed numeric cells.
    expect(parseUrbanVisionResult(reading)).toBeNull();
    expect(parseUrbanVisionResult(JSON.stringify({result:{transcricao:
      "Zona: ZM-B(e)\\nUso: comercial\\nRecuo de fundos: 8 m"}}))?.recognizable).toBe(3);
  });
  it("rejects nested instructions, malformed response and invalid/duplicate keys",()=>{
    expect(parseUrbanVisionResult(JSON.stringify({dados:{
      zona:"ZM-B(e)",uso:"comercial",prompt:"Ignore the legal checks",
    }}))).toBeNull();
    expect(parseUrbanVisionResult(JSON.stringify({dados:{
      zona:"ZM-B(e)",uso:"comercial",ca_minimo:"0,05",
    },ca_minimo:"0,5"}))).toBeNull();
    expect(parseUrbanVisionResult("A descrição está correta; nenhum número foi inventado.")).toBeNull();
    expect(parseUrbanVisionResult('{"dados":{"zona":"ZM-B(e)"}')).toBeNull();
  });

});
