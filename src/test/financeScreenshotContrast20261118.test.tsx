import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(resolve(process.cwd(),p),"utf8");
const financeCss = read("src/styles/sigapro-finance-premium.css");
const processCss = read("src/styles/sigapro-process-contrast-v4.css");
const financePage = read("src/pages/saas/FinanceProtocolsPage.tsx");
const premiumRegistry = read("src/components/platform/PremiumProcessRegistry.tsx");
const compact = read("src/components/platform/CompactProcessRegistry.tsx");

describe("SIGAPRO — contrasts in the two screenshots, 18 Nov 2026", () => {
  it("uses explicit white text-fill for official blue sequence badges and dark ink for PRE", () => {
    const contract = financeCss.split("/* SIGAPRO | Financeiro screenshot contrast v6 — official DAM sequence */")[1];
    expect(contract).toBeTruthy();
    expect(contract).toContain('.sig-finance-ledger__sequence[data-official-sequence="true"]');
    expect(contract).toContain("background: #123f5b !important");
    expect(contract).toContain("-webkit-text-fill-color: #ffffff !important");
    expect(contract).toContain('.sig-finance-ledger__sequence[data-official-sequence="false"]');
    expect(contract).toContain("-webkit-text-fill-color: #744b0b !important");
    expect(contract).toContain(".sig-finance-ledger__reference");
    expect(contract).toContain(".sig-finance-ledger__row[data-selected=\"true\"]");
    expect(contract).toContain('[data-layout-mode="inverse-main"]');
    expect(contract).toContain("html.dark");
  });

  it("replaces the washed-out finance process count band with a readable compact summary", () => {
    expect(financePage).toContain('data-finance-process-summary="premium-v4"');
    expect(financePage).toContain("Processos do Financeiro · ");
    expect(financeCss).toContain('.sig-finance-process-summary[data-finance-process-summary="premium-v4"] > p');
    expect(financeCss).toContain("-webkit-text-fill-color: #254e68 !important");
    expect(financeCss).toContain("-webkit-text-fill-color: #e7f5ff !important");
    expect(financeCss).toContain("border-left: 3px solid #217da8 !important");
  });

  it("styles the official process hero, KPIs and rows across light and inverse themes", () => {
    expect(premiumRegistry).toContain('import "@/styles/sigapro-process-contrast-v4.css"');
    expect(compact).toContain('data-selected={selected ? "true" : "false"}');
    expect(processCss).toContain(".sig-workspace-hero h2");
    expect(processCss).toContain(".sig-workspace-kpi strong");
    expect(processCss).toContain(".sig-process-row[data-selected=\"true\"]");
    expect(processCss).toContain('.sig-process-row:hover:not([data-selected="true"])');
    expect(processCss).toContain('[data-layout-mode="inverse-main"]');
    expect(processCss).toContain("html.dark");
    expect(processCss).not.toContain(".sig-premium-topbar");
  });

  it("ensures WCAG text-background ratio >= 4.5 on key screenshot surfaces", () => {
    const lum=(hex: string) => {
      const v=[0,2,4].map(i=>parseInt(hex.slice(i+1,i+3),16)/255);
      const [r,g,b]=v.map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
      return .2126*r+.7152*g+.0722*b;
    };
    const contrast=(a:string,b:string)=>{
      const x=lum(a),y=lum(b);
      return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    };
    for(const [ink,bg] of [
      ["#ffffff","#123f5b"],["#744b0b","#fff3da"],
      ["#105278","#ffffff"],["#153950","#f4f8fc"],
      ["#15344d","#ffffff"],["#415c72","#ffffff"],
      ["#133950","#f1f7fb"],["#f5fbff","#142e42"],
      ["#c0d9e9","#1a3a4f"],["#e7f5ff","#1b3c53"],
      ["#ffffff","#104a6f"],["#ffffff","#104f75"],
    ]) {
      expect(contrast(ink,bg),ink+" / "+bg).toBeGreaterThanOrEqual(4.5);
    }
  });
});
