/**
 * SIGAPRO / Mercado Pago boleto: real-world payer data must come from
 * authenticated municipal guide + a one-time checkout address form.
 * Never accept name or CPF/CNPJ supplied by a browser as bank identity.
 * Never record the payer object, email, address or document in logs.
 */
import type {StoredGuide} from "./guide-persistence.js";

export type BoletoPayerForm={
  email:string;
  street_name:string;
  street_number:string;
  zip_code:string;
  neighborhood:string;
  city:string;
  state:string;
};

function digits(value:unknown){return String(value||"").replace(/\D/g,"");}
function validCpf(s:string){
  if(!/^\d{11}$/.test(s)||/^(\d)\1+$/.test(s))return false;
  let sum=0;
  for(let i=0;i<9;i++)sum+=Number(s[i])*(10-i);
  const digit1=(sum*10)%11%10;
  if(digit1!==Number(s[9]))return false;
  sum=0;
  for(let i=0;i<10;i++)sum+=Number(s[i])*(11-i);
  return (sum*10)%11%10===Number(s[10]);
}
function validCnpj(s:string){
  if(!/^\d{14}$/.test(s)||/^(\d)\1+$/.test(s))return false;
  for(let len=12;len<=13;len++){
    let weight=len-7,sum=0;
    for(let i=0;i<len;i++){
      sum+=Number(s[i])*weight;
      weight=weight===2?9:weight-1;
    }
    const check=sum%11<2?0:11-sum%11;
    if(check!==Number(s[len]))return false;
  }
  return true;
}
function clean(value:unknown,max:number){
  if(typeof value!=="string")return "";
  const s=value.trim().replace(/\s+/g," ");
  return s.length<=max&&!/[<>]/.test(s)&&
    ![...s].some(char=>{const code=char.charCodeAt(0);return code<32||code===127;})
    ?s:"";
}
function payerDocumentFromGuide(guide:StoredGuide){
  const docs=[guide.owner_document_snapshot,guide.contribuinte_cpf]
    .map(digits).filter(Boolean);
  if(docs.length===0||docs.some(d=>d!==docs[0]))throw new Error("Documento do contribuinte divergente ou não cadastrado no Neon.");
  const doc=docs[0];
  if(!validCpf(doc)&&!validCnpj(doc))
    throw new Error("CPF ou CNPJ do contribuinte precisa ser válido antes de emitir boleto real.");
  return {type:doc.length===11?"CPF":"CNPJ",number:doc};
}
export function buildProductionBoletoPayer(guide:StoredGuide,raw:unknown){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new Error("Informe os dados reais do pagador antes de emitir o boleto.");
  const f=raw as Record<string,unknown>;
  const name=clean(guide.owner_name_snapshot||guide.contribuinte_nome,150);
  const names=name.split(" ").filter(Boolean);
  if(names.length<2)
    throw new Error("Cadastre nome completo do titular da guia antes de emitir o boleto.");
  const identification=payerDocumentFromGuide(guide);
  const email=clean(f.email,120).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    throw new Error("Informe um e-mail válido do pagador.");
  const street_name=clean(f.street_name,150);
  const street_number=clean(f.street_number,16);
  const neighborhood=clean(f.neighborhood,100);
  const city=clean(f.city,100);
  const state=clean(f.state,2).toUpperCase();
  const zip_code=digits(f.zip_code);
  if(!street_name||!street_number||!neighborhood||!city||
     !/^[A-Z]{2}$/.test(state)||!/^[0-9]{8}$/.test(zip_code))
    throw new Error("Complete CEP, rua, número, bairro, cidade e UF do titular para o boleto real.");
  return {
    email,
    first_name:names.slice(0,-1).join(" "),
    last_name:names.at(-1)!,
    identification,
    address:{street_name,street_number,zip_code,neighborhood,state,city},
  };
}

/** No API writing is possible until explicit and independent safety conditions. */
export function assertProductionBankIssueAllowed(
  guide:StoredGuide|undefined,env:Record<string,string|undefined>=process.env,
){
  if(env.VERCEL_ENV!=="production"||
     env.SIGAPRO_PROD_BANK_CHARGES_ENABLED!=="true"||
     !guide||guide.collection_mode_snapshot==="municipal_system"||
     (guide.payment_provider&&guide.payment_provider!=="mercado_pago")||
     guide.provider_environment==="test"||
     !guide.municipality_id||!guide.process_id)
    throw new Error("A emissão bancária real requer produção autorizada, Prefeitura ativa e conexão de produção comprovada.");
}
