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

/**
 * Read the actual /Pages /Kids tree, not the physical order of PDF objects.
 * A page's dictionary may occur anywhere in the file; treating object order
 * as pagination produces false citations and potentially wrong setbacks.
 * Ambiguous / object-stream page trees fail closed instead of guessing.
 */
function orderedPageObjects(objects:Map<number,string>):string[]{
  const catalogs=[...objects.values()].filter(x=>/\/Type\s*\/Catalog\b/.test(x));
  if(catalogs.length!==1)throw new Error("PDF_NATIVE_PAGE_COUNT");
  const root=/\/Pages\s+(\d{1,8})\s+\d{1,5}\s+R\b/.exec(catalogs[0]);
  if(!root)throw new Error("PDF_NATIVE_PAGE_COUNT");
  const visited=new Set<number>();
  const walk=(id:number,depth:number):number[]=>{
    if(depth>16||visited.has(id))throw new Error("PDF_NATIVE_PAGE_COUNT");
    visited.add(id);
    const obj=objects.get(id);
    if(!obj)throw new Error("PDF_NATIVE_PAGE_COUNT");
    if(/\/Type\s*\/Page\b/.test(obj))return [id];
    if(!/\/Type\s*\/Pages\b/.test(obj))throw new Error("PDF_NATIVE_PAGE_COUNT");
    const kids=/\/Kids\s*\[([^\]]{1,12000})\]/.exec(obj);
    const count=/\/Count\s+(\d{1,5})\b/.exec(obj);
    if(!kids||!count)throw new Error("PDF_NATIVE_PAGE_COUNT");
    const refs=[...kids[1].matchAll(/(\d{1,8})\s+\d{1,5}\s+R\b/g)].map(x=>Number(x[1]));
    if(!refs.length||refs.length>MAX_PAGES)throw new Error("PDF_NATIVE_PAGE_COUNT");
    const pages=refs.flatMap(child=>walk(child,depth+1));
    if(pages.length!==Number(count[1])||pages.length>MAX_PAGES)
      throw new Error("PDF_NATIVE_PAGE_COUNT");
    return pages;
  };
  const ordered=walk(Number(root[1]),0);
  const physical=[...objects.values()].filter(x=>/\/Type\s*\/Page\b/.test(x));
  if(ordered.length!==physical.length||!ordered.length||ordered.length>MAX_PAGES)
    throw new Error("PDF_NATIVE_PAGE_COUNT");
  return ordered.map(id=>objects.get(id)!);
}

/**
 * A PDF literal and an ASCII/UTF-16BE hexadecimal string are both valid text
 * operands. Arbitrary font-glyph codes are not converted without ToUnicode:
 * returning an empty string is safer than inventing numbers from glyph IDs.
 */
