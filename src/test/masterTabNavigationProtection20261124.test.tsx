// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InternalTabs } from "@/components/platform/InternalTabs";

const items = [{value:"carteira",label:"Carteira"},{value:"cadastro",label:"Nova Prefeitura"}];
function Fixture({disabled=false,reselect=false,onChange}:{disabled?:boolean;reselect?:boolean;onChange:(v:string)=>void}) {
  const [value,setValue] = useState("cadastro");
  const location = useLocation();
  return <>
    <InternalTabs items={items} value={value} disabled={disabled}
      reselectValue={reselect ? "cadastro" : undefined}
      onChange={(next)=>{onChange(next);setValue(next);}} />
    <output data-testid="query">{location.search}</output>
  </>;
}
describe("Protected Master tab navigation",()=>{
  it("allows an active cadastro tab to start a clean form only when explicitly enabled",()=>{
    const onChange=vi.fn();
    render(<MemoryRouter initialEntries={["/master?secao=cadastro"]}><Fixture onChange={onChange} reselect /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button",{name:"Nova Prefeitura"}));
    expect(onChange).toHaveBeenCalledWith("cadastro");
  });
  it("keeps the route and selected tab unchanged while saving",()=>{
    const onChange=vi.fn();
    render(<MemoryRouter initialEntries={["/master?secao=cadastro"]}><Fixture onChange={onChange} disabled /></MemoryRouter>);
    const button=screen.getByRole("button",{name:"Carteira"});
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("query").textContent).toBe("?secao=cadastro");
  });
  it("does not restart an already active tab by default",()=>{
    const onChange=vi.fn();
    render(<MemoryRouter initialEntries={["/master?secao=cadastro"]}><Fixture onChange={onChange}/></MemoryRouter>);
    fireEvent.click(screen.getByRole("button",{name:"Nova Prefeitura"}));
    expect(onChange).not.toHaveBeenCalled();
  });
});
