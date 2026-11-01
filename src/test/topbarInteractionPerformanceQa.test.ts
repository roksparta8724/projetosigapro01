import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("SIGAPRO QA — low-cost profile trigger and authorization-aware memoization",()=>{
 const portal=readFileSync("src/components/platform/PortalFrame.tsx","utf8");
 const css=readFileSync("src/index.css","utf8");
 const perf=readFileSync("src/hooks/useProfileInteractionDiagnostic.ts","utf8");
 it("does not rescan every municipal process for a profile dropdown repaint",()=>{
  expect(portal).toContain("const visibleTenantProcesses = useMemo(");
  expect(portal).toContain("getVisibleProcessesByScope(session, activeInstitutionId, processes)");
  expect(portal).toContain("[session, activeInstitutionId, processes]");
  expect(portal).toContain("const bookmarkedProcesses = useMemo(");
  expect(portal).toContain("const visibleNavItems = useMemo(");
  expect(portal).toContain("const visibleNavItemsResolved = useMemo(");
 });
 it("search index builds when the search dialog is opened, not on background notifications",()=>{
  expect(portal).toContain("if (!commandOpen) return [];");
  expect(portal).toContain("[commandOpen, institutions, navigate, session.role");
 });
 it("preserves menu access but removes expensive blur during opening",()=>{
  expect(portal).toContain("sig-topbar-profile-trigger");
  expect(portal).toContain("<DropdownMenu>");
  expect(portal).not.toContain("sig-topbar-account-dropdown w-[min(92vw,400px)] overflow-y-auto border p-3 shadow-[-18px_0_48px_rgba(15,23,42,0.20)] backdrop-blur-xl");
  expect(css).toContain(".sig-topbar-account-dropdown {");
  expect(css).toContain("backdrop-filter: none !important");
 });
 it("measures event delays locally, without transmitting personal data",()=>{
  expect(portal).toContain("useProfileInteractionDiagnostic();");
  expect(perf).toContain('observer.observe({type:"event"');
  expect(perf).toContain('target.closest(".sig-topbar-profile-trigger")');
  expect(perf).toContain('needsImprovement:entry.duration>200');
  expect(perf).not.toContain("fetch(");
 });
});
