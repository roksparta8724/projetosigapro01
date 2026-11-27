import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const text=(file:string)=>readFileSync(file,"utf8");
describe("SIGAPRO — legibilidade dos botões operacionais do Protocolo",()=>{
  it("identifica as três ações sem alterar o fluxo nem o despacho",()=>{
    const page=text("src/pages/saas/ProtocolDeskPage.tsx");
    expect(page).toContain('data-sigapro-triage-action="start"');
    expect(page).toContain('data-sigapro-triage-action="complete"');
    expect(page).toContain('data-sigapro-triage-action="dispatch"');
    expect(page).toContain('data-sigapro-triage-dispatch-label="true"');
    expect(page).toContain('"Despachar para Urbanismo"');
    expect(page).toContain('onClick={() => void handleDispatchToUrbanism(process)}');
    expect(page).toContain('isReadyForProtocolDispatch(process)');
    expect(page).toContain("max-w-full whitespace-normal break-words");
  });
  it("mantém botão azul com rótulo branco explícito e botões claros com texto escuro",()=>{
    const css=text("src/styles/surface-polarity.css");
    const start=css.indexOf("SIGAPRO TRIAGE ACTION CONTRAST LOCK V1");
    const end=css.indexOf("END SIGAPRO TRIAGE ACTION CONTRAST LOCK V1",start);
    const rule=css.slice(start,end);
    expect(start).toBeGreaterThan(0);
    expect(rule).toContain('[data-sigapro-triage-action="dispatch"]');
    expect(rule).toContain('[data-sigapro-triage-dispatch-label="true"]');
    expect(rule).toContain('background-color: #075985 !important');
    expect(rule).toContain('color: #ffffff !important');
    expect(rule).toContain('-webkit-text-fill-color: #ffffff !important');
    expect(rule).toContain('background-color: #ffffff !important');
    expect(rule).toContain('color: #0b3552 !important');
    expect(rule).toContain('background-color: #ecfdf5 !important');
    expect(rule).toContain('color: #064e3b !important');
    expect(rule).not.toContain('.sig-premium-topbar');
    expect(rule).not.toContain('.sig-topbar-shell');
  });
});
