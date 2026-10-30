/**
 * SIGAPRO — reconciliação CONSERVADORA de OCR com o Quadro I original.
 * Não lê legislação vigente, não valida zona em mapa e jamais autoriza regras.
 * Apenas nomes explícitos de coluna (ex.: "C.A. mínimo: 0,05") contam como evidência.
 */
export type OcrOriginalRow = {
  pagina_pdf:number;
  zona_conforme_tabela:string;
  uso_predominante_conforme_tabela:string;
  ca_minimo_original:string|null;
  ca_basico_original:string;
  ca_maximo_original:string;
  taxa_ocupacao_maxima_pct:number;
  taxa_permeabilidade_minima_pct:number;
  lote_minimo_m2:number;
  testada_minima_m:number;
  gabarito_original:string;
  recuo_frontal_m:number;
  recuo_fundos_m:number;
  recuo_lateral_m:number|string;
};
export type OcrFieldStatus="match"|"divergent"|"missing"|"ambiguous"|"unreadable";
export type OcrFieldCheck={key:string;label:string;expected:string;read:string|null;status:OcrFieldStatus;sourceLine:string|null};
export type OcrScopeCheck={label:string;expected:string;read:string|null;status:OcrFieldStatus};
export type OcrReconciliation={fields:OcrFieldCheck[];scope:OcrScopeCheck[];complete:boolean;matches:number;unresolved:number;warnings:string[]};

const specs = [
  ["ca_minimo_original","C.A. mínimo",["c a minimo","ca minimo","coeficiente de aproveitamento minimo"]],
  ["ca_basico_original","C.A. básico",["c a basico","ca basico","coeficiente de aproveitamento basico"]],
  ["ca_maximo_original","C.A. máximo",["c a maximo","ca maximo","coeficiente de aproveitamento maximo"]],
  ["taxa_ocupacao_maxima_pct","Ocupação máxima",["taxa de ocupacao maxima","ocupacao maxima","ocupacao max"]],
  ["taxa_permeabilidade_minima_pct","Permeabilidade mínima",["taxa de permeabilidade minima","permeabilidade minima","permeabilidade min"]],
  ["lote_minimo_m2","Lote mínimo",["lote minimo","area minima do lote"]],
  ["testada_minima_m","Testada mínima",["testada minima","testada min"]],
  ["gabarito_original","Gabarito",["gabarito","gabarito altura maxima","gabarito altura"]],
  ["recuo_frontal_m","Recuo frontal",["recuo frontal","recuo minimo frontal","frente recuo"]],
  ["recuo_fundos_m","Recuo de fundos",["recuo de fundos","recuo fundos","recuo posterior","fundos recuo"]],
  ["recuo_lateral_m","Recuo lateral",["recuo lateral","recuo minimo lateral","lateral recuo"]],
] as const;

const fold=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const scopeFold=(value:string)=>fold(value).replace(/\s+/g,"");

/** Accept only a complete literal numeric cell. Never take the first number of a line. */
function cellNumber(value:string):number|null {
  const match=/^\s*(\d+(?:[,.]\d{1,3})?)\s*(?:%|m²|m2|m|metros?)?\s*$/i.exec(value);
  if(!match)return null;
  const valueText=match[1];
  // A 3-digit group after a single period can mean either thousands or decimal.
  // Reject ambiguous strings instead of assuming a unit or decimal placement.
  if(/^\d{1,3}\.\d{3}$/.test(valueText))return null;
  const n=Number(valueText.replace(",","."));
  return Number.isFinite(n)&&n>=0?n:null;
}
function sameValue(expected:string,read:string,key:string):boolean|null {
  if(key==="gabarito_original")return fold(expected)===fold(read);
  const a=cellNumber(expected),b=cellNumber(read);
  if(a===null||b===null)return null;
  return Math.abs(a-b)<1e-9;
}
type CandidateLine={label:string;read:string;line:string};
function parseLines(text:string) {
  const entries:CandidateLine[]=[];
  for(const original of text.slice(0,6000).split(/\r?\n/).slice(0,90)) {
    const line=original.trim().replace(/[\t ]+/g," ");
    const parts=/^(.{2,80}?)\s*[:=]\s*(.{1,180})$/.exec(line);
    if(parts)entries.push({label:fold(parts[1]),read:parts[2].trim(),line});
  }
  return entries;
}
function checkScope(label:string,expected:string,keys:string[],entries:CandidateLine[]):OcrScopeCheck {
  const hits=entries.filter(x=>keys.includes(x.label));
  if(hits.length===0)return {label,expected,read:null,status:"missing"};
  if(hits.length!==1)return {label,expected,read:null,status:"ambiguous"};
  const read=hits[0].read;
  const status=read.includes("[ILEGÍVEL]")?"unreadable":scopeFold(read)===scopeFold(expected)?"match":"divergent";
  return {label,expected,read,status};
}
export function reconcileUrbanOcr(text:string,row:OcrOriginalRow):OcrReconciliation {
  const entries=parseLines(text);
  const scope=[
    checkScope("Zona",row.zona_conforme_tabela,["zona","codigo da zona","zona validada"],entries),
    checkScope("Uso",row.uso_predominante_conforme_tabela,["uso","uso predominante","categoria de uso"],entries),
  ];
  const unqualifiedCa=entries.some(x=>["ca","c a","coeficiente de aproveitamento"].includes(x.label));
  const fields:OcrFieldCheck[]=specs.map(([key,label,aliases])=>{
    const expected=String(row[key as keyof OcrOriginalRow]??"A CONFERIR");
    const found=entries.filter(x=>(aliases as readonly string[]).includes(x.label));
    if(found.length===0)return {key,label,expected,read:null,sourceLine:null,
      status:(key.startsWith("ca_")&&unqualifiedCa?"ambiguous":"missing") as OcrFieldStatus};
    if(found.length!==1)return {key,label,expected,read:null,sourceLine:null,status:"ambiguous" as OcrFieldStatus};
    const {read,line}=found[0];
    const result=sameValue(expected,read,key);
    const status:OcrFieldStatus=/\[\s*ILEG[IÍ]VEL\s*\]/i.test(read)?"unreadable"
      :result===null?"ambiguous":result?"match":"divergent";
    return {key,label,expected,read,sourceLine:line,status};
  });
  const total=[...fields,...scope];
  const matches=total.filter(x=>x.status==="match").length;
  const warnings:string[]=[];
  if(unqualifiedCa) warnings.push("C.A. sem identificação de mínimo, básico ou máximo: não deslocar números por posição.");
  if(scope.some(x=>x.status!=="match"))warnings.push("Zona e uso não foram identificados exatamente na transcrição.");
  if(fields.some(x=>x.status==="divergent"))warnings.push("Há valores diferentes da matriz histórica; conferir no PDF, sem substituir automaticamente.");
  if(fields.some(x=>x.status==="missing"||x.status==="unreadable"||x.status==="ambiguous"))
    warnings.push("Há colunas não identificadas ou ilegíveis. Não atribua números pela ordem em que aparecem.");
  return {fields,scope,complete:matches===total.length,matches,unresolved:total.length-matches,warnings};
}
