import {render,screen} from "@testing-library/react";
import {describe,it,expect,vi} from "vitest";
import type {ReactNode} from "react";
const state=vi.hoisted(()=>({role:"prefeitura_admin",accessLevel:3,municipalityId:"city"}));
vi.mock("@/hooks/useMunicipality",()=>({useMunicipality:()=>({municipality:{id:state.municipalityId},scopeId:null,name:"Prefeitura de teste"})}));
vi.mock("@/hooks/usePlatformSession",()=>({usePlatformSession:()=>({session:{role:state.role,accessLevel:state.accessLevel,tenantId:null}})}));
vi.mock("@/components/platform/PortalFrame",()=>({PortalFrame:({children}:{children:ReactNode})=><main>{children}</main>}));
vi.mock("@/components/platform/PageShell",()=>({PageShell:({children}:{children:ReactNode})=><div>{children}</div>}));
vi.mock("@/components/platform/MunicipalCollectionSettings",()=>({MunicipalCollectionSettings:({readOnly}:{readOnly:boolean})=><section data-testid="configuration"><h2>Configuração de guias e arrecadação</h2><p>{readOnly?"Somente leitura":"Edição autorizada"}</p></section>}));
vi.mock("@/components/platform/MunicipalCommercialReadiness",()=>({MunicipalCommercialReadiness:()=> <section data-testid="readiness">Liberação comercial não certificada</section>}));
import {CollectionSettingsPage} from "@/pages/saas/CollectionSettingsPage";
describe("Hierarchy of municipal collection workspace",()=>{
 it("presents operational configuration before the commercial evidence, without hiding the latter",()=>{
  render(<CollectionSettingsPage/>);
  const header=screen.getByRole("heading",{name:"Configuração de guias e arrecadação"});
  const readiness=screen.getByTestId("readiness");
  expect(header.compareDocumentPosition(readiness)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("Liberação comercial não certificada")).toBeVisible();
 });
 it("keeps nonadministrator access read only",()=>{
  state.role="financeiro";state.accessLevel=1;
  render(<CollectionSettingsPage/>);
  expect(screen.getByText("Somente leitura")).toBeVisible();
  expect(screen.queryByText("Edição autorizada")).not.toBeInTheDocument();
 });
});
