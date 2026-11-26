// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it, vi } from "vitest";
import type { Institution, SessionUser } from "@/lib/platform";
import { filterInstitutionPortfolio, CompactPortfolioRegistry } from "@/components/platform/CompactPortfolioRegistry";
import { isSigaproPlatformInstitution, MasterUserGovernance } from "@/components/platform/MasterUserGovernance";

vi.mock("@/hooks/usePlatformSession", () => ({
  usePlatformSession: () => ({ session: { role: "master_admin" } }),
}));
vi.mock("@/components/platform/CompactUserRegistry", () => ({
  CompactUserRegistry: ({ users, label }: { users: SessionUser[]; label: string }) =>
    <div data-testid="scoped-user-registry">{label}: {users.length}</div>,
}));
vi.mock("@/components/platform/PlatformStaffCreator", () => ({
  PlatformStaffCreator: () => <div data-testid="platform-staff-summary">Acesso operacional SIGAPRO</div>,
}));
const institutions: Institution[] = Array.from({length: 2500},(_,i) => ({
  id: "municipality-" + i, name: "Prefeitura " + String(i).padStart(4,"0"),
  city:"Cidade " + i, state:i % 2 ? "SP" : "MG",
  subdomain:"municipio-"+i,plan:i%2 ? "Premium" : "Pro",
  status:i%3===0 ? "suspenso" : "ativo",
  activeModules:[],users:0,processes:0,revenue:0,
  theme:{primary:"#154160",accent:"#46aac8"},
}));
const platform: Institution = {
  ...institutions[0], id:"platform",name:"SIGAPRO Plataforma",subdomain:"sigapro-plataforma",
};
const all=[...institutions,platform];
const basic={
  institutions:all,users:[] as SessionUser[],
  renderDetails:vi.fn(() => null),onManageMunicipality:vi.fn(),
  onPlatformStaffCreated:vi.fn(async () => {}),
};
const source=(path:string)=>readFileSync(path,"utf8");

