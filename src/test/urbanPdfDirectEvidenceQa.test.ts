import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {getQaPdfTextEvidence,compareQaSourceTextToVision,
  QA_SOURCE_SHA,QA_SOURCE_MUNICIPALITY} from "@/lib/urbanPdfDirectEvidenceQa";
import {URBAN_VISION_FIELDS} from "@/lib/urbanVisionStructured";

const parameters={municipalityId:QA_SOURCE_MUNICIPALITY,verifiedPackageSha:QA_SOURCE_SHA,
  page:36,zone:"ZM-B(e)",usage:"comercial",originalScopeMatches:true};
describe("SIGAPRO QA — leitura da camada textual imutável da página 36",()=>{
 it("isola evidência por SHA-256, prefeitura, zona, uso e página",()=>{
  expect(getQaPdfTextEvidence(parameters)?.cells.ca_minimo.raw).toBe("0,05");
  for(const patch of [
    {municipalityId:"00000000-0000-4000-8000-000000000001"},
    {verifiedPackageSha:"f".repeat(64)},{page:37},{zone:"ZM-MA(1,2,3,4)"},
    {usage:"residencial"},{originalScopeMatches:false},
  ])expect(getQaPdfTextEvidence({...parameters,...patch})).toBeNull();
 });
 it("contém as 13 células extraídas, com coordenadas rastreáveis, sem aprovação automática",()=>{
  const evidence=getQaPdfTextEvidence(parameters)!;
  expect(Object.keys(evidence.cells)).toHaveLength(13);
  for(const [key] of URBAN_VISION_FIELDS){
    const field=evidence.cells[key];
    expect(field.raw.trim().length).toBeGreaterThan(0);
    expect(field.rects.length).toBeGreaterThan(0);
    for(const bbox of field.rects){
      expect(bbox).toHaveLength(4);
      expect(bbox.every(n=>typeof n==="number"&&Number.isFinite(n))).toBe(true);
      expect(bbox[2]).toBeGreaterThan(bbox[0]);
      expect(bbox[3]).toBeGreaterThan(bbox[1]);
    }
  }
  expect(evidence.cells.ca_basico.raw).toBe("0,5");
  expect(evidence.cells.ca_maximo.raw).toBe("1");
  expect(evidence.cells.recuo_frontal.raw).toBe("10");
  expect(evidence.cells.recuo_fundos.raw).toBe("8");
  expect(evidence.cells.recuo_lateral.raw).toBe("5");
 });
 it("normaliza apenas prefixo de zona e espaço ao redor do +, sem tolerar números divergentes",()=>{
  const evidence=getQaPdfTextEvidence(parameters)!;
  const draft=URBAN_VISION_FIELDS.map(([key,label])=>{
    const cell=evidence.cells[key].raw;
    return label+": "+(key==="zona"?"ZM-B(e)":
      key==="gabarito"?"largura da via da testada + recuo":cell);
  }).join("\n");
  const checks=compareQaSourceTextToVision(evidence,draft);
  expect(checks).toHaveLength(13);
  expect(checks.every(c=>c.verdict==="text_match")).toBe(true);
  const mismatched=draft.replace("C.A. básico: 0,5","C.A. básico: 0,8")
    .replace("Gabarito: largura da via da testada + recuo",
      "Gabarito: largura da via + a testada + recuo");
  const faulty=compareQaSourceTextToVision(evidence,mismatched);
  expect(faulty.find(c=>c.key==="ca_basico")?.verdict).toBe("text_conflict");
  expect(faulty.find(c=>c.key==="gabarito")?.verdict).toBe("text_conflict");
  expect(faulty.find(c=>c.key==="zona")?.verdict).toBe("text_match");
 });
 it("a evidência e seus valores não substituem o texto do operador nem gravam regras",()=>{
  const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
  const evidence=readFileSync("src/lib/urbanPdfDirectEvidenceQa.ts","utf8");
  expect(ui).toContain('data-urban-original-pdf-text-qa="true"');
  expect(ui).toContain("compareQaSourceTextToVision(");
  expect(ui).toContain("data-urban-pdf-source-cell={row.key}");
  expect(evidence).not.toContain("backendClient");
  expect(evidence).not.toContain("save_urban_matrix_numeric_review_v1");
  expect(evidence).not.toContain("automaticallyApproved:true");
 });
});