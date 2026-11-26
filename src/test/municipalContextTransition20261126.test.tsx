import {act,render,screen} from "@testing-library/react";
import {MemoryRouter,Route,Routes} from "react-router-dom";
import {describe,it,expect,vi,afterEach} from "vitest";
import {beginMunicipalContextTransition,finishMunicipalContextTransition,isCurrentMunicipalContextTransition,contextEpoch} from "@/lib/municipalContextTransition";
import {PermissionRoute} from "@/components/platform/PermissionRoute";
import {getSessionLandingPath,type SessionUser} from "@/lib/platform";
import type {MunicipalStaffAssignment} from "@/lib/municipalStaffAssignments";
const mock=vi.hoisted(()=>({
 auth:{isAuthenticated:true,authenticatedUserId:"auth",authenticatedProfileId:"profile",signOut:vi.fn()},
 bootstrap:{stage:"ready",isReady:true,authResolved:true,loading:false,profile:{userId:"profile",municipalityId:"city",accountStatus:"active"}},
 session:{id:"profile",role:"analista",department:"Análise Urbanística",title:"Analista",municipalityId:"city",tenantId:"city",accessLevel:1},
 store:{sessionUsers:[],remoteSyncedForCurrentUser:true,storeIdentityConfirmed:true}
}));
vi.mock("@/hooks/useAuthGateway",()=>({useAuthGateway:()=>mock.auth}));
vi.mock("@/hooks/useAppBootstrap",()=>({useAppBootstrap:()=>mock.bootstrap}));
vi.mock("@/hooks/usePlatformSession",()=>({usePlatformSession:()=>({session:mock.session})}));
vi.mock("@/hooks/usePlatformData",()=>({usePlatformData:()=>mock.store}));
vi.mock("@/hooks/useTenant",()=>({useTenant:()=>({mode:"root",loading:false,inactive:false,municipalityId:null})}));
const assignment:MunicipalStaffAssignment={id:"finance",profileId:"profile",municipalityId:"city",departmentId:"fin",departmentName:"Financeiro",departmentCode:"FIN",role:"financeiro",isActive:true,isCurrent:false};
let operation:ReturnType<typeof beginMunicipalContextTransition>=null;
afterEach(()=>{if(operation)finishMunicipalContextTransition(operation);operation=null;mock.session.role="analista";mock.session.department="Análise Urbanística";mock.bootstrap.profile.accountStatus="active";});
function App({landing=false}:{landing?:boolean}){
 return <MemoryRouter initialEntries={[{pathname:"/prefeitura/analise",state:landing?{sigaproContextLanding:true}:null}]}><Routes>
 <Route path="/prefeitura/analise" element={<PermissionRoute permission="review_processes"><p>Área técnica</p></PermissionRoute>}/>
 <Route path="/prefeitura/financeiro" element={<PermissionRoute permission="manage_financial"><p>Área financeira</p></PermissionRoute>}/>
 <Route path="/dashboard" element={<p>Dashboard</p>}/>
 </Routes></MemoryRouter>;
}
describe("Troca de departamento — autorização sem falso bloqueio",()=>{
 it("serializa a troca e invalida requisições de contexto anteriores",()=>{
  const previous=contextEpoch("profile");operation=beginMunicipalContextTransition(assignment);
  expect(operation).not.toBeNull();expect(contextEpoch("profile")).toBe(previous+1);
  expect(beginMunicipalContextTransition(assignment)).toBeNull();
  expect(isCurrentMunicipalContextTransition(operation!)).toBe(true);
 });
 it("protege conteúdo durante a transição e redireciona somente a entrada autorizada",()=>{
  const {rerender}=render(<App landing/>);
  expect(screen.getByText("Área técnica")).toBeInTheDocument();
  act(()=>{operation=beginMunicipalContextTransition(assignment);});
  expect(screen.queryByText("Área técnica")).not.toBeInTheDocument();
  expect(screen.queryByText(/Area indisponivel/)).not.toBeInTheDocument();
  mock.session.role="financeiro";mock.session.department="Financeiro";
  rerender(<App landing/>);
  expect(screen.queryByText(/Area indisponivel/)).not.toBeInTheDocument();
  act(()=>finishMunicipalContextTransition(operation!));
  expect(screen.getByText("Área financeira")).toBeInTheDocument();
 });
 it("mantém a recusa real ao digitar uma URL sem permissão",()=>{
  mock.session.role="financeiro";mock.session.department="Financeiro";
  render(<App/>);expect(screen.getByText(/Area indisponivel/)).toBeInTheDocument();
  expect(screen.queryByText("Área técnica")).not.toBeInTheDocument();
 });
 it("resolve Tesouraria e não usa título de lotação anterior para área desconhecida",()=>{
  expect(getSessionLandingPath({...mock.session,role:"financeiro",department:"Tesouraria",title:"Analista"} as SessionUser)).toBe("/prefeitura/financeiro");
  expect(getSessionLandingPath({...mock.session,role:"analista",department:"Unidade Técnica",title:"Financeiro"} as SessionUser)).toBe("/prefeitura/analise");
 });
});
