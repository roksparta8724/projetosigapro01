import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ArchitecturalPdfAiPanel} from "@/components/platform/ArchitecturalPdfAiPanel";
import {backendClient} from "@/integrations/backend/databaseClient";
import {URBAN_METRICS} from "@/lib/urbanPrecheck";
import type {ProcessRecord} from "@/lib/platform";

vi.mock("@/integrations/backend/databaseClient",()=>({
  backendClient:{
    auth:{getSession:vi.fn(async()=>({
      data:{session:{access_token:"qa-session-access-token"}},
    }))},
  },
}));

const documentId="5fd367de-d85c-48d9-8c4f-ad2d6824b4cb";
const process={
  id:"915e1c63-ebda-4cdd-8e95-34316d9e0089",
  tenantId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
  documents:[{
    id:documentId,version:2,uploaded:true,
    filePath:"r2:municipalities/qa/process04/planta.pdf",
    fileName:"SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf",
    label:"Projeto Arquitetônico",
  }],
} as unknown as ProcessRecord;

function available(override:Record<string,unknown>={}){
  return {
    enabled:true,provider:"claude",mode:"visual",
    documentReady:true,documentMessage:"PDF vigente liberado para análise.",
    textAlternativeAvailable:true,openaiVisualAlternativeAvailable:false,
    geminiQaFixture:false,geminiQaAvailable:false,nativeTextAvailable:true,
    ...override,
  };
}
function mockReaderReadiness(data:Record<string,unknown>={}){
  const fetchMock=vi.fn(async (_url:string,options?:RequestInit)=>{
    if(options?.method==="GET"){
      return {ok:true,status:200,json:async()=>available(data)};
    }
    return {ok:false,status:502,json:async()=>({
      error:"Leitura documental rejeitada: JSON inválido.",
      code:"CLOUDFLARE_MODEL_INVALID_JSON",
    })};
  });
  vi.stubGlobal("fetch",fetchMock);
  return fetchMock;
}
function setup(){
  return render(<ArchitecturalPdfAiPanel
    process={process}
    documentId={documentId}
    readOnly={false}
    compact
    activeMetrics={URBAN_METRICS.map(metric=>metric.key)}
    onApply={vi.fn()}
  />);
}
const start=()=>screen.getByRole("button",{name:/Ler cotas do PDF sem IA|Analisar prancha com SIGAPRO IA|Extrair texto com SIGAPRO IA/});

describe("SIGAPRO QA: aceite inequívoco e extração operacional",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    vi.mocked(backendClient.auth.getSession).mockResolvedValue({
      data:{session:{access_token:"qa-session-access-token"}},
    } as never);
  });
  afterEach(()=>vi.unstubAllGlobals());

  it("abre pronto para leitura local sem exigir envio do PDF a terceiros",async()=>{
    mockReaderReadiness();
    const {container}=setup();
    await waitFor(()=>expect(start()).toBeEnabled());
    expect(container.querySelector('[data-sigapro-ai-consent-checkbox="true"]')).toBeNull();
    expect(container.querySelector('[data-sigapro-ai-primary-action="true"]')).toBeTruthy();
    expect(container.querySelector('details[data-sigapro-ai-diagnostics-details="true"]')).not.toHaveAttribute("open");
    expect(screen.getByText(/não envia o PDF a prestadores externos/)).toBeInTheDocument();
  });

  it("ativa a extração externa somente após clicar ACEITO, sem transmitir antes",async()=>{
    const mock=mockReaderReadiness();
    setup();
    await waitFor(()=>expect(start()).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:/IA Documental/}));
    const acceptance=screen.getByRole("checkbox",{name:/Aceito o envio deste PDF ao prestador externo selecionado/i});
    expect(acceptance).not.toBeChecked();
    expect(start()).toBeDisabled();
    expect(screen.getByText(/Para habilitar a extração externa, marque ACEITO/)).toBeInTheDocument();
    expect(mock.mock.calls.filter((args)=>args[1]?.method==="POST")).toHaveLength(0);
    fireEvent.click(screen.getByText(/ACEITO o envio deste PDF à IA externa/));
    expect(acceptance).toBeChecked();
    expect(start()).toBeEnabled();
    fireEvent.click(start());
    await waitFor(()=>expect(mock.mock.calls.some((args)=>args[1]?.method==="POST")).toBe(true));
    const post=mock.mock.calls.find((args)=>args[1]?.method==="POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      confirmedTransfer:true,
      readingMode:"cloudflare_text",
      processId:process.id,
      documentId,
    });
    expect(mock.mock.calls.filter((args)=>args[1]?.method==="POST")).toHaveLength(1);
    await screen.findByText(/JSON inválido/);
  });

  it("revoga o aceite ao trocar o fornecedor e bloqueia nova extração",async()=>{
    mockReaderReadiness();
    setup();
    await waitFor(()=>expect(start()).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:/IA Documental/}));
    fireEvent.click(screen.getByText(/ACEITO o envio deste PDF à IA externa/));
    expect(start()).toBeEnabled();
    fireEvent.click(screen.getByRole("button",{name:/IA Visual/}));
    expect(screen.getByRole("checkbox",{name:/Aceito o envio/})).not.toBeChecked();
    expect(start()).toBeDisabled();
  });

  it("aceitar não contorna a triagem ou indisponibilidade do documento",async()=>{
    const mock=mockReaderReadiness({
      documentReady:false,
      documentMessage:"A triagem ainda não liberou este PDF para análise.",
      nativeTextAvailable:false,
    });
    setup();
    await waitFor(()=>expect(screen.getByText(/A triagem ainda não liberou este PDF/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button",{name:/IA Visual/}));
    fireEvent.click(screen.getByText(/ACEITO o envio deste PDF à IA externa/));
    expect(start()).toBeDisabled();
    expect(mock.mock.calls.filter((args)=>args[1]?.method==="POST")).toHaveLength(0);
  });
});
