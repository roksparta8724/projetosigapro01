import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findAnalysisSheetLocalCandidates,
  rescueChecklistEditableFields,
} from "@/lib/analysisSheetLocalRecovery";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
const sheet=read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
const css=read("src/styles/surface-polarity.css");

describe("SIGAPRO: análise técnica em tema institucional",()=>{
  it("corrige cabeçalhos de retirada e acervo no modo inverso sem mexer no tema claro",()=>{
    expect(sheet).toContain('data-analysis-withdrawal-header="true"');
    expect(sheet).toContain('data-analysis-revision-header="true"');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain('[data-analysis-withdrawal-header="true"]');
    expect(css).toContain('[data-analysis-revision-header="true"]');
    expect(css).toContain('background:linear-gradient(118deg,#173550');
    expect(css).toContain('.sig-app-frame[data-layout-mode="default"]');
  });
  it("distingue banco de navegador e não escreve no banco automaticamente",()=>{
    expect(sheet).toContain("readOfficialAnalysisSheet(process.id)");
    expect(sheet).toContain("writeOfficialAnalysisSheet(");
    expect(sheet).toContain('data-analysis-storage-status="true"');
    expect(sheet).toContain("Rascunho recuperado deste navegador");
    expect(sheet).toContain('key + ":backup-antes-da-recuperacao-manual"');
    expect(sheet).toContain("officialSheetLoading || readOnly || state.processId !== process.id");
    expect(sheet).toContain('disabled={readOnly || officialSheetLoading}');
  });
});

describe("SIGAPRO: recuperação de fichas locais sem adulterar dados",()=>{
  const municipality="tenant-campo", process="proc-2026-00001", analyst="analista-01";
  const key="sigapro:urban-analysis-checklist:v2:" + municipality+":"+process;
  const cached={version:2,processId:process,items:{
    exigencia:{status:"C",observation:"Revisar recuo frontal"},
    art:{status:"A",observation:""},
  },conclusion:"Corrigir taxa de ocupação",sheetNumber:"2",savedAt:"2026-10-18T11:00:00.000Z"};
  it("localiza apenas o processo certo e computa trabalho existente",()=>{
    const db = new Map([[key,JSON.stringify(cached)]]);
    const storage={getItem:(k:string)=>db.get(k)||null};
    const result=findAnalysisSheetLocalCandidates(storage,municipality,process,analyst);
    expect(result).toHaveLength(1);
    expect(result[0].evaluated).toBe(2);
    expect(result[0].observations).toBe(1);
    expect(findAnalysisSheetLocalCandidates(storage,municipality,"outro-processo",analyst)).toEqual([]);
  });
  it("mantém só campos conhecidos, sem restaurar assinatura sem verificação",()=>{
    const fields=rescueChecklistEditableFields(cached,["exigencia","art","desconhecido"]);
    expect(fields.items.exigencia).toEqual({status:"C",observation:"Revisar recuo frontal"});
    expect(fields.items.desconhecido).toEqual({status:"",observation:""});
    expect(fields.conclusion).toContain("ocupação");
    expect("technicalSignature" in fields).toBe(false);
  });
  it("rejeita payload estranho e evita rascunho de processo diferente",()=>{
    const db=new Map([[key,JSON.stringify({...cached,processId:"outro-processo"})]]);
    expect(findAnalysisSheetLocalCandidates({getItem:(k:string)=>db.get(k)||null},
      municipality,process,analyst)).toEqual([]);
    expect(()=>rescueChecklistEditableFields({items:{"../../x":{status:"A",observation:"x"}}},["art"])).toThrow();
  });
});
