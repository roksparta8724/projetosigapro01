import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findUrbanDrawingMeasurements } from "@/lib/urbanDrawingMeasurements";

describe("SIGAPRO IA — leitura conservadora de cotas textuais de plantas", () => {
  it("extrai cotas explícitas com unidade, página e valor decimal exato", () => {
    const result=findUrbanDrawingMeasurements([
      {page:1,text:"Planta de implantação — Recuo frontal: 4,50 m; recuo lateral 1.5 m; recuo de fundos = 3 m."},
      {page:2,text:"Área do terreno: 250,00 m²; Projeção da edificação: 120 m2; Área permeável: 90 m²; Área construída computável 180 m²."},
      {page:3,text:"Número de pavimentos: 2. Altura da edificação = 7,20 m. Taxa de ocupação 48%."},
    ]);
    const by=(key:string)=>result.find(x=>x.target===key);
    expect(by("front_setback_m")).toMatchObject({page:1,value:4.5,unit:"m"});
    expect(by("side_setback_m")?.value).toBe(1.5);
    expect(by("rear_setback_m")?.value).toBe(3);
    expect(by("lot")?.value).toBe(250);
    expect(by("footprint")?.value).toBe(120);
    expect(by("permeable")?.value).toBe(90);
    expect(by("totalFloor")?.value).toBe(180);
    expect(by("floor_count")?.value).toBe(2);
    expect(by("height_m")?.value).toBe(7.2);
    expect(by("occupancy_percent")?.value).toBe(48);
    expect(result.every(x=>x.page>=1 && x.excerpt.length>0)).toBe(true);
  });
  it("não trata cota normativa, número de lei, valor sem unidade ou medida negativa como leitura",()=>{
    const found=findUrbanDrawingMeasurements([
      {page:1,text:"Lei municipal: recuo frontal mínimo de 5 metros; taxa de ocupação máxima de 70%."},
      {page:2,text:"Recuo frontal: 4,50; Área do terreno: 400; Recuo lateral: -3 m."},
      {page:3,text:"Recuo frontal: 2500 mm; Área permeável: 500 hectares."},
      {page:4,text:"Coeficiente de aproveitamento: 1.234,56"},
      {page:5,text:"Área do terreno: 20000000 m²; Taxa de permeabilidade: 120%."},
    ]);
    expect(found).toEqual([]);
  });
  it("mantém valores conflitantes em páginas diferentes para conferência humana",()=>{
    const found=findUrbanDrawingMeasurements([
      {page:1,text:"Recuo frontal: 4,50 m (versão A)."},
      {page:2,text:"Recuo frontal: 4,80 m (versão B)."},
    ]);
    expect(found).toHaveLength(2);
    expect(found.map(x=>x.value)).toEqual([4.5,4.8]);
  });
  it("PDF sem texto, item rasterizado e excesso de páginas não fabricam medidas",()=>{
    expect(findUrbanDrawingMeasurements([{page:1,text:""}])).toEqual([]);
    const pages=Array.from({length:27},(_,i)=>({page:i+1,text:"Recuo frontal: 5 m"}));
    expect(findUrbanDrawingMeasurements(pages)).toHaveLength(24);
  });
  it("a integração só aceita PDF local quando o hash corresponde ao anexo",()=>{
    const desk=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanDocumentEvidenceDesk.tsx"),"utf8");
    const parent=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    const ui=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanDrawingMeasurementDesk.tsx"),"utf8");
    expect(desk).toContain("verifyQaExistingDocumentCopy(file");
    expect(desk).toContain("fileHash: selected.fileHash");
    expect(desk).toContain("fileSizeBytes: selected.fileSizeBytes");
    expect(desk).toContain("findUrbanDrawingMeasurements(extracted.pages)");
    expect(desk).toContain("onUseMeasurement(candidate.target,candidate.value,evidence)");
    expect(parent).toContain("onUseMeasurement={acceptDrawingReading}");
    expect(parent).toContain("Nenhum dado anterior foi substituído");
    expect(ui).toContain("Conferir cota");
    expect(ui).toContain("Abri a prancha original");
    expect(ui).toContain("disabled={!confirmed}");
    expect(desk).not.toContain("uploadFile(");
  });
});
