import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {browserOcrIsOffered,normalizeBrowserOcrBlocks,suggestUrbanBrowserOcr}
  from "@/lib/urbanBrowserOcr";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const canvas=()=>{const element=document.createElement("canvas");element.width=800;element.height=1000;return element;};
beforeEach(()=>{
  vi.stubGlobal("isSecureContext",true);
});
afterEach(()=>vi.unstubAllGlobals());

describe("SIGAPRO IA — OCR experimental estritamente local",()=>{
  it("não ativa recurso sem detecção nativa do navegador ou fora de contexto seguro",()=>{
    vi.stubGlobal("TextDetector",undefined);
    expect(browserOcrIsOffered()).toBe(false);
    vi.stubGlobal("TextDetector",class{});
    vi.stubGlobal("isSecureContext",false);
    expect(browserOcrIsOffered()).toBe(false);
  });
  it("faz sugestão local em português apenas quando o modelo já está disponível",async()=>{
    const detect=vi.fn().mockResolvedValue([
      {rawValue:"Recuo frontal 5 m",boundingBox:{x:30,y:20}},
      {rawValue:"Área do terreno 250 m²",boundingBox:{x:20,y:55}},
    ]);
    class Detector{
      static availability=vi.fn(async()=> "available");
      static create=vi.fn(async()=>({detect}));
    }
    vi.stubGlobal("TextDetector",Detector);
    const page=canvas();
    expect(browserOcrIsOffered()).toBe(true);
    const text=await suggestUrbanBrowserOcr(page);
    expect(text).toContain("Recuo frontal 5 m");
    expect(text).toContain("Área do terreno 250 m²");
    expect(Detector.availability).toHaveBeenCalledWith({languages:["pt"]});
    expect(Detector.create).toHaveBeenCalledWith({languages:["pt"]});
    expect(detect).toHaveBeenCalledWith(page);
  });
  it("não baixa modelos que não estejam instalados e mantém conferência manual",async()=>{
    class Detector{
      static availability=vi.fn(async()=> "downloadable");
      static create=vi.fn(async()=>({detect:vi.fn()}));
    }
    vi.stubGlobal("TextDetector",Detector);
    await expect(suggestUrbanBrowserOcr(canvas())).rejects.toThrow(/não está instalado/);
    expect(Detector.create).not.toHaveBeenCalled();
  });
  it("nega criação que não tem consulta de disponibilidade",async()=>{
    class Detector{
      static create=vi.fn(async()=>({detect:vi.fn()}));
    }
    vi.stubGlobal("TextDetector",Detector);
    await expect(suggestUrbanBrowserOcr(canvas())).rejects.toThrow(/verificar antecipadamente/);
    expect(Detector.create).not.toHaveBeenCalled();
  });
  it("aceita API nativa antiga sem recursos externos e bloqueia imagens excessivas",async()=>{
    const detect=vi.fn().mockResolvedValue([{rawValue:"Recuo lateral: 1,5 m"}]);
    class Detector{detect=detect;}
    vi.stubGlobal("TextDetector",Detector);
    await expect(suggestUrbanBrowserOcr(canvas())).resolves.toContain("1,5 m");
    const excessive=canvas();excessive.width=4800;excessive.height=4800;
    await expect(suggestUrbanBrowserOcr(excessive)).rejects.toThrow(/limite seguro/);
    expect(detect).toHaveBeenCalledTimes(1);
  });
  it("limpa resultados inesperados e limita texto de OCR não confirmado",()=>{
    const lines=Array.from({length:150},(_,i)=>({
      rawValue:i===0?"Artigo 1.º":("Linha "+i+" ".repeat(20)),
      boundingBox:{x:10,y:i*15},
    }));
    const normalized=normalizeBrowserOcrBlocks(lines);
    expect(normalized.length).toBeLessThanOrEqual(4000);
    expect(normalized).toContain("Artigo 1.º");
    expect(normalizeBrowserOcrBlocks([{rawValue:null}])).toBe("");
  });
  it("não envia sugestão automaticamente nem elimina a segunda conferência",()=>{
    const pane=readFileSync(resolve(process.cwd(),
      "src/components/platform/UrbanScannedPageDesk.tsx"),"utf8");
    expect(pane).toContain("browserOcrIsOffered()");
    expect(pane).toContain("suggestUrbanBrowserOcr(canvas.current)");
    expect(pane).toContain('setFirst(ocrText.slice(0,280));setSecond("");setChecked(false)');
    expect(pane).toContain("validateUrbanScanTranscription(first,second,page,pages)");
    expect(pane).toContain("onVerifiedTranscript({page,text:normalizeUrbanScanTranscript(first)})");
    expect(pane).not.toContain("fetch(");
  });
});
