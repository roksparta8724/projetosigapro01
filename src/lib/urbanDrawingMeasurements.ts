/**
 * Conservative suggestions from the SELECTABLE text layer of a submitted plan.
 * No geometric inference, OCR, area calculation or legal compliance conclusion.
 */
import type { UrbanMetric } from "@/lib/urbanPrecheck";
import type { UrbanAreaKey } from "@/lib/urbanPrecheckAssist";

export type UrbanDrawingTarget = UrbanMetric | UrbanAreaKey;
export type UrbanDrawingSuggestion = {
  id: string;
  target: UrbanDrawingTarget;
  label: string;
  value: number;
  unit: "m" | "m²" | "%" | "" | "pav.";
  page: number;
  excerpt: string;
};

const specs: ReadonlyArray<{
  target: UrbanDrawingTarget; label: string; pattern: RegExp;
  unit: UrbanDrawingSuggestion["unit"]; maximum: number;
}> = [
  {target:"front_setback_m",label:"Recuo frontal",pattern:/\b(?:recuo|afastamento)\s+frontal\b/gi,unit:"m",maximum:1000},
  {target:"side_setback_m",label:"Recuo lateral",pattern:/\b(?:recuo|afastamento)\s+lateral\b/gi,unit:"m",maximum:1000},
  {target:"rear_setback_m",label:"Recuo de fundos",pattern:/\b(?:recuo|afastamento)\s+(?:de\s+)?fundos?\b/gi,unit:"m",maximum:1000},
  {target:"height_m",label:"Altura da edificação",pattern:/\baltura\s+(?:da\s+edifica[cç][aã]o|constru[ií]da)\b/gi,unit:"m",maximum:1000},
  {target:"floor_count",label:"Quantidade de pavimentos",pattern:/\b(?:n[uú]mero\s+de|quantidade\s+de)\s+pavimentos\b/gi,unit:"pav.",maximum:300},
  {target:"lot",label:"Área do terreno",pattern:/\b[aá]rea\s+(?:do\s+)?(?:terreno|lote)\b/gi,unit:"m²",maximum:10000000},
  {target:"footprint",label:"Projeção da edificação",pattern:/\b(?:[aá]rea\s+de\s+)?proje[cç][aã]o\s+(?:da\s+edifica[cç][aã]o|constru[ií]da)\b/gi,unit:"m²",maximum:10000000},
  {target:"permeable",label:"Área permeável",pattern:/\b[aá]rea\s+perme[aá]vel\b/gi,unit:"m²",maximum:10000000},
  {target:"totalFloor",label:"Área construída computável",pattern:/\b[aá]rea\s+constru[ií]da\s+comput[aá]vel\b/gi,unit:"m²",maximum:10000000},
  {target:"occupancy_percent",label:"Taxa de ocupação",pattern:/\btaxa\s+de\s+ocupa[cç][aã]o\b/gi,unit:"%",maximum:100},
  {target:"permeability_percent",label:"Taxa de permeabilidade",pattern:/\btaxa\s+de\s+permeabilidade\b/gi,unit:"%",maximum:100},
  {target:"floor_area_ratio",label:"Coeficiente de aproveitamento",pattern:/\bcoeficiente\s+de\s+aproveitamento\b/gi,unit:"",maximum:100},
];

const clean = (value:string) => value.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
const normative = /\b(?:m[ií]nim[oa]|m[aá]xim[oa]|permitid[oa]|exigid[oa]|obrigat[oó]ri[oa]|limite|lei|decreto|artigo|art\.|norma|conforme|regulamento|previst[oa])\b/i;

function normalizeUnit(text:string): UrbanDrawingSuggestion["unit"] | null {
  const value = text.toLowerCase().trim();
  if (value === "%" ) return "%";
  if (/^m(?:etro)?s?$/.test(value)) return "m";
  if (/^(?:m²|m2|metros?\s+quadrados?)$/.test(value)) return "m²";
  if (/^pav(?:imentos?)?\.?$/.test(value)) return "pav.";
  if (!value) return "";
  return null;
}

/**
 * A candidate MUST have an explicit label and numeric value close together.
 * Missing units, normative words and page numbers alone never become readings.
 */
export function findUrbanDrawingMeasurements(
  pages: ReadonlyArray<{page:number;text:string}>,
): UrbanDrawingSuggestion[] {
  const out: UrbanDrawingSuggestion[]=[];
  const dedup=new Set<string>();
  for(const page of pages.slice(0,24)){
    if(!Number.isInteger(page.page) || page.page<1) continue;
    const text=String(page.text||"").slice(0,3000);
    for(const spec of specs){
      for(const match of text.matchAll(spec.pattern)){
        const index=match.index;
        if(index===undefined) continue;
        const surrounding=clean(text.slice(Math.max(0,index-38),Math.min(text.length,index+match[0].length+95)));
        const prior=clean(text.slice(Math.max(0,index-38),index));
        const after=text.slice(index+match[0].length,index+match[0].length+70);
        if(normative.test(prior) || normative.test(after)) continue;
        const captures=after.match(/^\s*(?:[:=]\s*|de\s+)?(\d{1,7}(?:[.,]\d{1,3})?)\s*(m²|m2|metros?\s+quadrados?|metros?|m|%|pavimentos?|pav\.?)?/i);
        if(!captures) continue;
        const parsed=Number(captures[1].replace(",","."));
        const unit=normalizeUnit(captures[2]||"");
        if(unit===null) continue;
        const exactUnit=spec.unit==="pav." ? (unit==="pav."||unit==="") :
          spec.unit==="" ? unit==="" : unit===spec.unit;
        if(!exactUnit || !Number.isFinite(parsed) || parsed<=0 || parsed>spec.maximum ||
            (spec.unit==="pav." && !Number.isInteger(parsed))) continue;
        const final=after.slice(captures[0].length);
        if(/^[\p{L}\p{N}.,%²]/u.test(final)) continue; // Never read a numeric/unit prefix.
        const key=spec.target+"|"+page.page+"|"+parsed;
        if(dedup.has(key)) continue;
        dedup.add(key);
        out.push({
          id:key,target:spec.target,label:spec.label,value:parsed,unit:spec.unit,
          page:page.page,excerpt:surrounding.slice(0,240),
        });
        if(out.length>=60) return out;
      }
    }
  }
  return out;
}
