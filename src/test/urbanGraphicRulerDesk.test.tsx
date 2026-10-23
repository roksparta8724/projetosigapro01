import {describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {UrbanGraphicRulerDesk} from "@/components/platform/UrbanGraphicRulerDesk";

vi.mock("@/lib/urbanGraphicPdfRenderer",()=>({
  renderUrbanGraphicPdfPage:vi.fn(async ({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.width=1000;canvas.height=800;
    return {width:1000,height:800,totalPages:2};
  }),
}));

const bytes=new TextEncoder().encode("%PDF-1.7\n%%EOF");
const props={
  pdfBytes:bytes,
  documentId:"f5d5e9aa-9ef9-4074-ab22-78bc0081e964",
  fileName:"planta-implantacao.pdf",
  documentVersion:1,
  fileHash:"f".repeat(64),
  totalPages:2,
  allowedMetrics:[
    {key:"front_setback_m" as const,label:"Recuo frontal"},
    {key:"occupancy_percent" as const,label:"Taxa de ocupação"},
  ],
  readOnly:false,
};

const mockRect={
  left:0,top:0,width:1000,height:800,right:1000,bottom:800,x:0,y:0,toJSON:()=>({}),
};
const clickPoint=(x:number,y:number)=>{
  const svg=screen.getByRole("img",{name:/Clique dois pontos na prancha/i});
  vi.spyOn(svg,"getBoundingClientRect").mockReturnValue(mockRect);
  fireEvent.click(svg,{clientX:x,clientY:y});
};

describe("SIGAPRO QA — calibração gráfica visual e aceite do servidor",()=>{
  it("exige cota conhecida, dois pontos e aprovação antes de preencher",async()=>{
    const onUseMeasurement=vi.fn();
    render(<UrbanGraphicRulerDesk {...props} onUseMeasurement={onUseMeasurement}/>);
    await screen.findByRole("img",{name:/Clique dois pontos na prancha/i});
    expect(screen.getByText(/Etapa 1\/2/i)).toBeInTheDocument();
    expect(screen.getByRole("button",{name:/Confirmar escala desta página/i})).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox",{name:/Comprimento da cota de calibração/i}),{
      target:{value:"5"},
    });
    clickPoint(100,200);clickPoint(300,200);
    expect(screen.getByRole("button",{name:/Confirmar escala desta página/i})).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:/Confirmar escala desta página/i}));
    await screen.findByText(/Etapa 2\/2/i);
    clickPoint(450,450);clickPoint(550,450);
    expect(screen.getByText(/Distância gráfica estimada: 2,5 m/i)).toBeInTheDocument();
    expect(screen.getByRole("button",{name:/Preencher distância conferida/i})).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox",{name:/Parâmetro para distância gráfica/i}),{
      target:{value:"front_setback_m"},
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:/Preencher distância conferida/i}));
    expect(onUseMeasurement).toHaveBeenCalledTimes(1);
    expect(onUseMeasurement.mock.calls[0][0]).toBe("front_setback_m");
    expect(onUseMeasurement.mock.calls[0][1]).toBeCloseTo(2.5,9);
    expect(onUseMeasurement.mock.calls[0][2]).toContain("Medição gráfica manual INDICATIVA");
  });
  it("troca de página invalida calibração anterior",async()=>{
    const onUseMeasurement=vi.fn();
    render(<UrbanGraphicRulerDesk {...props} onUseMeasurement={onUseMeasurement}/>);
    await screen.findByRole("img",{name:/Clique dois pontos na prancha/i});
    fireEvent.change(screen.getByRole("textbox",{name:/Comprimento da cota de calibração/i}),{
      target:{value:"10"},
    });
    clickPoint(100,200);clickPoint(400,200);
    fireEvent.click(screen.getByRole("button",{name:/Confirmar escala desta página/i}));
    expect(screen.getByText(/Etapa 2\/2/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox",{name:/Página da régua gráfica/i}),{target:{value:"2"}});
    await waitFor(()=>expect(screen.getByText(/Etapa 1\/2/i)).toBeInTheDocument());
    expect(onUseMeasurement).not.toHaveBeenCalled();
  });
  it("não mostra régua para perfil sem permissão de edição",()=>{
    const {container}=render(<UrbanGraphicRulerDesk {...props} readOnly={true} onUseMeasurement={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });
});
