import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UrbanDrawingMeasurementDesk } from "@/components/platform/UrbanDrawingMeasurementDesk";
import type { UrbanDrawingSuggestion } from "@/lib/urbanDrawingMeasurements";

const first: UrbanDrawingSuggestion = {
  id: "front-1", target:"front_setback_m", label:"Recuo frontal",
  value:4.5, unit:"m",page:1,excerpt:"Planta: recuo frontal: 4,50 m.",
};
const second: UrbanDrawingSuggestion={...first,id:"front-2",value:5,page:2};

describe("SIGAPRO QA — aceite explícito de medidas encontradas no PDF", () => {
  it("não escreve no formulário antes do usuário marcar a conferência",()=>{
    const onConfirm=vi.fn();
    render(<UrbanDrawingMeasurementDesk suggestions={[first]} readOnly={false} onConfirm={onConfirm}/>);
    expect(screen.getByText(/SIGAPRO IA — Cotas e áreas da planta/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Conferir cota"}));
    expect(screen.getByRole("button",{name:/Preencher medida conferida/i})).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:/Preencher medida conferida/i}));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(first);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("sinaliza cotas conflitantes sem selecionar automaticamente um valor",()=>{
    const onConfirm=vi.fn();
    render(<UrbanDrawingMeasurementDesk suggestions={[first,second]} readOnly={false} onConfirm={onConfirm}/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Conferir cota"})[0]);
    expect(screen.getByRole("alert")).toHaveTextContent(/outras medidas/i);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("não disponibiliza controles de edição para perfil somente leitura",()=>{
    const {container}=render(<UrbanDrawingMeasurementDesk suggestions={[first]} readOnly={true} onConfirm={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });
});
