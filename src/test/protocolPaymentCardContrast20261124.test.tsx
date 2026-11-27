// @vitest-environment jsdom
import {render,screen} from "@testing-library/react";
import {describe,it,expect} from "vitest";
import {AlertCard} from "@/components/platform/AlertCard";
import {readFileSync} from "node:fs";
import postcss from "postcss";
const css=readFileSync("src/styles/sigapro-shared-surface-contrast-20261124.css","utf8");
const page=readFileSync("src/pages/saas/ProtocolDeskPage.tsx","utf8");
describe("Protocol payment cards and shared alerts",()=>{
 it("renders the full shared alert copy with semantic tone and no forced height",()=>{
  const {container}=render(<AlertCard tone="success" title="Processos oficializados" description="5 processo(s) possuem pagamento inicial compensado."/>);
  const card=container.querySelector('[data-shared-alert-card="success"]');
  expect(card).not.toHaveClass("h-full");
  expect(screen.getByText("5 processo(s) possuem pagamento inicial compensado.")).not.toHaveClass("line-clamp-2");
  expect(screen.getByText("Processos oficializados")).toHaveAttribute("data-alert-title","true");
 });
 it("preserves the actual payment action and pairs its label with the semantic button",()=>{
  expect(page).toContain('data-protocol-payment-command="confirm"');
  expect(page).toContain('data-protocol-payment-label="true"');
  expect(page).toContain('handleConfirmPreprotocolPayment(item)');
  expect(page).toContain('Confirmar pagamento e criar processo');
  expect(()=>postcss.parse(css)).not.toThrow();
  expect(css).toContain("background:#146044!important");
  expect(css).toContain('button[data-protocol-payment-command="confirm"]:disabled');
 });
});

it("uses the semantic action across payment flows without replacing handlers",()=>{
 const finance=readFileSync("src/pages/saas/FinanceDeskPage.tsx","utf8");
 const protocols=readFileSync("src/pages/saas/FinanceProtocolsPage.tsx","utf8");
 const detail=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
 expect(finance).toContain('data-shared-action="success"');
 expect(protocols).toContain('data-shared-action="success"');
 expect(detail.match(/data-shared-action="success"/g)?.length).toBeGreaterThanOrEqual(3);
 expect(detail).toContain('data-shared-action="warning"');
 expect(detail).toContain("handleConfirmHabiteSePayment()");
 expect(detail).toContain("handleConfirmApprovalPayment()");
 expect(detail).toContain("handleReviseConstructionGuide()");
 expect(css).toContain('button[data-ui="button"][data-shared-action="success"]');
 expect(css).toContain("background:#88500b!important");
});
