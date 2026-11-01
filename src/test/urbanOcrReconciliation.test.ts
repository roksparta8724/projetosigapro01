import {describe,it,expect} from "vitest";
import {reconcileUrbanOcr,type OcrOriginalRow} from "@/lib/urbanOcrReconciliation";
const row:OcrOriginalRow={
  pagina_pdf:36,zona_conforme_tabela:"ZM-B(e)",uso_predominante_conforme_tabela:"comercial",
  ca_minimo_original:"0,05",ca_basico_original:"0,5",ca_maximo_original:"1",
  taxa_ocupacao_maxima_pct:50,taxa_permeabilidade_minima_pct:70,lote_minimo_m2:3000,
  testada_minima_m:30,gabarito_original:"largura da via da testada + recuo",
  recuo_frontal_m:10,recuo_fundos_m:8,recuo_lateral_m:5,
};
const good=[
  "Zona: ZM-B(e)","Uso: comercial",
  "C.A. mínimo: 0,05","C.A. básico: 0,5","C.A. máximo: 1",
  "Ocupação máxima: 50%","Permeabilidade mínima: 70%",
  "Lote mínimo: 3000 m²","Testada mínima: 30 m",
  "Gabarito: largura da via da testada + recuo",
  "Recuo frontal: 10 m","Recuo de fundos: 8 m","Recuo lateral: 5 m",
].join("\n");
describe("SIGAPRO QA — matriz OCR determinística com nomes e evidências",()=>{
  it("identifica todos os índices só quando rótulo e valor coincidem",()=>{
    const r=reconcileUrbanOcr(good,row);
    expect(r.complete).toBe(true);
    expect(r.matches).toBe(13);
    expect(r.unresolved).toBe(0);
    expect(r.fields.find(x=>x.key==="ca_minimo_original")?.sourceLine).toBe("C.A. mínimo: 0,05");
  });
  it("rejeita deslocamento de CA, ocupação e recuos apesar dos números aparecerem",()=>{
    const bad=good.replace("C.A. mínimo: 0,05","C.A.: 0,05")
      .replace("C.A. básico: 0,5","C.A. básico: 1")
      .replace("C.A. máximo: 1","C.A. máximo: 50")
      .replace("Ocupação máxima: 50%","Ocupação máxima: 70%")
      .replace("Recuo frontal: 10 m","Recuo frontal: 5 m");
    const r=reconcileUrbanOcr(bad,row);
    expect(r.complete).toBe(false);
    expect(r.fields.find(x=>x.key==="ca_minimo_original")?.status).toBe("ambiguous");
    expect(r.fields.find(x=>x.key==="ca_basico_original")?.status).toBe("divergent");
    expect(r.fields.find(x=>x.key==="recuo_frontal_m")?.status).toBe("divergent");
    expect(r.warnings.some(x=>x.includes("não deslocar"))).toBe(true);
  });
  it("não presume um índice a partir de números soltos, mesmo na ordem correta",()=>{
    const text="ZM-B(e) comercial 0,05 0,5 1 50 70 3000 30 10 8 5";
    const r=reconcileUrbanOcr(text,row);
    expect(r.complete).toBe(false);
    expect(r.matches).toBe(0);
  });
  it("bloqueia categoria de uso e zona incorretas e campo ilegível",()=>{
    const mixed=good.replace("Uso: comercial","Uso: residencial")
      .replace("Recuo de fundos: 8 m","Recuo de fundos: [ILEGÍVEL]");
    const r=reconcileUrbanOcr(mixed,row);
    expect(r.scope[1].status).toBe("divergent");
    expect(r.fields.find(x=>x.key==="recuo_fundos_m")?.status).toBe("unreadable");
    expect(r.complete).toBe(false);
  });
  it("não supõe valores com C.A. genérico duplicado ou pontuação decimal ambígua",()=>{
    const r=reconcileUrbanOcr(good.replace("C.A. mínimo: 0,05","C.A. mínimo: 0,5")
      .replace("Lote mínimo: 3000 m²","Lote mínimo: 3.000 m²"),row);
    expect(r.fields.find(x=>x.key==="ca_minimo_original")?.status).toBe("divergent");
    expect(r.fields.find(x=>x.key==="lote_minimo_m2")?.status).toBe("ambiguous");
    expect(r.complete).toBe(false);
  });
});
