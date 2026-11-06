/**
 * First-party, zero-external-request PDF text extraction.
 * This is NOT computer vision and it never establishes legal compliance.
 * Text is read from the actual PDF page content streams, with page provenance.
 * Unsupported/corrupt/encrypted/scanned PDFs fail closed; visual AI is separate.
 */
import { inflateSync } from "node:zlib";
import { normalizeArchitecturalPdfExtraction, type DrawingExtraction } from "../src/lib/architecturalPdfReadings.js";

const MAX_BYTES=8*1024*1024;
const MAX_PAGES=100;
const MAX_STREAM_BYTES=1024*1024;
const MAX_TOTAL_TEXT=180000;

type PdfPage={number:number;lines:string[]};
type Candidate={metric:string;value:number;page:number;quote:string;confidence:"high"};
function normalize(value:string){
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").trim();
}
function decodePdfString(value:string){
  const escaped=value.replace(/\\([0-7]{1,3}|[\s\S])/g,(_m:string,x:string)=>{
    if(/^[0-7]{1,3}$/.test(x))return String.fromCharCode(parseInt(x,8));
    return ({n:"\n",r:"\r",t:"\t",b:"\b",f:"\f"} as Record<string,string>)[x]??x;
  });
  // Simple 8-bit strings cover the V2 fixture and selectable Latin-based
  // drawings. Complex CID/ToUnicode fonts require a dedicated PDF library.
  return Array.from(escaped).filter(ch=>ch.charCodeAt(0)>=32).join("").trim().slice(0,500);
}
function contentStreams(pdf:Uint8Array):PdfPage[]{
  if(pdf.byteLength<100||pdf.byteLength>MAX_BYTES||
    Buffer.from(pdf.subarray(0,5)).toString("ascii")!=="%PDF-")
    throw new Error("PDF_NATIVE_INVALID");
  const raw=Buffer.from(pdf).toString("latin1");
  if(!raw.slice(-2048).includes("%%EOF"))throw new Error("PDF_NATIVE_INVALID");
  const objects=new Map<number,string>();
  const objectRegex=/(\d{1,8})\s+(\d{1,5})\s+obj\b([\s\S]*?)\bendobj\b/g;
  for(const item of raw.matchAll(objectRegex)){
    if(objects.size>10000)throw new Error("PDF_NATIVE_COMPLEX");
    if(!objects.has(Number(item[1])))objects.set(Number(item[1]),item[3]);
  }
  const pageSources=[...objects.values()].filter(x=>/\/Type\s*\/Page\b/.test(x));
  if(pageSources.length<1||pageSources.length>MAX_PAGES)
    throw new Error("PDF_NATIVE_PAGE_COUNT");
  const pages:PdfPage[]=[];
  let total=0;
  for(const [index,pageObject] of pageSources.entries()){
    const contentEntry=/\/Contents\s*(\[[^\]]{1,250}\]|\d+\s+\d+\s+R)/.exec(pageObject);
    if(!contentEntry){pages.push({number:index+1,lines:[]});continue;}
    const refs=[...contentEntry[1].matchAll(/(\d{1,8})\s+\d+\s+R/g)].map(m=>Number(m[1]));
    const lines:string[]=[];
    for(const ref of refs.slice(0,16)){
      const obj=objects.get(ref);
      if(!obj)continue;
      const match=/\bstream\r?\n([\s\S]*?)\r?\nendstream\b/.exec(obj);
      if(!match)continue;
      let payload=Buffer.from(match[1],"latin1");
      if(/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(obj.split("stream")[0])){
        try{payload=inflateSync(payload,{maxOutputLength:MAX_STREAM_BYTES});}
        catch{throw new Error("PDF_NATIVE_UNSUPPORTED_ENCODING");}
      }else if(/\/Filter\b/.test(obj.split("stream")[0])){
        throw new Error("PDF_NATIVE_UNSUPPORTED_ENCODING");
      }
      if(payload.length>MAX_STREAM_BYTES)throw new Error("PDF_NATIVE_COMPLEX");
      const code=payload.toString("latin1");
      // Look only inside PDF text objects; never parse image bytes, comments
      // or page metadata as alleged measurements.
      for(const textBlock of code.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)){
        for(const m of textBlock[1].matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj\b/g)){
          const text=decodePdfString(m[1]);if(text)lines.push(text);
        }
        for(const m of textBlock[1].matchAll(/\[((?:[^\]]|\][^\s])*?)\]\s*TJ\b/g)){
          const parts=[...m[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)]
            .map(part=>decodePdfString(part[1]));
          if(parts.length){const text=parts.join("").trim();if(text)lines.push(text.slice(0,500));}
        }
      }
    }
    total+=lines.reduce((n,l)=>n+l.length,0);
    if(total>MAX_TOTAL_TEXT)throw new Error("PDF_NATIVE_COMPLEX");
    pages.push({number:index+1,lines});
  }
  return pages;
}
function parseNumber(value:string):number|null{
  if(!/^\d{1,5}(?:[,.]\d{1,3})?$/.test(value))return null;
  const n=Number(value.replace(",","."));return Number.isFinite(n)?n:null;
}
const patterns:Array<{metric:string;pattern:RegExp}>=[
  {metric:"front_setback_m",pattern:/\brecuo\s+frontal(?:\s+proposto)?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"side_setback_m",pattern:/\brecuo\s+lateral(?:\s+(?:esq\.?|esquerdo|dir\.?|direito))?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"rear_setback_m",pattern:/\brecuo\s+(?:de\s+)?fundos(?:\s+proposto)?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"lot_area_m2",pattern:/\barea\s+(?:do\s+)?(?:terreno|lote)\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\s*2\b/},
  {metric:"occupancy_percent",pattern:/\btaxa\s+(?:de\s+)?ocupacao(?:\s+(?:geometrica|calculada))?\s*:\s*(\d{1,3}(?:[,.]\d{1,3})?)\s*%/},
  // O projeto QA04 declara pavimentos na prancha 1; antes o leitor ignorava
  // completamente esse campo apesar de existir em URBAN_METRICS.
  {metric:"floor_count",pattern:/\b(?:numero\s+de\s+)?pavimentos?\s*:\s*0*(\d{1,3})\b/},
  {metric:"permeability_percent",pattern:/\b(?:taxa\s+(?:de\s+)?)?permeabilidade(?:\s+(?:declarada|calculada))?\s*:\s*(\d{1,3}(?:[,.]\d{1,3})?)\s*%/},
  {metric:"lot_frontage_m",pattern:/\b(?:testada(?:\s+(?:do\s+)?lote)?|largura\s+do\s+lote|frente\s+do\s+lote)\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"height_m",pattern:/\b(?:altura(?:\s+(?:total\s+)?(?:da\s+)?edificacao)?|gabarito)\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"floor_area_ratio",pattern:/\b(?:ca|coeficiente\s+de\s+aproveitamento)(?:\s+(?:do\s+projeto|proposto))?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\b/},

];
export function extractNativeArchitecturalPdf(pdf:Uint8Array):DrawingExtraction {
  const pages=contentStreams(pdf);
  const lines=pages.flatMap(page=>page.lines.map(quote=>({
    page:page.number,quote,text:normalize(quote),
  })));
  const sitePage=pages.find(page=>page.lines.some(line=>
    /\bplanta\s+de\s+implantacao\b/.test(normalize(line))))?.number;
  const documentType=lines.some(line=>
    /projeto\s+(?:arquitetonico|residencial)|planta\s+de\s+implantacao/.test(line.text))
    ?"architectural_plan":"uncertain";
  const candidates:Candidate[]=[];
  const warnings=[
    "Leitura local do texto selecionável do PDF, sem transmissão a serviços externos.",
    "Desenhos, cotas sem texto e geometria CAD não foram inspecionados visualmente.",
    "Conformidade com zoneamento e legislação municipal não foi avaliada.",
  ];
  for(const {metric,pattern} of patterns){
    const hits:Candidate[]=[];
    for(const row of lines){
      const match=pattern.exec(row.text);
      const number=match?parseNumber(match[1]):null;
      if(number!==null)hits.push({metric,value:number,page:row.page,
        quote:row.quote,confidence:"high"});
    }
    // Duplicate labels with the same value are okay, but contradictory
    // measurements must NEVER be resolved by silently choosing one.
    const unique=[...new Set(hits.map(item=>item.value.toFixed(3)))];
    if(unique.length>1){
      warnings.push("Cotas conflitantes para "+metric+"; conferência manual obrigatória.");
      continue;
    }
    if(hits.length){
      const page2=sitePage?hits.find(item=>item.page===sitePage):null;
      candidates.push(page2||hits[0]);
    }
  }
  if(!lines.length)warnings.push(
    "Nenhuma camada de texto recuperável. Use análise visual com autorização do prestador.");
  const hasSitePlan=documentType==="architectural_plan"&&sitePage!==undefined&&
    candidates.some(item=>item.page===sitePage&&item.metric==="front_setback_m")&&
    candidates.some(item=>item.page===sitePage&&item.metric==="rear_setback_m");
  // Nem todas as 11 chaves do confronto urbanistico sao dados da planta.
  // Em especial "CA minimo" e limite legal e NAO deve ser lido ou inferido
  // do desenho; so um CA observado explicitamente declarado e candidato.
  const output=normalizeArchitecturalPdfExtraction({
    document_type:documentType,
    has_site_plan:hasSitePlan,
    warnings,metrics:candidates,
  });
  return {
    ...output,source:"pdf_text_local",automaticallyApproved:false,
    textCoverage:{
      pagesRead:pages.length,
      pagesWithText:pages.filter(page=>page.lines.length>0).map(page=>page.number),
      pagesWithoutText:pages.filter(page=>page.lines.length===0).map(page=>page.number),
    },
  };
}
