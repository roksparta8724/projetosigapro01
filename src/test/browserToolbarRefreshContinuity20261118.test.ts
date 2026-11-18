// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";

/**
 * Native toolbar reload is a cross-document user action. Chrome need not
 * dispatch it as a cancelable Navigation API event at all; a simulated
 * navigate event cannot prove that the toolbar refresh stays on the DOM.
 * Test only the things the application is legitimately able to control.
 */
function harness(authenticated: () => boolean = () => true) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  Object.defineProperty(window,"navigation",{configurable:true,value:{
    addEventListener:(n:string,callback:(event:Record<string,unknown>)=>void)=>listeners.set(n,callback),
    removeEventListener:(n:string)=>listeners.delete(n),
  }});
  const refresh=vi.fn().mockResolvedValue(undefined);
  const dispose=installSeamlessInternalRefresh({isAuthenticated:authenticated,refresh});
  const navigate=(overrides:Record<string,unknown>={})=>{
    let handler:(()=>Promise<void>)|null=null;
    const event={
      navigationType:"reload",userInitiated:true,canIntercept:true,
      destination:{url:window.location.href},
      intercept:vi.fn((options:{handler:()=>Promise<void>})=>{handler=options.handler;}),
      ...overrides,
    };
    listeners.get("navigate")?.(event);
    return {event,handler};
  };
  return {refresh,navigate,dispose};
}
afterEach(()=>{Object.defineProperty(window,"navigation",{configurable:true,value:undefined});});
describe("SIGAPRO — F5 same-document vs native browser toolbar",()=>{
  it("revalida via F5 interceptável sem desmontar o DOM atual",async()=>{
    const el=document.createElement("main");el.className="sig-app-frame";document.body.append(el);
    const {refresh,dispose}=harness();
    const e=new KeyboardEvent("keydown",{key:"F5",cancelable:true});
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));
    expect(document.querySelector(".sig-app-frame")).toBe(el);
    dispose();el.remove();
  });
  it("preserva Ctrl+R quando o teclado envia evento cancelável",async()=>{
    const {refresh,dispose}=harness();
    const e=new KeyboardEvent("keydown",{key:"r",ctrlKey:true,cancelable:true});
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));
    dispose();
  });
  it("não bloqueia Shift+F5 nem Ctrl+Shift+R",()=>{
    const {refresh,dispose}=harness();
    for(const e of [
      new KeyboardEvent("keydown",{key:"F5",shiftKey:true,cancelable:true}),
      new KeyboardEvent("keydown",{key:"r",ctrlKey:true,shiftKey:true,cancelable:true}),
    ]) {window.dispatchEvent(e);expect(e.defaultPrevented).toBe(false);}
    expect(refresh).not.toHaveBeenCalled();
    dispose();
  });
  it("não promete interceptar clique de toolbar não entregue pelo navegador",()=>{
    const {refresh,dispose}=harness();
    // Browser can perform native reload without firing a cancelable navigate.
    expect(refresh).not.toHaveBeenCalled();
    dispose();
  });
  it("não converte mudanças de rota e visitas sem autenticação em refresh",()=>{
    let authorized=false;
    const {refresh,navigate,dispose}=harness(()=>authorized);
    expect(navigate().event.intercept).not.toHaveBeenCalled();
    authorized=true;
    const other=navigate({destination:{url:new URL("/outra",location.href).href}});
    expect(other.event.intercept).not.toHaveBeenCalled();
    const optOut=navigate({userInitiated:false});
    expect(optOut.event.intercept).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    dispose();
  });
  it("não transforma Ctrl+F5 em atualização de dados, preservando o hard reload", () => {
    const { refresh, dispose } = harness();
    const ev = new KeyboardEvent("keydown", { key: "F5", ctrlKey: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    dispose();
  });

});
