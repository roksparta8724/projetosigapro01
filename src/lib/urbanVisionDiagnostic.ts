import { URBAN_VISION_FIELDS, type UrbanVisionFieldKey } from "./urbanVisionStructured";

export type UrbanDiagnosticVerdict="agree"|"conflict"|"one_model_only"|"not_read";
export type UrbanDiagnosticRow={
 key:UrbanVisionFieldKey;label:string;primary:string|null;expert:string|null;
 verdict:UrbanDiagnosticVerdict;
};
function parseDraft(text:string):Map<string,string>{
 const result=new Map<string,string>();
 const allowed=new Map<string,string>(URBAN_VISION_FIELDS.map(([key,label])=>[label.toLocaleLowerCase("pt-BR"),key]));
 for(const line of text.split(/\r?\n/)){
  const index=line.indexOf(":");
  if(index<0)continue;
  const key=allowed.get(line.slice(0,index).trim().toLocaleLowerCase("pt-BR"));
  if(!key||result.has(key))continue;
  const value=line.slice(index+1).trim();
  if(value&&value!=="[ILEGÍVEL]"&&!/^null$/i.test(value))result.set(key,value);
 }
 return result;
}
function comparable(raw:string){
 const flat=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
   .replace(/\s+/g," ").trim();
 // Never round digits or infer units; only conservative lexical agreement.
 return /^\d+(?:[.,]\d+)?\s*(?:m2|m²|m|%)?$/.test(flat)
   ?flat.replace(",",".").replace(/\s+/g,""):flat;
}
export function compareUrbanVisionDrafts(primary:string,expert:string):UrbanDiagnosticRow[]{
 const a=parseDraft(primary),b=parseDraft(expert);
 return URBAN_VISION_FIELDS.map(([key,label])=>{
  const p=a.get(key)||null,e=b.get(key)||null;
  const verdict:UrbanDiagnosticVerdict=p&&e
    ?comparable(p)===comparable(e)?"agree":"conflict"
    :p||e?"one_model_only":"not_read";
  return {key,label,primary:p,expert:e,verdict};
 });
}
