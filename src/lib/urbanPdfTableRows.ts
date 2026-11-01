/**
 * Strict, position-backed Quadro I table reader for searchable PDFs.
 * This reader never guesses a cell, uses nearby header geometry, and never
 * approves a legal parameter. If headers or row scope are uncertain, stop.
 */
import { URBAN_VISION_FIELDS, type UrbanVisionFieldKey } from "./urbanVisionStructured";
import type {UrbanPdfSourceLayer,PdfTextRun} from "./urbanPdfTextLayer";
const COLUMNS:UrbanVisionFieldKey[]=[
 "ca_minimo","ca_basico","ca_maximo","ocupacao_maxima",
 "permeabilidade_minima","lote_minimo","testada_minima",
 "gabarito","recuo_frontal","recuo_fundos","recuo_lateral",
];
type Header={key:UrbanVisionFieldKey;x:number;y:number};
export type TableRowCandidate={
 id:string;zone:string;usage:string;y:number;
 // Actual source location of the merged/centred printed zone cell.
 // A zone code can be BELOW the commercial row it governs.
 zoneEvidenceY?:number;
 label:string;
};
export type UrbanTableCell={
 key:UrbanVisionFieldKey;label:string;value:string|null;
 status:"source_text"|"missing"|"ambiguous";
 evidence:readonly PdfTextRun[];
};
export type UrbanTableReading={
 status:"read"|"not_supported"|"select_row";
 reason:string;page:number;row:TableRowCandidate|null;
 cells:UrbanTableCell[];recognized:number;
};
export type UrbanPdfRowDiscovery={
 rows:TableRowCandidate[];
 usageRowCount:number;
 unresolvedUsageRows:number;
 ambiguousZoneUsageRows:number;
};
function normalize(s:string):string{
 return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/\s+/g," ").trim();
}
const compact=(s:string)=>normalize(s).replace(/[^A-Z0-9]+/g,"");
const centerY=(r:PdfTextRun)=>r.y+r.height/2;
const centerX=(r:PdfTextRun)=>r.x+r.width/2;
const NUMBER=/^\d{1,6}(?:[,.]\d{1,3})?\s*(?:%|m²|m2|m)?$/i;
const USES=/^(?:comercial|residencial|industrial|misto|mista|institucional|habitacional|servi[cç]os)$/i;
const ZONE_CODE=/^(?:ZM|ZR|ZC|ZI|ZE|ZEU|ZUM|AIU)[-–]?[A-Z0-9][A-Z0-9().-]{0,27}$/i;
function printedZone(r:PdfTextRun):string|null{
  // Some PDFs merge a printed "ZONA" heading and the actual zone into one
  // text run. Strip that heading ONLY when the remainder is a valid code.
  const candidate=r.text.trim().replace(/^ZONA\s*/i,"").trim();
  // Fragment "ZM-" is not a complete zone code. Never invent its suffix.
  return ZONE_CODE.test(candidate)?candidate:null;
}
function detectHeader(r:PdfTextRun):UrbanVisionFieldKey|null{
 const word=normalize(r.text);
 const x=centerX(r);
 if(x<145||x>760)return null;
 if(x<310&&/\bMINIMO\b/.test(word))return "ca_minimo";
 if(x<310&&/\bBASICO\b/.test(word))return "ca_basico";
 if(x<310&&/\bMAXIMO\b/.test(word))return "ca_maximo";
 if(x>260&&x<345&&/OCUPACAO/.test(word))return "ocupacao_maxima";
 if(x>300&&x<407&&/PERMEABILIDADE/.test(word))return "permeabilidade_minima";
 if(x>380&&x<450&&/\bLOTE\b/.test(word))return "lote_minimo";
 if(x>430&&x<510&&/TESTADA/.test(word))return "testada_minima";
 if(x>480&&x<575&&/(GABARITO|ALTURA MAXIMA)/.test(word))return "gabarito";
 if(x>540&&x<610&&/(FRENTE|FRONTAL)/.test(word))return "recuo_frontal";
 if(x>580&&x<650&&/FUNDOS/.test(word))return "recuo_fundos";
 // Distinguish the true LATERAL column from the printed margin note
 // "(recuo lateral)" (also present on physical page 36 of quadros.pdf).
 // The old substring match yielded TWO lateral headers and discarded all 13 cells.
 if(x>620&&x<675&&word==="LATERAL")return "recuo_lateral";
 return null;
}
function headersFor(layer:UrbanPdfSourceLayer):Header[]|null{
 const firstUse=layer.runs.filter(r=>USES.test(r.text.trim())&&r.x>90&&r.x<185)
  .reduce((n,r)=>Math.min(n,r.y),Infinity);
 if(!Number.isFinite(firstUse))return null;
 const headers:Header[]=[];
 for(const key of COLUMNS){
  const candidates=layer.runs.filter(r=>r.y<firstUse-15&&r.y>firstUse-160&&detectHeader(r)===key);
  if(candidates.length!==1)return null; // no arbitrary choice of duplicate headings
  headers.push({key,x:centerX(candidates[0]),y:centerY(candidates[0])});
 }
 if(headers.some((h,i)=>i>0&&h.x-headers[i-1].x<12))return null;
 return headers;
}
/** Discover real rows, pairing commercial/residential under a centred merged-zone cell.
 * A printed zone can sit between its two usage rows; using only the most
 * recent ABOVE-zone silently assigns the next commercial row to the prior
 * zone. Never infer a zone for a group if two printed labels are too close. */
