// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import { statusLabel, type ProcessRecord } from "@/lib/platform";

afterEach(()=>cleanup());

function record(protocol:string,status:"analise_tecnica"|"deferido",signedPermit=false):ProcessRecord {
  return {
    id:protocol,protocol,externalProtocol:protocol,
    tenantId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
    municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
    title:"Projeto Arquitetônico",type:"arquitetonico",ownerName:"Interessado teste",
    technicalLead:"Analista Municipal",
    status,isOfficial:true,officializedAt:"2026-10-18T02:05:27.610Z",
    analysis:{assignedTo:"Analista Municipal",
      assignedProfileId:"6f26916c-f308-498c-8dd0-05276723c0b4",
      startedAt:"2026-10-18T15:36:57Z"},
    processControl:{currentFolder:status==="deferido"?"Habite-se concluído":"Análise Urbanística",
      checkpoint:signedPermit?"Alvará de Construção emitido":undefined},
    tags:[],dispatches:[],timeline:[],sla:{currentStage:"Análise",hoursRemaining:12,breached:false},
    payment:{guideNumber:"DAM-"+protocol,amount:1,status:"compensada",dueDate:"",
      guides:[{kind:"protocolo",code:"DAM-"+protocol,amount:1,status:"compensada",dueDate:""}]},
    triage:{status:"concluido"},
  } as ProcessRecord;
}

describe("SIGAPRO — actual DOM visibility for the 3 production process states",()=>{
  const records=[
    record("PM-2026-00001","analise_tecnica"),
    record("PM-2026-00002","analise_tecnica",true),
    record("PM-2026-00003","deferido"),
  ];
  it("renders three distinct process links, 2 under technical analysis and 1 deferred",()=>{
    const {container}=render(<MemoryRouter>
      <CompactProcessRegistry
        processes={records}
        showArchiveAction={false}
        canDispatchProcess={()=>false}
        detailPathSuffix="/analise"
      />
    </MemoryRouter>);
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-sei-process-link="true"]')).toHaveLength(3);
    for(const process of records){
      expect(screen.getByTitle("Abrir "+process.protocol)).toBeInTheDocument();
    }
    expect(screen.getAllByText(statusLabel("analise_tecnica"))).toHaveLength(2);
    expect(screen.getAllByText(statusLabel("deferido"))).toHaveLength(1);
  });

  it("personal archived markers do not erase process rows or enable dispatch privileges",()=>{
    const {container}=render(<MemoryRouter>
      <CompactProcessRegistry
        processes={records}
        archivedProcessIds={records.map(x=>x.id)}
        showArchiveAction={false}
        canDispatchProcess={()=>false}
      />
    </MemoryRouter>);
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(3);
    expect(screen.queryByTitle("Despachar processo")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Arquivar da minha lista")).not.toBeInTheDocument();
  });
});
