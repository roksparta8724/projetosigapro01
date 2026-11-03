import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateUrbanMatrixBatchProgress, describeUrbanMatrixRow } from "@/lib/urbanLegalMatrixReview";
import { isUrbanTestFixtureRule } from "@/lib/urbanPrecheck";
import type { UrbanMatrixBatchDetail } from "@/integrations/backend/urbanPrecheckClient";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
function batch(): UrbanMatrixBatchDetail {
  return {
    id:"qa",municipality_id:"tenant",document_title:"quadros.pdf",document_sha256:"a".repeat(64),
    source_municipality:"Campo Limpo Paulista - SP",status:"pending_legal_review",version:1,
    source_rows:Array.from({length:23},(_,i)=>({
      zona_conforme_tabela:i===21?"AIU(2)":"ZM-X",uso_predominante_conforme_tabela:"residencial",
      ca_minimo_original:i===21?null:"0,2",pagina_pdf:i<14?36:37,
    })),
    reviewed_indexes:[0,1,2,3,4,5,6,7,8,9,10,11,14,15,18,19],
  };
}
describe("SIGAPRO IA — legal batch review and safe activation",()=>{
  it("tracks 23 original rows, 16 checked readings and 7 open checks without activation",()=>{
    const progress=calculateUrbanMatrixBatchProgress(batch());
    expect(progress).toMatchObject({total:23,reviewed:16,pending:7,percentage:69.6});
    expect(progress.rows.filter(x=>!x.readingReviewed).map(x=>x.index)).toEqual([12,13,16,17,20,21,22]);
    const aiu=describeUrbanMatrixRow(progress.rows.find(x=>x.index===21)!.source);
    expect(aiu.zone).toBe("AIU(2)");
    expect(aiu.metrics.find(x=>x.label==="CA mínimo")?.value).toBeNull();
  });
  it("rejects duplicate or invalid reviewed indexes",()=>{
    const item=batch();item.reviewed_indexes=[0,0,1,-1,999,1.1];
    expect(calculateUrbanMatrixBatchProgress(item)).toMatchObject({total:23,reviewed:2,pending:21});
  });
  it("shows original provenance but never auto-activates staged values",()=>{
    const component=read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    const settings=read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    expect(component).toContain("data-urban-matrix-review");
    expect(component).toContain("data-urban-matrix-progress");
    expect(component).toContain("data-urban-matrix-row");
    expect(component).toContain("Sem vigência comprovada");
    expect(component).toContain("readUrbanMatrixBatch");
    expect(settings).toContain("<UrbanLegalMatrixReviewPanel");
    expect(client).toContain("list_urban_matrix_batch_staging_v1");
    expect(client).toContain("get_urban_matrix_batch_staging_v1");
    expect(client).toContain('activate_urban_regulation_v2');
    expect(client).not.toContain('invoke("activate_urban_regulation_v1"');
  });
  it("flags fictional QA-only rules before reporting legal readiness",()=>{
    expect(isUrbanTestFixtureRule({zone_code:"QA-URBAN-E2E-20261024"})).toBe(true);
    expect(isUrbanTestFixtureRule({zone_code:"ZC",rules:[{reference:"LEI FICTICIA QA SEM VALIDADE LEGAL"}]})).toBe(true);
    expect(isUrbanTestFixtureRule({zone_code:"ZC",rules:[{reference:"LC 379/2009 art. 50"}]})).toBe(false);
  });
});
