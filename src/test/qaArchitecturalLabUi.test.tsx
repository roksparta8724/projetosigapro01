import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QaArchitecturalLab} from "@/components/platform/QaArchitecturalLab";
import {backendClient} from "@/integrations/backend/databaseClient";
vi.mock("@/integrations/backend/databaseClient",()=>({
 backendClient:{auth:{getSession:vi.fn()}},
}));
describe("QA laboratory is separate from municipality processes",()=>{
 beforeEach(()=>vi.mocked(backendClient.auth.getSession).mockResolvedValue({
   data:{session:{access_token:"synthetic-jwt"}},
 } as never));
 afterEach(()=>vi.unstubAllGlobals());
 it("shows only synthetic results; sends no process or payment identifiers",async()=>{
  const fetchMock=vi.fn(async (_url:string,_options?:RequestInit)=>({ok:true,json:async()=>({
   kind:"sigapro.qa04.synthetic-pdf.v1",status:"passed",
   summary:{passed:3,total:3,pagesRead:3},
   cases:[{metric:"front_setback_m",label:"Frontal",expected:5,readValue:5,readPage:2,verified:true},
    {metric:"side_setback_m",label:"Lateral",expected:1,readValue:1,readPage:2,verified:true},
    {metric:"rear_setback_m",label:"Fundos",expected:12,readValue:12,readPage:2,verified:true}],
   legalConformity:"not_evaluated",processUpdated:false,providerRequests:0,
  })}));
  vi.stubGlobal("fetch",fetchMock);
  render(<QaArchitecturalLab/>);
  fireEvent.click(screen.getByText(/Laboratório QA · ensaio isolado sem triagem/));
  fireEvent.click(screen.getByRole("button",{name:/Executar leitura de teste sem créditos/}));
  await waitFor(()=>expect(screen.getByText(/3 de 3 recuos/)).toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("qa-architectural-benchmark");
  expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBe("{}");
 });
});
