import { describe, expect, it } from "vitest";
import {
  canReadProcessDocument,
  canAnalyzeProcessDocument,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const process = {
  id: "proc-1",
  tenantId: "prefeitura-A",
  municipalityId: "prefeitura-A",
  status: "concluido",
  processControl: { currentFolder: "Arquivo" },
  analysis: { assignedProfileId: "analista-A", assignedTo: "Analista Um" },
  payment: { guides: [] },
  dispatches: [],
  triage: { status: "concluido" },
} as unknown as ProcessRecord;
const session = (overrides: Partial<SessionUser> = {}) => ({
  id: "analista-A",
  name: "Analista Um",
  role: "analista",
  accessLevel: 1,
  accountStatus: "active",
  tenantId: "prefeitura-A",
  municipalityId: "prefeitura-A",
  title: "Analista",
  department: "Urbanismo",
  email: "analista@example.test",
  ...overrides,
}) as SessionUser;

describe("consulta documental após conclusão, sem escalada de edição", () => {
  it("mantém acesso de leitura para analista técnico originalmente responsável", () => {
    expect(canReadProcessDocument(session(), process, "prefeitura-A")).toBe(true);
    expect(canAnalyzeProcessDocument(session(), process, "prefeitura-A")).toBe(false);
  });
  it("autoriza consulta institucional para diretor e secretário, sem dar edição intersetorial", () => {
    const director = session({ role: "prefeitura_supervisor", id: "diretor", accessLevel: 2, department: "Administração", title: "Diretor" });
    const secretary = session({ role: "prefeitura_supervisor", id: "secretaria", accessLevel: 3, department: "Administração", title: "Secretária" });
    expect(canReadProcessDocument(director, process, "prefeitura-A")).toBe(true);
    expect(canReadProcessDocument(secretary, process, "prefeitura-A")).toBe(true);
    expect(canAnalyzeProcessDocument(director, process, "prefeitura-A")).toBe(false);
  });
  it("bloqueia contas inativas e outros municípios, sem confiar em título livre", () => {
    expect(canReadProcessDocument(session({ accountStatus: "blocked" }), process, "prefeitura-A")).toBe(false);
    expect(canReadProcessDocument(session({ municipalityId: "prefeitura-B", tenantId:"prefeitura-B", role:"prefeitura_supervisor", accessLevel:3 }),process,"prefeitura-A")).toBe(false);
    expect(canReadProcessDocument(session({ id:"outro", name:"Outro", role:"analista", department:"Financeiro", title:"Secretário" }),process,"prefeitura-A")).toBe(false);
  });
  it("usa a permissão de leitura no visualizador e preserva o bloqueio de escrita", () => {
    const viewer=readFileSync(resolve(process.cwd(),"src/pages/saas/DocumentViewerPage.tsx"),"utf8");
    const editor=readFileSync(resolve(process.cwd(),"src/pages/saas/DocumentAnalysisPage.tsx"),"utf8");
    expect(viewer).toContain("canReadProcessDocument(session, process, effectiveScopeId)");
    expect(editor).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");
  });
  it("obriga legendas brancas com marcador escuro sem recolorir os acentos dos ícones", () => {
    const jsx=readFileSync(resolve(process.cwd(),"src/pages/saas/ExternalProcessControlPage.tsx"),"utf8");
    const css=readFileSync(resolve(process.cwd(),"src/styles/surface-polarity.css"),"utf8");
    expect(jsx).toContain('WebkitTextFillColor: "#f8fafc"');
    expect(jsx).toContain("style={{ color: marker.color, fill: marker.color }}");
    expect(css).toContain("CONTRASTE PREMIUM V24");
  });
});
