import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildAnalysisRegistry } from "@/lib/analysisRegistry";
import { getProcessPaymentGuides, type ProcessRecord, type SessionUser } from "@/lib/platform";

const source=(p:string)=>readFileSync(p,"utf8");
const municipalityId="49dac0b6-6352-4744-9aab-9ff91c59d970";
const profileId="6f26916c-f308-498c-8dd0-05276723c0b4";
const analyst={
  id:profileId,name:"Analista autorizado",role:"analista",accessLevel:2,
  tenantId:municipalityId,municipalityId,department:"Urbanismo e Obras",
  title:"Analista de obras",email:"analista@exemplo.test",accountStatus:"active",
  userType:"Interno",
} as SessionUser;

function processRow(protocol:string,status:"analise_tecnica"|"deferido",permitSigned=false):ProcessRecord{
  const data={
    id:protocol,protocol,externalProtocol:protocol,tenantId:municipalityId,
    municipalityId,isOfficial:true,officializedAt:"2026-10-18T02:05:27Z",
    status, title:"Projeto de arquitetura",type:"arquitetonico",ownerName:"QA",
    triage:{status:"concluido"},analysis:{
      assignedTo:analyst.name,assignedProfileId:profileId,
      startedAt:"2026-10-18T15:36:57Z",
    },
    processControl:{currentFolder:status==="deferido"?"Habite-se concluído":"Análise Urbanística",
      checkpoint:permitSigned?"Alvará de Construção emitido":undefined},
    payment:{guideNumber:"DAM-"+protocol,amount:1,status:"compensada",dueDate:"",
      guides:[{kind:"protocolo",code:"DAM-"+protocol,amount:1,
      status:"compensada",dueDate:""}]},
  };
  return data as ProcessRecord;
}

describe("SIGAPRO production diagnosis: 2 in review + 1 completed despite signed permit",()=>{
  it("preserves the canonical process status from Neon, not a separate permit signature",()=>{
    const backend=source("src/integrations/backend/platformImpl.ts");
    expect(backend).toContain("status: process.status,");
    expect(backend).not.toMatch(/status:\s*constructionPermit\?\.status\s*===\s*"signed"\s*\?\s*"deferido"/);
    expect(backend).toContain('constructionPermit.status === "signed"');
  });
  it("keeps both technical reviews in the analyst queue, while the signed permit is only a checkpoint",()=>{
    const rows=[
      processRow("PM-2026-00001","analise_tecnica"),
      processRow("PM-2026-00002","analise_tecnica",true),
      processRow("PM-2026-00003","deferido"),
    ];
    expect(rows.filter(x=>x.status==="analise_tecnica")).toHaveLength(2);
    expect(rows.filter(x=>x.status==="deferido")).toHaveLength(1);
    const {departmentProcesses,registry}=buildAnalysisRegistry(analyst,municipalityId,rows,true);
    expect(departmentProcesses.map(x=>x.protocol)).toEqual(["PM-2026-00001","PM-2026-00002"]);
    expect(registry).toHaveLength(3);
    expect(getProcessPaymentGuides(rows[1]).find(g=>g.kind==="protocolo")?.status).toBe("compensada");
    expect(rows[1].processControl?.checkpoint).toBe("Alvará de Construção emitido");
  });
  it("does not hide all processes when personal archive markers are stale",()=>{
    const desk=source("src/pages/saas/AnalystDeskPage.tsx");
    const municipal=source("src/pages/saas/MunicipalProcessRegistryPage.tsx");
    expect(desk).toContain("!showArchived || archivedProcessIds.includes(item.id)");
    expect(municipal).toContain("if (showArchived && !archived) return false;");
    expect(desk).toContain('data-analysis-official-processes="true"');
    expect(desk).toContain("renderQueue(");
    expect(desk).toContain("processRegistry.slice(0, 5)");
    expect(desk).toContain('title="Processos oficiais da Prefeitura"');
    expect(desk).toContain("Abrir lista completa");
    expect(desk).toContain('data-process-premium-card="true"');
  });
});
