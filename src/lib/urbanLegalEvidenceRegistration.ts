import {normalizeUrbanCode,type UrbanRegulationVersion,type UrbanMetric} from "./urbanPrecheck";

export type UrbanEvidenceMethod="text_layer_verified"|"visual_double_transcription";
const realDate=(value:string):boolean=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
};
/** Blocks composite / partly read zones before presenting a human confirmation. */
export function isSingleUrbanZone(raw:string):boolean{
 const zone=normalizeUrbanCode(raw);
 return zone.length<=40&&/^[A-Z0-9][A-Z0-9._/-]{0,39}(\([A-Z0-9]{1,12}\))?$/.test(zone);
}
export function normalizeLegalExcerpt(value:string):string{
 return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
}
export function verifyUrbanEvidenceInput(args:{
 version:UrbanRegulationVersion|null;municipalityId:string;metric:UrbanMetric|"";
 filename:string;fileSize:number;page:number;excerpt:string;repeatExcerpt:string;
 method:UrbanEvidenceMethod|"";from:string;until:string;confirmed:boolean;
 textLayer?:string;
}):string|null{
 const v=args.version;
 if(!v||v.municipality_id!==args.municipalityId||!["active","draft"].includes(v.status)||
   !isSingleUrbanZone(v.zone_code)||!v.rules.some(rule=>rule.metric===args.metric))
   return "Escolha uma regra real de uma zona individual e um índice dessa mesma versão.";
 if(!args.filename.toLowerCase().endsWith(".pdf")||args.fileSize<5||args.fileSize>100*1024*1024)
   return "Selecione o PDF oficial (máximo 100 MB).";
 if(!Number.isSafeInteger(args.page)||args.page<1||args.page>10000)
   return "Informe a página física do PDF, não o número impresso na lei.";
 if(args.excerpt.trim().length<15||args.excerpt.length>500)
   return "O trecho da norma precisa ter entre 15 e 500 caracteres.";
 if(args.method!=="text_layer_verified"&&args.method!=="visual_double_transcription")
   return "Escolha como a página oficial foi conferida.";
 if(args.method==="visual_double_transcription" &&
   args.repeatExcerpt.trim()!==args.excerpt.trim())
   return "Repita exatamente o trecho da imagem original para confirmação.";
 if(args.method==="text_layer_verified"&&typeof args.textLayer==="string"&&
   !normalizeLegalExcerpt(args.textLayer).includes(normalizeLegalExcerpt(args.excerpt)))
   return "O trecho não corresponde à camada textual desta página. Use a conferência visual com dupla transcrição.";
 if(!realDate(args.from)||(args.until&&(!realDate(args.until)||args.until<args.from)))
   return "Informe datas civis válidas para a vigência da evidência.";
 if(!args.confirmed)return "Confira a lei, o artigo, a página e as alterações antes de declarar a evidência.";
 return null;
}