function decodeHexPdfString(raw:string):string{
  const hex=raw.replace(/\s+/g,"");
  if(!hex||hex.length>2000||hex.length%2!==0||!/^[0-9a-f]+$/i.test(hex))return "";
  const bytes=Buffer.from(hex,"hex");
  if(bytes[0]===0xfe&&bytes[1]===0xff){
    if((bytes.length-2)%2!==0)return "";
    let decoded="";
    for(let i=2;i<bytes.length;i+=2){
      const c=(bytes[i]<<8)|bytes[i+1];
      if(c<32||c>=0xd800&&c<=0xdfff)return "";
      decoded+=String.fromCharCode(c);
    }
    return decoded.trim().slice(0,500);
  }
  if(bytes.some(x=>x<32||x===127))return "";
  return bytes.toString("latin1").trim().slice(0,500);
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
  const pageSources=orderedPageObjects(objects);
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
        for(const m of textBlock[1].matchAll(/(?:\(((?:\\.|[^\\)])*)\)|<([A-Fa-f0-9\s]{2,2000})>)\s*Tj\b/g)){
          const value=m[1]!==undefined?decodePdfString(m[1]):decodeHexPdfString(m[2]);
          if(value)lines.push(value);
        }
        for(const m of textBlock[1].matchAll(/\[([\s\S]*?)\]\s*TJ\b/g)){
          const parts=[...m[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([A-Fa-f0-9\s]{2,2000})>/g)]
            .map(part=>part[1]!==undefined?decodePdfString(part[1]):decodeHexPdfString(part[2]));
          if(parts.length&&parts.every(Boolean)){
            const value=parts.join("").trim();
            if(value)lines.push(value.slice(0,500));
          }
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
  // Brazilian PDFs use dot for thousands and comma for decimals.
  // Never interpret "1.200 m²" as 1.2 m².
  if(!/^\d{1,6}(?:[,.]\d{1,3})?$/.test(value)&&
     !/^\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?$/.test(value))return null;
  const normalized=/^\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?$/.test(value)
    ?value.replace(/\./g,"").replace(",","."):value.replace(",",".");
  const n=Number(normalized);
  return Number.isFinite(n)&&n>=0&&n<=100000?n:null;
}
const patterns:Array<{metric:string;pattern:RegExp}>=[
  {metric:"front_setback_m",pattern:/\brecuo\s+frontal(?:\s+proposto)?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"side_setback_m",pattern:/\brecuo\s+lateral(?:\s+(?:esq\.?|esquerdo|dir\.?|direito))?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"rear_setback_m",pattern:/\brecuo\s+(?:de\s+)?fundos(?:\s+proposto)?\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  {metric:"lot_area_m2",pattern:/\barea\s+(?:do\s+)?(?:terreno|lote)\s*:\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d{1,6}(?:[,.]\d{1,3})?)\s*m\s*2\b/},
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
  // A real site plan may declare only one setback; missing measurements must
  // remain null rather than making an evidenced front setback unusable.
  const hasSitePlan=documentType==="architectural_plan"&&sitePage!==undefined&&
    candidates.some(item=>item.page===sitePage&&
      ["front_setback_m","side_setback_m","rear_setback_m"].includes(item.metric));
  // Nem todas as 11 chaves do confronto urbanistico sao dados da planta.
  // Em especial "CA minimo" e limite legal e NAO deve ser lido ou inferido
  // do desenho; so um CA observado explicitamente declarado e candidato.
  // Auxiliary project declarations are useful to the analyst but must never
  // be fed into the eleven statutory-limit fields or treated as legal proof.
  const extras:Array<{
    kind:"built_area_m2"|"uncovered_area_m2"|"side_left_m"|"side_right_m";
    label:string;value:number;unit:"m"|"m²";page:number;quote:string;
  }>=[];
  const extraPatterns=[
    {kind:"built_area_m2" as const,label:"Area edificada declarada",unit:"m²" as const,
      pattern:/\barea\s+construida(?:\s+declarada)?\s*:\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d{1,6}(?:[,.]\d{1,3})?)\s*m\s*2\b/},
    {kind:"uncovered_area_m2" as const,label:"Area descoberta declarada",unit:"m²" as const,
      pattern:/\barea\s+descoberta\s*:\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d{1,6}(?:[,.]\d{1,3})?)\s*m\s*2\b/},
    {kind:"side_left_m" as const,label:"Recuo lateral esquerdo declarado",unit:"m" as const,
      pattern:/\brecuo\s+lateral\s+(?:esq\.?|esquerdo)\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
    {kind:"side_right_m" as const,label:"Recuo lateral direito declarado",unit:"m" as const,
      pattern:/\brecuo\s+lateral\s+(?:dir\.?|direito)\s*:\s*(\d{1,5}(?:[,.]\d{1,3})?)\s*m\b/},
  ];
  for(const spec of extraPatterns){
    const found=lines.map(line=>{
      const hit=spec.pattern.exec(line.text);
      const value=hit?parseNumber(hit[1]):null;
      return value===null?null:{...spec,value,page:line.page,quote:line.quote};
    }).filter((x):x is NonNullable<typeof x>=>x!==null);
    // Duplicates with the same value are okay. Contradictions remain blank.
    if(new Set(found.map(x=>x.value.toFixed(3))).size>1){
      warnings.push("Valor auxiliar conflitante: "+spec.label+". Revisar no PDF original.");
      continue;
    }
    if(found[0])extras.push({
      kind:spec.kind,label:spec.label,unit:spec.unit,value:found[0].value,
      page:found[0].page,quote:found[0].quote,
    });
  }
  const output=normalizeArchitecturalPdfExtraction({
    document_type:documentType,
    has_site_plan:hasSitePlan,
    warnings,metrics:candidates,
  });
  return {
    ...output,source:"pdf_text_local",automaticallyApproved:false,
    supplementaryFacts:extras,
    textCoverage:{
      pagesRead:pages.length,
      pagesWithText:pages.filter(page=>page.lines.length>0).map(page=>page.number),
      pagesWithoutText:pages.filter(page=>page.lines.length===0).map(page=>page.number),
    },
  };
}
