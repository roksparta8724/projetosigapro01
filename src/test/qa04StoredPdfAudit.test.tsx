import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QaArchitecturalLab} from "@/components/platform/QaArchitecturalLab";
import {backendClient} from "@/integrations/backend/databaseClient";
vi.mock("@/integrations/backend/databaseClient",()=>({
  backendClient:{auth:{getSession:vi.fn()}},
}));
const tenant="49dac0b6-6352-4744-9aab-9ff91c59d970";
const processId="915e1c63-ebda-4cdd-8e95-34316d9e0089";
const documentId="ad0fb7f4-2b0f-43a4-8e9e-885af20863ec";
const metric=(key:string,n:number)=>({metric:key,value:n,page:2,
  quote:"Recuo proposto: "+n+",00 m",confidence:"high",usableForReview:true,
  reason:"Conferir na prancha original"});
describe("QA04 actual R2 storage verification (no external AI)",()=>{
 beforeEach(()=>vi.mocked(backendClient.auth.getSession).mockResolvedValue({
   data:{session:{access_token:"qa-authorized-jwt"}},
 } as never));
 afterEach(()=>vi.unstubAllGlobals());
 it("does not show the stored-document test to any other municipal tenant",()=>{
   const view=render(<QaArchitecturalLab municipalityId="other-tenant"/>);
   expect(view.container.querySelector('[data-sigapro-qa04-stored-pdf="true"]')).toBeNull();
 });
 it("requires document preflight before a single native_text POST",async()=>{
   const fetchMock=vi.fn(async (_url:string,options?:RequestInit)=>{
     if(options?.method==="GET")return {ok:true,json:async()=>({
       documentReady:true,nativeTextAvailable:true,
     })};
     return {ok:true,json:async()=>({
       processId,documentId,documentVersion:2,source:"pdf_text_local",
       aiProvider:"sigapro_local",automaticallyApproved:false,
       pdfSharedWithConfiguredAiProvider:false,humanReviewRequired:true,
       legalConformity:"not_evaluated",pageAudit:{count:3,countVerified:true},
       readings:[metric("front_setback_m",5),metric("side_setback_m",1),
         metric("rear_setback_m",12)],
     })};
   });
   vi.stubGlobal("fetch",fetchMock);
   render(<QaArchitecturalLab municipalityId={tenant}/>);
   fireEvent.click(screen.getByText(/Laboratório QA · ensaio isolado/));
   fireEvent.click(screen.getByRole("button",{name:/Testar PDF arquivado no R2/}));
   await waitFor(()=>expect(screen.getByText(/3\/3 recuos lidos do R2/)).toBeInTheDocument());
   expect(fetchMock).toHaveBeenCalledTimes(2);
   expect(String(fetchMock.mock.calls[0]?.[0])).toContain(documentId);
   expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
   expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
   expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
     processId,documentId,confirmedTransfer:true,readingMode:"native_text",
   });
   expect(screen.getByText(/não são pagamentos ou documentos oficiais/)).toBeInTheDocument();
 });
 it("does not read R2 if permissions or triage fail",async()=>{
   const fetchMock=vi.fn(async (_url:string,_options?:RequestInit)=>({
     ok:true,json:async()=>({documentReady:false,nativeTextAvailable:false,
       documentMessage:"O documento ainda não está liberado para análise técnica."}),
   }));
   vi.stubGlobal("fetch",fetchMock);
   render(<QaArchitecturalLab municipalityId={tenant}/>);
   fireEvent.click(screen.getByText(/Laboratório QA · ensaio isolado/));
   fireEvent.click(screen.getByRole("button",{name:/Testar PDF arquivado no R2/}));
   await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("não está liberado"));
   expect(fetchMock).toHaveBeenCalledTimes(1);
 });
});
