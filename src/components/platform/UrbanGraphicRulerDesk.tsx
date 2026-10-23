import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Ruler, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UrbanMetric } from "@/lib/urbanPrecheck";
import { renderUrbanGraphicPdfPage } from "@/lib/urbanGraphicPdfRenderer";
import {
  buildUrbanGraphicEvidence, measureUrbanGraphicDistance, parseUrbanKnownMeters,
  urbanPageDistance, type UrbanGraphicPoint, type UrbanGraphicSegment,
  type UrbanGraphicCalibration,
} from "@/lib/urbanGraphicScale";

const DISTANCES: UrbanMetric[]=[
  "front_setback_m","side_setback_m","rear_setback_m","height_m",
];

type Props={
  pdfBytes:Uint8Array;
  documentId:string;
  fileName:string;
  documentVersion:number;
  fileHash?:string;
  totalPages:number;
  allowedMetrics:Array<{key:UrbanMetric;label:string}>;
  readOnly:boolean;
  onUseMeasurement:(metric:UrbanMetric,value:number,evidence:string)=>void;
};

export function UrbanGraphicRulerDesk({
  pdfBytes,documentId,fileName,documentVersion,fileHash,
  totalPages,allowedMetrics,readOnly,onUseMeasurement,
}:Props){
  const canvas=useRef<HTMLCanvasElement|null>(null);
  const [page,setPage]=useState(1);
  const [zoom,setZoom]=useState(1.15);
  const [viewport,setViewport]=useState<{width:number;height:number}|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [mode,setMode]=useState<"calibration"|"measurement">("calibration");
  const [points,setPoints]=useState<UrbanGraphicPoint[]>([]);
  const [calibration,setCalibration]=useState<UrbanGraphicCalibration|null>(null);
  const [measured,setMeasured]=useState<UrbanGraphicSegment|null>(null);
  const [knownMeters,setKnownMeters]=useState("");
  const [metric,setMetric]=useState<UrbanMetric|"">("");
  const [confirmed,setConfirmed]=useState(false);
  const [message,setMessage]=useState("");
  const eligible=useMemo(()=>allowedMetrics.filter(x=>DISTANCES.includes(x.key)),[allowedMetrics]);
  const meters=viewport&&calibration&&measured?measureUrbanGraphicDistance({
    calibration,measuredSegment:measured,measuredPage:page,
    pageWidth:viewport.width,pageHeight:viewport.height,
  }):null;
  const calibrationDraft=points.length===2 && mode==="calibration" && viewport
    ? urbanPageDistance({a:points[0],b:points[1]},viewport.width,viewport.height)
    : null;

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError("");setViewport(null);
    if(!canvas.current) return;
    void renderUrbanGraphicPdfPage({
      bytes:pdfBytes,pageNumber:page,scale:zoom,canvas:canvas.current,signal:controller.signal,
    }).then(result=>{
      if(!controller.signal.aborted){
        setViewport({width:result.width,height:result.height});
        setLoading(false);
      }
    }).catch(problem=>{
      if(!controller.signal.aborted){
        setError(String((problem as Error)?.message||problem));
        setLoading(false);
      }
    });
    return ()=>{controller.abort();};
  },[pdfBytes,page,zoom]);

  const resetPage=(number:number)=>{
    setPage(number);
    setMode("calibration");setPoints([]);setCalibration(null);
    setMeasured(null);setKnownMeters("");setConfirmed(false);setMessage("");
  };
  const calibrate=()=>{
    setMode("calibration");setCalibration(null);setMeasured(null);
    setPoints([]);setConfirmed(false);setMessage("");
  };
  const markPoint=(event:MouseEvent<SVGSVGElement>)=>{
    if(readOnly||loading||!viewport||error) return;
    if(mode==="measurement"&&!calibration) return;
    const rect=event.currentTarget.getBoundingClientRect();
    if(!rect.width||!rect.height) return;
    const point={
      x:Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)),
      y:Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height)),
    };
    setConfirmed(false);setMessage("");
    if(points.length!==1){
      setPoints([point]);
      if(mode==="measurement")setMeasured(null);
    }else{
      setPoints([points[0],point]);
      if(mode==="measurement")setMeasured({a:points[0],b:point});
    }
  };

  const confirmCalibration=()=>{
    if(readOnly||mode!=="calibration"||points.length!==2||!viewport)return;
    const value=parseUrbanKnownMeters(knownMeters);
    if(value===null||calibrationDraft===null||calibrationDraft<12){
      setMessage("Informe uma cota real positiva em metros e marque dois pontos bem separados da mesma cota.");
      return;
    }
    setCalibration({page,segment:{a:points[0],b:points[1]},referenceMeters:value});
    setMode("measurement");setPoints([]);setMeasured(null);
    setMessage("Escala calibrada nesta página. Agora selecione dois pontos para medir um único segmento.");
  };
  const accept=()=>{
    if(readOnly||loading||!calibration||!measured||!metric||meters===null||!confirmed)return;
    try{
      const evidence=buildUrbanGraphicEvidence({
        documentId,fileName,version:documentVersion,fileHash,page,
        calibration,measuredSegment:measured,measuredMeters:meters,
      });
      onUseMeasurement(metric,meters,evidence);
      setConfirmed(false);setPoints([]);setMeasured(null);
      setMessage("Distância indicativa enviada para conferência. Medições anteriores serão preservadas.");
    }catch(problem){
      setMessage(String((problem as Error)?.message||problem));
    }
  };

  function renderLine(segment:UrbanGraphicSegment, color:string,dash?:string){
    if(!viewport)return null;
    const x=(p:UrbanGraphicPoint)=>p.x*viewport.width;
    const y=(p:UrbanGraphicPoint)=>p.y*viewport.height;
    return <g>
      <line x1={x(segment.a)} y1={y(segment.a)} x2={x(segment.b)} y2={y(segment.b)}
        stroke={color} strokeWidth={3.5} strokeDasharray={dash}/>
      {[segment.a,segment.b].map((p,index)=><circle key={index}
        cx={x(p)} cy={y(p)} r={6} stroke="#071c2e" strokeWidth={2} fill={color}/>)}
    </g>;
  }

  if(readOnly||eligible.length===0)return null;
  return (
    <section data-urban-graphic-ruler="true"
      className="mt-4 min-w-0 rounded-[20px] border border-sky-300 bg-white p-4 text-slate-900 dark:border-sky-600 dark:bg-[#102b43] dark:text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
          <ScanLine className="h-5 w-5 text-sky-700 dark:text-sky-300"/>
          Régua gráfica assistida da planta
        </h5>
        <span className="rounded-full border border-amber-400 px-3 py-1 text-[10px] font-bold text-amber-900 dark:text-amber-100">
          Medição indicativa · conferência humana
        </span>
      </header>
      <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
        Calibre com uma cota verdadeira que esteja desenhada NESTA página; marque depois os extremos
        de outra distância. O resultado depende da escala e da precisão dos pontos, não substitui
        a medição técnica nem confirma recuos legais. Sem transmissão do PDF.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[135px] text-xs font-bold">
          Página da prancha
          <select aria-label="Página da régua gráfica" className="mt-1 block h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#071d30] dark:text-white"
            value={page} onChange={event=>resetPage(Number(event.target.value))}>
            {Array.from({length:Math.min(Math.max(0,totalPages),24)},(_,i)=>i+1)
              .map(n=><option key={n} value={n}>Página {n}</option>)}
          </select>
        </label>
        <label className="min-w-[110px] text-xs font-bold">
          Ampliação
          <select aria-label="Zoom da régua gráfica" className="mt-1 block h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#071d30] dark:text-white"
            value={zoom} onChange={event=>setZoom(Number(event.target.value))}>
            <option value={0.85}>85%</option>
            <option value={1.15}>115%</option>
            <option value={1.6}>160%</option>
            <option value={2}>200%</option>
          </select>
        </label>
        <Button type="button" variant="outline" onClick={calibrate}>Refazer calibração</Button>
      </div>
      <div className="mt-3 max-h-[660px] max-w-full overflow-auto rounded-xl border border-slate-600 bg-[#27313d] p-3"
        data-testid="graphic-ruler-scroll">
        <div className="relative mx-auto" style={{
          width:viewport?.width||"100%",height:viewport?.height||480,minWidth:320,
        }}>
          <canvas ref={canvas} aria-label="Página PDF para medição gráfica"
            className="block" style={{maxWidth:"none"}}/>
          {viewport&&!loading&&!error?(
            <svg role="img" aria-label="Clique dois pontos na prancha para calibrar ou medir"
              viewBox={"0 0 "+viewport.width+" "+viewport.height}
              onClick={markPoint} className="absolute inset-0 cursor-crosshair touch-manipulation"
              style={{width:viewport.width,height:viewport.height}}>
              {calibration?renderLine(calibration.segment,"#06b6d4"):null}
              {measured?renderLine(measured,"#f59e0b"):null}
              {points.length===2?renderLine({a:points[0],b:points[1]},
                mode==="calibration"?"#06b6d4":"#f59e0b","5 4"):null}
              {points.length===1?<circle
                cx={points[0].x*viewport.width} cy={points[0].y*viewport.height}
                r={6} fill={mode==="calibration"?"#06b6d4":"#f59e0b"}/>:null}
            </svg>
          ):null}
        </div>
      </div>
      {loading?<p role="status" className="mt-2 flex items-center gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin"/> Renderizando página do PDF no navegador...
      </p>:null}
      {error?<p role="alert" className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-200">
        Não foi possível renderizar a prancha: {error}
      </p>:null}
      {!error&&!loading&&mode==="calibration"?(
        <div className="mt-3 space-y-3 rounded-xl border border-cyan-200 bg-sky-50 p-3 dark:border-cyan-700 dark:bg-[#0d2135]">
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            Etapa 1/2 — Clique nos dois extremos de uma cota conhecida nesta página
            ({points.length}/2 pontos)
          </p>
          <label className="block max-w-sm text-xs font-bold text-slate-900 dark:text-white">
            Comprimento real da cota escolhida, em metros
            <Input aria-label="Comprimento da cota de calibração em metros"
              value={knownMeters} onChange={event=>setKnownMeters(event.target.value)}
              inputMode="decimal" placeholder="Ex.: 5,00" className="mt-1"/>
          </label>
          <Button type="button" className="bg-sky-700 text-white hover:bg-sky-800"
            disabled={points.length!==2||parseUrbanKnownMeters(knownMeters)===null||
              calibrationDraft===null||calibrationDraft<12}
            onClick={confirmCalibration}>Confirmar escala desta página</Button>
        </div>
      ):null}
      {!error&&!loading&&mode==="measurement"&&calibration?(
        <div className="mt-3 space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-700 dark:bg-[#0c2239]">
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            Etapa 2/2 — Calibração: {calibration.referenceMeters.toLocaleString("pt-BR")} m.
            Clique nos extremos da distância a conferir ({points.length}/2 pontos).
          </p>
          {meters!==null?<p role="status" className="text-base font-extrabold text-slate-950 dark:text-white">
            Distância gráfica estimada: {meters.toLocaleString("pt-BR",{maximumFractionDigits:3})} m
          </p>:null}
          {measured&&meters===null?<p role="alert" className="text-xs text-amber-950 dark:text-amber-200">
            Segmento muito curto, fora da página ou cálculo inválido. Escolha dois pontos mais afastados.
          </p>:null}
          <label className="block max-w-md text-xs font-bold text-slate-900 dark:text-white">
            Campo técnico para a distância
            <select aria-label="Parâmetro para distância gráfica" value={metric}
              onChange={event=>{setMetric(event.target.value as UrbanMetric|"");setConfirmed(false);}}
              className="mt-1 block h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#071d30] dark:text-white">
              <option value="">Selecione o parâmetro</option>
              {eligible.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs font-medium text-slate-800 dark:text-slate-100">
            <input type="checkbox" checked={confirmed} disabled={meters===null||!metric}
              onChange={event=>setConfirmed(event.target.checked)} className="mt-0.5"/>
            Conferi na prancha original os extremos, a cota de calibração, a unidade e a
            pertinência deste segmento ao imóvel. Estou registrando apenas uma estimativa.
          </label>
          <Button type="button" disabled={!confirmed||meters===null||!metric}
            onClick={accept} className="bg-sky-700 text-white hover:bg-sky-800">
            <CheckCircle2 className="mr-2 h-4 w-4"/> Preencher distância conferida
          </Button>
        </div>
      ):null}
      {message?<p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-[#33271a] dark:text-amber-100">
        <AlertTriangle className="mr-1 inline h-4 w-4"/>{message}
      </p>:null}
    </section>
  );
}
