/**
 * QA-only word-coordinate evidence extracted from the ORIGINAL scanned text-
 * layer of LC 379/2009, Quadro I, physical PDF page 36.
 * This is a reproducible source observation for one tested document/tenant,
 * NOT a municipality-wide parser, applicable law, or approved zoning rule.
 * Every value was read from PDF word bounding boxes; images/other PDFs do not
 * qualify, even when their names or displayed zones are identical.
 */
import { URBAN_VISION_FIELDS, type UrbanVisionFieldKey } from "./urbanVisionStructured";
import { compareUrbanVisionDrafts } from "./urbanVisionDiagnostic";
export const QA_SOURCE_SHA="68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1";
export const QA_SOURCE_MUNICIPALITY="49dac0b6-6352-4744-9aab-9ff91c59d970";
export type PdfSourceCell={raw:string;rects:readonly (readonly number[])[]};
const PAGE36_CELLS:Readonly<Record<UrbanVisionFieldKey,PdfSourceCell>>={
  zona:{raw:"ZONA ZM-B(e)",rects:[[36.4,192.6,58.6,202.9],[60.9,192.6,90.3,202.9]]},
  uso:{raw:"comercial",rects:[[108.4,185.1,145,196.4]]},
  ca_minimo:{raw:"0,05",rects:[[165.5,185.4,180.6,196.2]]},
  ca_basico:{raw:"0,5",rects:[[206.3,185.9,217.1,196.7]]},
  ca_maximo:{raw:"1",rects:[[251.2,185.4,255.3,196.2]]},
  ocupacao_maxima:{raw:"50",rects:[[294.1,185.4,302.6,196.2]]},
  permeabilidade_minima:{raw:"70",rects:[[354.1,184.7,363,196.4]]},
  lote_minimo:{raw:"3000",rects:[[409.8,183.5,427.4,196.1]]},
  testada_minima:{raw:"30",rects:[[461.7,185.4,470.6,196.2]]},
  gabarito:{raw:"largura da via da testada+ recuo",rects:[[497.7,175.1,524.2,186.8],[527,175.1,535.7,186.8],[538.5,175.1,549.2,186.8],[500.1,185.2,509,195.7],[511.6,185.2,546.3,195.7],[512.6,193.6,533.8,206.2]]},
  recuo_frontal:{raw:"10",rects:[[568,184.9,576.8,196.3]]},
  recuo_fundos:{raw:"8",rects:[[604.2,185.4,608.2,196.2]]},
  recuo_lateral:{raw:"5",rects:[[642.6,185.4,646.7,196.2]]},
};
export type PdfSourceEvidence={readonly sha256:string;readonly page:number;
  readonly zone:string;readonly usage:string;readonly cells:Readonly<Record<UrbanVisionFieldKey,PdfSourceCell>>;};
export function getQaPdfTextEvidence(args:{
  municipalityId:string;verifiedPackageSha:string|undefined;
  page:number;zone:string;usage:string;originalScopeMatches:boolean;
}):PdfSourceEvidence|null{
  const canonical=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/\s+/g,"").trim();
  if(args.municipalityId!==QA_SOURCE_MUNICIPALITY
    ||args.verifiedPackageSha!==QA_SOURCE_SHA
    ||args.page!==36||!args.originalScopeMatches
    ||canonical(args.zone)!=="ZM-B(E)"||canonical(args.usage)!=="COMERCIAL")return null;
  return {sha256:QA_SOURCE_SHA,page:36,zone:"ZM-B(e)",usage:"comercial",cells:PAGE36_CELLS};
}
export function compareQaSourceTextToVision(
  evidence:PdfSourceEvidence,visionDraft:string
){
  const text=URBAN_VISION_FIELDS.map(([key,label])=>label+": "+evidence.cells[key].raw).join("\n");
  const compare=compareUrbanVisionDrafts(text,visionDraft);
  const canon=(raw:string,key:UrbanVisionFieldKey)=>{
    const reduced=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .trim().toLowerCase().replace(/\s+/g," ");
    if(key==="zona")return reduced.replace(/^zona\s+/,"").replace(/\s+/g,"");
    if(key==="gabarito")return reduced.replace(/\s*\+\s*/g,"+");
    return reduced.replace(/^(\d+),(\d+)$/,"$1.$2").replace(/\s+/g,"");
  };
  return compare.map(c=>{
    const source=c.primary;
    const read=c.expert;
    return {...c,source,read,verdict:source&&read
      ?canon(source,c.key)===canon(read,c.key)?"text_match" as const:"text_conflict" as const
      :read?"unmatched" as const:"unreadable" as const};
  });
}
