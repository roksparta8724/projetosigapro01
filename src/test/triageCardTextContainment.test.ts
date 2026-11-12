import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {formatProcessSlaDeadline} from "@/lib/processSlaPresentation";
const src=(path:string)=>readFileSync(path,"utf8");
describe("SIGAPRO QA — contenção visual e SLA em triagem",()=>{
  it("não mostra horas futuras para prazo que já venceu",()=>{
    const now=new Date(2026,10,5,19,40);
    expect(formatProcessSlaDeadline("26/10/2026",48,now))
      .toContain("data vencida (conferir SLA)");
    expect(formatProcessSlaDeadline("2026-10-26",48,now)).toContain("data vencida");
    expect(formatProcessSlaDeadline("06/11/2026",27,now)).toContain("27h restantes");
    expect(formatProcessSlaDeadline("31/02/2026",48,now)).toContain("verificar data");
    expect(formatProcessSlaDeadline("-",48,now)).toBe("Prazo não informado");
    expect(formatProcessSlaDeadline("2026-11-06",-2,now)).toContain("conferir SLA");
  });
  it("mantém textos integrais dentro dos cards, com ações da triagem legíveis",()=>{
    const detail=src("src/pages/saas/ProcessDetailPage.tsx");
    const desk=src("src/pages/saas/ProtocolDeskPage.tsx");
    const css=src("src/styles/surface-polarity.css");
    expect(detail).toContain("formatProcessSlaDeadline(process.sla.dueDate, process.sla.hoursRemaining)");
    expect(detail).toContain('data-sigapro-sla-date-consistency="true"');
    expect(detail).toContain('data-sigapro-contained-text="true"');
    expect(desk).toContain('data-sigapro-protocol-queue-list="true"');
    expect(desk).toContain('data-sigapro-triage-actions-toggle="true"');
    expect(desk).toContain("aria-expanded={expanded}");
    expect(desk).toContain("Ver ações");
    expect(desk).not.toContain('<span className="mt-1 block truncate text-sm font-medium text-slate-700">');
    expect(desk).not.toContain('<p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{protocolGuide?.code');
    expect(css).toContain("SIGAPRO PREMIUM TEXT CONTAINMENT QA V1");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain('[data-sigapro-contained-text="true"]');
  });
});
