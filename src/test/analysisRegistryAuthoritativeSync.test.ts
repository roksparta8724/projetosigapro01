import { describe, expect, it } from "vitest";
import { buildAnalysisRegistry } from "@/lib/analysisRegistry";
import { isProcessReleasedToUrbanAnalysis, type ProcessRecord, type SessionUser } from "@/lib/platform";
import { readFileSync } from "node:fs";

const municipality = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const analyst: SessionUser = {
  id: "6f26916c-f308-498c-8dd0-05276723c0b4",
  name: "Analista Municipal",
  role: "analista",
  accessLevel: 2,
  tenantId: municipality,
  municipalityId: municipality,
  department: "Urbanismo e Obras",
  title: "Técnico em Edificações",
  email: "analista@municipio.test",
  accountStatus: "active",
  userType: "Interno",
};
function process(protocol:string,status:string,folder:string,municipalityId=municipality):ProcessRecord {
  return {
    id:protocol,
    protocol,
    tenantId:municipalityId,
    municipalityId,
    isOfficial:true,
    status,
    triage:{status:"concluido"},
    processControl:{currentFolder:folder},
    analysis:{assignedProfileId:analyst.id,assignedTo:analyst.name,startedAt:"2026-10-18T15:36:57.888Z"},
    dispatches:[],
    payment:{guideNumber:"DAM-"+protocol,amount:1,status:"compensada",dueDate:"",guides:[
      {kind:"protocolo",code:"DAM-"+protocol,amount:1,status:"compensada",dueDate:""}
    ]},
  } as ProcessRecord;
}
describe("SIGAPRO: authoritative process sync and per-municipality analysis history",()=>{
  it("reconciles two technical processes plus a completed Habite-se in one municipal register",()=>{
    const rows=[
      process("PM-2026-00001","analise_tecnica","Análise Urbanística"),
      process("PM-2026-00002","analise_tecnica","Análise Urbanística"),
      process("PM-2026-00003","deferido","Habite-se concluído"),
    ];
    const result=buildAnalysisRegistry(analyst,municipality,rows,true);
    expect(result.departmentProcesses.map(x=>x.protocol)).toEqual([
      "PM-2026-00001","PM-2026-00002"
    ]);
    expect(result.registry).toHaveLength(3);
    expect(result.registry.filter(x=>x.status==="deferido")).toHaveLength(1);
  });

  it("retains a previously analyzed process as read-only history when a guide is temporarily absent",()=>{
    const previous=process("PM-2026-00003","deferido","Habite-se concluído");
    previous.payment.guides=[];
    previous.payment.guideNumber="";
    expect(isProcessReleasedToUrbanAnalysis(previous)).toBe(false);
    const result=buildAnalysisRegistry(analyst,municipality,[previous],true);
    expect(result.departmentProcesses).toHaveLength(0);
    expect(result.registry.map(x=>x.protocol)).toEqual(["PM-2026-00003"]);
  });

  it("does not insert a pre-protocol into the operational queue, nor leak a different municipality",()=>{
    const premature=process("PRE-2026-00004","triagem","Triagem");
    premature.isOfficial=false;
    premature.triage.status="recebido";
    premature.analysis={};
    const foreign=process("PM-2026-09999","analise_tecnica","Análise Urbanística","another-municipality");
    const rows=[
      process("PM-2026-00001","analise_tecnica","Análise Urbanística"),
      premature,foreign
    ];
    const result=buildAnalysisRegistry(analyst,municipality,rows,true);
    expect(result.registry.map(x=>x.protocol)).toEqual(["PM-2026-00001"]);
    expect(result.departmentProcesses.map(x=>x.protocol)).toEqual(["PM-2026-00001"]);
  });

  it("blocks historical access by blocked or inactive municipal accounts",()=>{
    const archived=process("PM-2026-00003","deferido","Habite-se concluído");
    for(const accountStatus of ["blocked","inactive"] as const){
      const suspended={...analyst,accountStatus};
      expect(buildAnalysisRegistry(suspended,municipality,[archived],true))
        .toEqual({departmentProcesses:[],registry:[]});
    }
  });

  it("shows zero official results while same-account warm cache is not confirmed",()=>{
    const stale=process("PM-2026-00099","deferido","Habite-se concluído");
    expect(buildAnalysisRegistry(analyst,municipality,[stale],false))
      .toEqual({departmentProcesses:[],registry:[]});
  });

  it("never suppresses a guide read failure by silently mapping compensation to pending",()=>{
    const backend=readFileSync("src/integrations/backend/platformImpl.ts","utf8");
    const hook=readFileSync("src/hooks/usePlatformData.tsx","utf8");
    const page=readFileSync("src/pages/saas/AnalystDeskPage.tsx","utf8");
    expect(backend).toContain("let guidesResult = initialGuidesResult;");
    expect(backend).toContain("if (processRows.length > 0 && guidesResult.error)");
    expect(backend).toContain("throw new Error(\"Não foi possível sincronizar as guias oficiais");
    expect(hook).toContain('(!expectsRemoteStore || source === "remote")');
    expect(page).toContain("remoteSyncedForCurrentUser");
    expect(page).toContain("Sincronização oficial não confirmada");
    expect(page).toContain("Atualizar do banco");
    expect(page).toContain("disabled={!remoteSyncedForCurrentUser}");
  });
});