describe("SIGAPRO Master escalável — milhares de prefeituras e separação de funcionários", () => {
  it("renderiza só 15 instituições por página e exclui o tenant técnico", () => {
    const {container}=render(<MemoryRouter><MasterUserGovernance {...basic}/></MemoryRouter>);
    expect(container.querySelectorAll('[data-master-municipality-option="true"]')).toHaveLength(15);
    expect(container.querySelector('[data-master-directory-pagination="true"]')).toHaveTextContent("de 167");
    expect(screen.getByText(/2\.500 prefeituras/)).toBeInTheDocument();
    expect(isSigaproPlatformInstitution(platform)).toBe(true);
    expect(isSigaproPlatformInstitution(institutions[1])).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Próxima página de prefeituras"}));
    expect(container.querySelectorAll('[data-master-municipality-option="true"]')).toHaveLength(15);
  });

  it("busca Prefeitura específica sem renderizar 2.500 cards ao mesmo tempo", () => {
    const {container}=render(<MemoryRouter><MasterUserGovernance {...basic}/></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox",{name:"Buscar prefeitura"}),{target:{value:"Cidade 2499"}});
    expect(container.querySelectorAll('[data-master-municipality-option="true"]')).toHaveLength(1);
    expect(screen.getByText("Prefeitura 2499")).toBeInTheDocument();
    expect(container.querySelector('[data-master-directory-pagination="true"]')).toHaveTextContent("Página 1 de 1");
  });

  it("tem divisão explícita da equipe SIGAPRO, sem vincular a Prefeitura", () => {
    const {container}=render(<MemoryRouter><MasterUserGovernance {...basic}/></MemoryRouter>);
    const platformSection=container.querySelector('[data-master-section="platform"]') as HTMLButtonElement;
    expect(platformSection).toBeTruthy();
    fireEvent.click(platformSection);
    expect(container.querySelector('[data-master-selected-municipality="__sigapro_platform__"]')).toBeInTheDocument();
    expect(container.querySelector('[data-master-platform-create="true"]')).toBeInTheDocument();
    expect(screen.getByTestId("platform-staff-summary")).toBeInTheDocument();
  });

  it("filtra a carteira por cidade, plano e status sem perder paginação", () => {
    expect(filterInstitutionPortfolio(all)).toHaveLength(2500);
    expect(filterInstitutionPortfolio(all,"Cidade 2499")).toHaveLength(1);
    expect(filterInstitutionPortfolio(all,"","ativo","Premium").length).toBeGreaterThan(0);
    const {container}=render(<CompactPortfolioRegistry institutions={all} renderDetails={() => null} />);
    expect(container.querySelectorAll('[data-sigapro-portfolio-row="true"]')).toHaveLength(12);
    fireEvent.change(screen.getByRole("textbox",{name:"Pesquisar prefeitura, cidade, UF ou subdomínio"}),{
      target:{value:"Cidade 2499"},
    });
    expect(container.querySelectorAll('[data-sigapro-portfolio-row="true"]')).toHaveLength(1);
    expect(screen.getByText("Prefeitura 2499")).toBeInTheDocument();
  });

  it("não muda permissões Master nem cria administrador proprietário pelo cadastro comum", () => {
    const creator=source("src/components/platform/PlatformStaffCreator.tsx");
    const backend=source("src/integrations/backend/platformImpl.ts");
    expect(creator).toContain('session.role !== "master_admin"');
    expect(creator).toContain("createRemotePlatformStaffAccount");
    expect(creator).toContain("master_ops");
    expect(backend).toContain('db.rpc("provision_platform_staff_account"');
    expect(backend).not.toContain('"provision_owner_master_account"');
  });

  it("mantém contrastes separados e elimina listas não paginadas", () => {
    const css=source("src/styles/master-user-governance.css");
    expect(()=>postcss.parse(css)).not.toThrow();
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain('.sig-master-governance-section[data-active="true"]');
    expect(css).toContain('.sig-master-governance-role-note');
    expect(source("src/components/platform/MasterUserGovernance.tsx")).toContain("directoryItems.map((municipality)");
    expect(source("src/components/platform/MasterUserGovernance.tsx")).not.toContain("filteredMunicipalities.map((municipality)");
    expect(source("src/pages/saas/MasterAdminPage.tsx")).toContain('data-master-portfolio-surface="true"');
    expect(()=>postcss.parse(source("src/styles/sigapro-master-workspace-premium-20261124.css"))).not.toThrow();
  });

  it("carrega além de mil instituições e conta perfis/processos em tempo linear", () => {
    const backend=source("src/integrations/backend/platformImpl.ts");
    expect(backend).toContain("completeMunicipalityCatalog(municipalitiesResult)");
    expect(backend).toContain('.range(offset, offset + pageSize - 1)');
    // A timestamp tie must have the same deterministic order on every page.
    expect(backend.split('.order("created_at", { ascending: false }).order("id", { ascending: false })').length - 1).toBeGreaterThanOrEqual(2);
    const indexes=source("neon/migrations/20261126_zzz_operational_read_indexes_v1.sql");
    expect(indexes).toContain("public.municipalities (created_at DESC, id DESC)");
    expect(indexes).toContain("public.processes (municipality_id, created_at DESC, id DESC) WHERE archived_at IS NULL");
    for (const table of ["process_documents","process_audit_entries","process_movements"]) {
      expect(indexes).toContain(`public.${table} (process_id, created_at DESC, id DESC)`);
    }
    expect(backend).toContain("profileCountByMunicipality.get");
    expect(backend).toContain("processCountByMunicipality.get");
  });
});


describe("Carteira Master — busca acessível e estados vazios", () => {
  it("encontra municípios com ou sem acentos e não confunde filtro vazio com ausência de cadastro", () => {
    const accented = {...institutions[0],name:"Prefeitura de São João",city:"São João"};
    expect(filterInstitutionPortfolio([accented],"sao joao")).toHaveLength(1);
    render(<CompactPortfolioRegistry institutions={[accented]} renderDetails={() => null} />);
    fireEvent.change(screen.getByRole("textbox",{name:"Pesquisar prefeitura, cidade, UF ou subdomínio"}),{target:{value:"inexistente"}});
    expect(screen.getByText("Nenhuma Prefeitura corresponde aos filtros atuais.")).toBeInTheDocument();
  });
  it("preserva cores semânticas de status no tema inverso", () => {
    const css = source("src/styles/sigapro-adaptive-registries-20261124.css");
    expect(()=>postcss.parse(css)).not.toThrow();
    expect(css).toContain("span[data-registry-status]");
    expect(css).toContain("--registry-status-ink:#065f46");
  });
});
