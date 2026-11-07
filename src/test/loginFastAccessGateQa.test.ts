import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  landingModuleForRole, verifyLoginLandingAccess,
  type LoginAccessRpc,
} from "@/lib/loginLandingAccess";

const city = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const roles = [
  ["prefeitura_admin", "Configurações", "/prefeitura"],
  ["analista", "Analise tecnica", "/prefeitura/analise"],
  ["prefeitura_supervisor", "Analise tecnica", "/prefeitura/analise"],
  ["fiscal", "Analise tecnica", "/prefeitura/analise"],
  ["financeiro", "Financeiro", "/prefeitura/financeiro"],
  ["setor_intersetorial", "Protocolo digital", "/prefeitura/protocolos"],
  ["profissional_externo", "Acesso externo", "/dashboard"],
  ["proprietario_consulta", "Acesso externo", "/proprietario"],
  ["property_owner", "Acesso externo", "/proprietario"],
] as const;

function approved() {
  return vi.fn<LoginAccessRpc>()
    .mockResolvedValueOnce({data:true,error:null})
    .mockResolvedValueOnce({data:null,error:null});
}

describe("SIGAPRO QA — entrada rápida com autorização institucional real", () => {
  it("faz apenas duas RPCs de acesso, sem baixar processos e guias para logar", async () => {
    for (const [role, module, expectedPath] of roles) {
      const rpc = approved();
      expect(landingModuleForRole(role)).toBe(module);
      expect(await verifyLoginLandingAccess(role,city,rpc)).toEqual({ok:true,path:expectedPath});
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(rpc).toHaveBeenNthCalledWith(1,"has_tenant_access",{target_tenant:city});
      expect(rpc).toHaveBeenNthCalledWith(2,"assert_municipality_entitlement_v1",{
        _municipality_id:city,_capability:"module:"+module,_increment:0,
      });
    }
  });

  it("Master com papel confirmado não aguarda store nem tenta plano da Prefeitura", async () => {
    for (const role of ["master_admin","master_ops"]) {
      const rpc=vi.fn<LoginAccessRpc>();
      expect(await verifyLoginLandingAccess(role,null,rpc)).toEqual({ok:true,path:"/master"});
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("não aceita município vazio, id falso ou papel desconhecido", async () => {
    for (const [role,tenant] of [
      ["analista",null],["financeiro","prefeitura-a"],["profissional_externo",""],
      ["role_forjado",city],
    ] as const) {
      const rpc=vi.fn<LoginAccessRpc>();
      expect(await verifyLoginLandingAccess(role,tenant,rpc)).toMatchObject({ok:false});
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("não permite login na Prefeitura errada nem aceita true textual", async () => {
    for (const membership of [
      {data:false,error:null},{data:"true",error:null},
      {data:null,error:{message:"sem acesso"}},
    ]) {
      const rpc=vi.fn<LoginAccessRpc>().mockResolvedValue(membership);
      expect(await verifyLoginLandingAccess("analista",city,rpc)).toMatchObject({ok:false});
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it("não ignora contrato vencido, módulo não adquirido ou indisponibilidade RPC", async () => {
    const rpc=vi.fn<LoginAccessRpc>()
      .mockResolvedValueOnce({data:true,error:null})
      .mockResolvedValueOnce({data:null,error:{message:"Modulo nao contratado: Analise tecnica"}});
    expect(await verifyLoginLandingAccess("analista",city,rpc)).toMatchObject({ok:false});
    expect(rpc).toHaveBeenCalledTimes(2);
    const unavailable=vi.fn<LoginAccessRpc>().mockRejectedValue(new Error("Secret in message"));
    const result=await verifyLoginLandingAccess("financeiro",city,unavailable);
    expect(result).toMatchObject({ok:false});
    if (result.ok === false) expect(result.message).not.toContain("Secret");
  });

  it("mantém autorização de rota/API e remove espera artificial por store completo", () => {
    const code=readFileSync("src/pages/saas/AcessoPage.tsx","utf8");
    const routes=readFileSync("src/App.tsx","utf8");
    const auth=readFileSync("src/hooks/useAppBootstrap.tsx","utf8");
    expect(code).toContain("verifyLoginLandingAccess(");
    expect(code).toContain("preloadLoginLanding(landingPath)");
    expect(code).not.toContain("dataReadyForCurrentUser");
    expect(code).not.toContain("entitlements.isResolving");
    expect(routes).toContain('<PermissionRoute permission="view_master_dashboard">');
    expect(routes).toContain('<PlanModuleRoute module="Analise tecnica">');
    expect(auth).toContain('backendClient.rpc("get_current_profile_context")');
  });

  it("evita downloads de 32 páginas restritas no bundle público de /acesso", () => {
    const src=readFileSync("src/App.tsx","utf8");
    for (const name of [
      "MasterAdminPage","DashboardHomePage","TenantAdminPage",
      "AnalystDeskPage","FinanceDeskPage","DocumentViewerPage",
      "ProcessDetailPage","AiAssistantPage",
    ]) {
      expect(src).toContain("const "+name+" = lazy(");
      expect(src).not.toContain('import { '+name+' } from "@/pages/saas/');
    }
    expect(src).toContain('import { AcessoPage } from "@/pages/saas/AcessoPage";');
    expect(src).toContain("<Suspense fallback={null}>");
    // Do not create lazy component identities inside a render or navigation effect.
    expect(src.indexOf("const MasterAdminPage = lazy("))
      .toBeLessThan(src.indexOf("const App = () => {"));
  });
});