export function inspectUrbanPdfRows(layer:UrbanPdfSourceLayer):UrbanPdfRowDiscovery{
 const empty:UrbanPdfRowDiscovery={rows:[],usageRowCount:0,
  unresolvedUsageRows:0,ambiguousZoneUsageRows:0};
 if(layer.textStatus!=="text_available")return empty;
 const headers=headersFor(layer);
 if(!headers)return empty;
 const zoneRuns=layer.runs
  .filter(r=>r.x<headers[0].x-65&&printedZone(r)!==null)
  .sort((a,b)=>centerY(a)-centerY(b));
 const usageRuns=layer.runs.filter(r=>
   r.x>70&&centerX(r)<headers[0].x-12&&USES.test(r.text.trim())&&
   r.y>Math.max(...headers.map(h=>h.y))+8)
  .sort((a,b)=>centerY(a)-centerY(b));
 const groups:PdfTextRun[][]=[];
 for(let i=0;i<usageRuns.length;i++){
  const first=usageRuns[i],next=usageRuns[i+1];
  if(next&&compact(first.text)==="COMERCIAL"&&compact(next.text)==="RESIDENCIAL"&&
     centerY(next)-centerY(first)>10&&centerY(next)-centerY(first)<50){
    groups.push([first,next]);i++;
  }else groups.push([first]);
 }
 const result:TableRowCandidate[]=[];
 let ambiguousZoneUsageRows=0;
 for(const group of groups){
  const groupY=group.reduce((sum,r)=>sum+centerY(r),0)/group.length;
  const nearest=zoneRuns.map(run=>({run,distance:Math.abs(centerY(run)-groupY)}))
    .sort((a,b)=>a.distance-b.distance);
  const best=nearest[0],second=nearest[1];
  // One printed zone may continue across additional rows, but never bridge
  // an adjacent different zone. Ambiguous proximity means no association.
  const maxDistance=zoneRuns.length===1?70:40;
  if(!best||best.distance>maxDistance||
    (second&&second.distance-best.distance<9))continue;
  const zone=printedZone(best.run);
  if(!zone||zone.length>40)continue;
  // Some merged zone cells on the real PDF read "ZM-B3(A) e ZM-B3(B)".
  // A valid first token plus extra fragments is NEVER a single-zone label.
  // Use the CENTER of each fragment: 'residencial' begins at x≈106, but its
  // center is in the USO column and MUST NOT be treated as a zone fragment.
  const topY=Math.min(...group.map(centerY))-12;
  const bottomY=Math.max(...group.map(centerY))+12;
  const fragments=layer.runs.filter(run=>
    run!==best.run && centerX(run)<headers[0].x-65 &&
    centerY(run)>=topY && centerY(run)<=bottomY &&
    run.text.trim().length>0 && normalize(run.text)!=="ZONA");
  if(fragments.length){
   ambiguousZoneUsageRows+=group.length;
   continue;
  }
  for(const usageRun of group){
    const y=centerY(usageRun);
    result.push({id:layer.page+":"+Math.round(y*10),
      zone,usage:usageRun.text.trim(),y,zoneEvidenceY:centerY(best.run),
      label:zone+" · "+usageRun.text.trim()+
        " · linha "+(result.length+1)+" da página"});
  }
 }
 const rows=result.slice(0,70);
 return {rows,usageRowCount:usageRuns.length,
   unresolvedUsageRows:Math.max(0,usageRuns.length-rows.length),
   ambiguousZoneUsageRows};
}
export function discoverUrbanPdfRows(layer:UrbanPdfSourceLayer):TableRowCandidate[]{
 return inspectUrbanPdfRows(layer).rows;
}
export function readUrbanTableRow(
 layer:UrbanPdfSourceLayer,rowId:string,
):UrbanTableReading{
 const rows=discoverUrbanPdfRows(layer);
 const row=rows.find(r=>r.id===rowId)||null;
 const empty=(reason:string,status:"not_supported"|"select_row"):UrbanTableReading=>({
  status,reason,page:layer.page,row:null,recognized:0,cells:[],
 });
 if(!row)return empty("Selecione uma linha encontrada no PDF antes de conferir valores.","select_row");
 const headers=headersFor(layer);
 if(!headers)return empty("Não foi possível identificar todos os cabeçalhos. Nenhum valor será atribuído às colunas.","not_supported");
 const center=row.y;
 const adjacent=rows.map(r=>r.y).sort((a,b)=>a-b);
 const idx=adjacent.findIndex(y=>Math.abs(y-center)<.25);
 const top=idx>0?(adjacent[idx-1]+center)/2:center-22;
 const bottom=idx>=0&&idx<adjacent.length-1?(center+adjacent[idx+1])/2:center+22;
 const bounds=headers.map((h,i)=>({
   ...h,left:i===0?h.x-22:(h.x+headers[i-1].x)/2,
   right:i===headers.length-1?h.x+22:(h.x+headers[i+1].x)/2,
 }));
 const usageRuns=layer.runs.filter(r=>r.x>70&&r.x<headers[0].x-15&&
   compact(r.text)===compact(row.usage)&&Math.abs(centerY(r)-center)<3);
 const zoneRuns=layer.runs.filter(r=>
   compact(printedZone(r)??"")===compact(row.zone)&&r.x<headers[0].x-65&&
   row.zoneEvidenceY!==undefined &&
   Math.abs(centerY(r)-row.zoneEvidenceY)<0.75);
 const mapped:UrbanTableCell[]=URBAN_VISION_FIELDS.map(([key,label])=>{
   if(key==="zona"||key==="uso"){
     const runs=key==="zona"?zoneRuns:usageRuns;
     return {key,label,value:runs.length===1?(key==="zona"?printedZone(runs[0]):runs[0].text.trim()):null,
       status:runs.length===1?"source_text" as const:
         runs.length>1?"ambiguous" as const:"missing" as const,evidence:runs};
   }
   const col=bounds.find(x=>x.key===key);
   if(!col)return {key,label,value:null,status:"missing" as const,evidence:[]};
   const evidence=layer.runs.filter(r=>
     centerX(r)>=col.left&&centerX(r)<col.right&&
     centerY(r)>top&&centerY(r)<bottom&&r.text.trim().length>0)
     .sort((a,b)=>Math.abs(a.y-b.y)<3?a.x-b.x:a.y-b.y);
   const raw=evidence.map(r=>r.text.trim()).join(" ").trim();
   if(key==="gabarito"){
     return {key,label,value:raw&&raw.length<=140?raw:null,
       status:raw&&raw.length<=140?"source_text" as const:
         raw?"ambiguous" as const:"missing" as const,evidence};
   }
   const value=evidence.length===1&&NUMBER.test(raw)?raw:null;
   return {key,label,value,status:value?"source_text" as const:
     evidence.length?"ambiguous" as const:"missing" as const,evidence};
 });
 const recognized=mapped.filter(c=>c.status==="source_text").length;
 return {status:"read",reason:recognized===13
   ?"13 valores localizados pelas coordenadas desta linha; confira cada um no PDF."
   :"Somente "+recognized+"/13 células puderam ser vinculadas às colunas. Restantes pendentes.",
   page:layer.page,row,cells:mapped,recognized};
}
