import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProtocolTechnicalResponsibility } from "@/components/platform/ProtocolTechnicalResponsibility";
import { defaultProtocolDraftForm, type ProtocolDraftForm } from "@/lib/protocolDraft";

function Fixture(){
  const [form,setForm]=useState<ProtocolDraftForm>({...defaultProtocolDraftForm,tipoProfissional:"Arquiteto(a) e Urbanista",conselhoProfissional:"CAU"});
  return <>
    <ProtocolTechnicalResponsibility form={form}
      setField={(key,value)=>setForm(current=>({...current,[key]:value}))}
      setToggle={(key,value)=>setForm(current=>({...current,[key]:value}))}/>
    <output data-testid="result">{JSON.stringify(form)}</output>
  </>;
}
describe("independent professional roles in protocol",()=>{
  it("shows RRT for CAU instead of forcing ART/CREA",()=>{
    render(<Fixture/>);
    expect(screen.getByText("RRT do projeto")).toBeTruthy();
    expect(screen.getByText("RRT da execução")).toBeTruthy();
  });
  it("keeps legacy projects with same execution responsible until changed explicitly",()=>{
    render(<Fixture/>);
    expect(document.querySelector('[data-execution-responsible="true"]')).toBeNull();
    expect(document.querySelector('[data-protocol-requester="true"]')).toBeNull();
  });
  it("reveals a separate execution professional and stores the name in the actual form state",()=>{
    render(<Fixture/>);
    fireEvent.click(screen.getByText("O responsável pela execução é o mesmo profissional responsável pelo projeto"));
    expect(document.querySelector('[data-execution-responsible="true"]')).toBeTruthy();
    const row=document.querySelector('[data-execution-responsible="true"]');
    const fields=row?.querySelectorAll("input");
    expect(fields?.length).toBeGreaterThan(0);
    fireEvent.change(fields![0],{target:{value:"Responsável pela execução QA"}});
    expect(screen.getByTestId("result").textContent).toContain('"execucaoNome":"Responsável pela execução QA"');
  });
  it("does not turn a different protocol applicant into the signed-in process identity",()=>{
    render(<Fixture/>);
    fireEvent.click(screen.getByText("O protocolante é o mesmo responsável técnico pelo projeto"));
    expect(document.querySelector('[data-protocol-requester="true"]')).toBeTruthy();
    const first=document.querySelector('[data-protocol-requester="true"] input');
    expect(first).toBeTruthy();
    fireEvent.change(first!,{target:{value:"Protocolante externo QA"}});
    expect(screen.getByTestId("result").textContent).toContain('"protocolanteNome":"Protocolante externo QA"');
    expect(screen.getByTestId("result").textContent).toContain('"profissional":""');
  });
});