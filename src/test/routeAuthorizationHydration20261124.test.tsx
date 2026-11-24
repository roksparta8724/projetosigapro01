// @vitest-environment jsdom
import {render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect,vi,beforeEach} from "vitest";
import {PermissionRoute} from "@/components/platform/PermissionRoute";
import {PlanModuleRoute} from "@/components/platform/PlanModuleRoute";
const s=vi.hoisted(()=>({
 auth:{isAuthenticated:true,authenticatedUserId:"auth-a",authenticatedProfileId:"profile-a",signOut:vi.fn()},
 bootstrap:{isReady:true,authResolved:true,loading:false,stage:"ready",profile:{userId:"profile-a",municipalityId:"city",accountStatus:"active"}},
 session:{id:"profile-a",role:"prefeitura_supervisor",department:"",title:"",municipalityId:"city",accessLevel:2},
 store:{sessionUsers:[],remoteSyncedForCurrentUser:false,storeIdentityConfirmed:false},
 entitlement:{isResolving:false,isMaster:false,isDenialConfirmed:false,canUseModule:vi.fn(()=>false),contractActive:false,contractReason:"Contrato não ativo",plan:null}
}));
vi.mock("@/hooks/useAuthGateway",()=>({useAuthGateway:()=>s.auth}));
vi.mock("@/hooks/useAppBootstrap",()=>({useAppBootstrap:()=>s.bootstrap}));
vi.mock("@/hooks/usePlatformSession",()=>({usePlatformSession:()=>({session:s.session})}));
vi.mock("@/hooks/usePlatformData",()=>({usePlatformData:()=>s.store}));
vi.mock("@/hooks/useTenant",()=>({useTenant:()=>({mode:"root",loading:false,inactive:false,municipalityId:null})}));
vi.mock("@/hooks/usePlanEntitlements",()=>({usePlanEntitlements:()=>s.entitlement}));
function Route(){return <MemoryRouter initialEntries={["/prefeitura/analise"]}><PermissionRoute permission="review_processes"><p>Conteúdo autorizado</p></PermissionRoute></MemoryRouter>}
beforeEach(()=>{s.session.id="profile-a";s.session.department="";s.bootstrap.profile.accountStatus="active";s.store.remoteSyncedForCurrentUser=false;s.store.storeIdentityConfirmed=false;s.entitlement.isDenialConfirmed=false;s.entitlement.isResolving=false;s.entitlement.canUseModule.mockReturnValue(false)});
describe("Route hydration without false access denials",()=>{
 it("waits for department before deciding, then opens without a denial flash",()=>{
  const {rerender}=render(<Route/>);
  expect(screen.queryByText(/Area indisponivel/)).not.toBeInTheDocument();
  expect(screen.queryByText("Conteúdo autorizado")).not.toBeInTheDocument();
  s.session.department="Análise Urbanística";s.store.storeIdentityConfirmed=true;s.store.remoteSyncedForCurrentUser=true;
  rerender(<Route/>);
  expect(screen.getByText("Conteúdo autorizado")).toBeInTheDocument();
 });
 it("keeps confirmed refusal and blocked account enforced",()=>{
  s.session.department="Financeiro";s.store.storeIdentityConfirmed=true;s.store.remoteSyncedForCurrentUser=true;
  const {rerender}=render(<Route/>);
  expect(screen.getByText(/Area indisponivel/)).toBeInTheDocument();
  s.bootstrap.profile.accountStatus="blocked";s.store.remoteSyncedForCurrentUser=false;
  rerender(<Route/>);
  expect(screen.getByText("Conta bloqueada administrativamente")).toBeInTheDocument();
 });
 it("never renders another account's department, even if the cached role would allow it",()=>{
  s.session.id="profile-old";s.session.department="Análise Urbanística";s.store.storeIdentityConfirmed=true;
  render(<Route/>);
  expect(screen.queryByText("Conteúdo autorizado")).not.toBeInTheDocument();
 });
 it("does not replace a confirmed allowed module with a provisional contract denial",()=>{
  function Plan(){return <PlanModuleRoute module="Analise tecnica"><p>Módulo aberto</p></PlanModuleRoute>}
  const {rerender}=render(<Plan/>);
  expect(screen.queryByText(/Módulo indisponível/)).not.toBeInTheDocument();
  s.entitlement.canUseModule.mockReturnValue(true);
  rerender(<Plan/>);
  expect(screen.getByText("Módulo aberto")).toBeInTheDocument();
  s.entitlement.canUseModule.mockReturnValue(false);s.entitlement.isDenialConfirmed=true;
  rerender(<Plan/>);
  expect(screen.getByText(/Módulo indisponível/)).toBeInTheDocument();
 });
});

it("never grants administrative legislation access to an operational profile after hydration",()=>{
 s.session.id="profile-a";s.session.department="Análise";s.bootstrap.profile.accountStatus="active";
 s.store.storeIdentityConfirmed=true;s.store.remoteSyncedForCurrentUser=true;
 render(<MemoryRouter initialEntries={["/cadastro-gestao/legislacao"]}><PermissionRoute permission="manage_own_profile" allowedRoles={["master_admin","master_ops","prefeitura_admin"]}><p>Legislação restrita</p></PermissionRoute></MemoryRouter>);
 expect(screen.queryByText("Legislação restrita")).not.toBeInTheDocument();
 expect(screen.getByText(/Area indisponivel/)).toBeInTheDocument();
});
