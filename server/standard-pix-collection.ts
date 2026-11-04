/**
 * Banco Central API Pix — common charge/receipt contract (not a bank adapter).
 * https://github.com/bacen/pix-api
 *
 * Only authentic provider queries with municipality-scoped credentials can
 * authorize settlement. Parsing JSON here never updates payment_guides.
 * The same contract is reusable for bank integrations implementing API Pix.
 */
export type PixGuideExpectation={
 municipalityId:string; guideId:string; txid:string;
 amountCents:number; pixKey:string;
};
export type PixChargeInput={
 calendario:{expiracao:number};
 valor:{original:string};chave:string;
 solicitacaoPagador:string;
};
export type PixSettlementCandidate={
 candidate:boolean;
 reason:"bank_match_candidate"|"invalid_response"|"wrong_charge"|"not_settled"|"amount_mismatch"|"partial_or_refunded"|"duplicate_receipts";
 txid:string;
 endToEndIds:string[];
 bankAuthenticationVerified:false;
 settlementAuthorized:false;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TXID=/^[a-zA-Z0-9]{26,35}$/;
function asObject(v:unknown):Record<string,unknown>|null{
 return v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
}
export function pixMoneyToCents(value:unknown):number|null{
 if(typeof value!=="string"||!/^(?:0|[1-9]\d{0,10})\.\d{2}$/.test(value))return null;
 const [major,minor]=value.split(".");
 const cents=Number(major)*100+Number(minor);
 return Number.isSafeInteger(cents)?cents:null;
}
export function pixCentsToMoney(cents:number):string{
 if(!Number.isSafeInteger(cents)||cents<=0||cents>999_999_999_999)
  throw Error("Valor da cobrança Pix fora do intervalo permitido.");
 return Math.floor(cents/100)+"."+(cents%100).toString().padStart(2,"0");
}
export function validatePixGuideIdentity(expected:PixGuideExpectation){
 if(!UUID.test(expected.municipalityId)||!UUID.test(expected.guideId))
  throw Error("Município ou guia Pix sem identidade válida.");
 if(!TXID.test(expected.txid))throw Error("txid inválido: informe 26 a 35 caracteres alfanuméricos.");
 if(!expected.pixKey||expected.pixKey.length>130||expected.pixKey.trim()!==expected.pixKey)
  throw Error("Chave Pix oficial do beneficiário não informada.");
 pixCentsToMoney(expected.amountCents);
}
export function buildStandardPixCharge(expected:PixGuideExpectation,expirationSeconds=3600):PixChargeInput{
 validatePixGuideIdentity(expected);
 if(!Number.isInteger(expirationSeconds)||expirationSeconds<60||expirationSeconds>2_592_000)
  throw Error("Prazo de expiração da cobrança fora do limite aceito.");
 return {
  calendario:{expiracao:expirationSeconds},
  valor:{original:pixCentsToMoney(expected.amountCents)},
  chave:expected.pixKey,
  solicitacaoPagador:"Guia municipal SIGAPRO "+expected.guideId.slice(0,12),
 };
}
/** Inspect a returned API Pix Cob charge. This is NOT an authentic bank attestation. */
export function inspectStandardPixCharge(response:unknown,expected:PixGuideExpectation):PixSettlementCandidate{
 validatePixGuideIdentity(expected);
 const denied=(reason:PixSettlementCandidate["reason"],ids:string[]=[]):PixSettlementCandidate=>({
  candidate:false,reason,txid:expected.txid,endToEndIds:ids,
  bankAuthenticationVerified:false,settlementAuthorized:false,
 });
 const root=asObject(response);
 if(!root)return denied("invalid_response");
 const valor=asObject(root.valor);
 if(root.txid!==expected.txid||root.chave!==expected.pixKey)return denied("wrong_charge");
 const expectedMoney=pixCentsToMoney(expected.amountCents);
 if(!valor||valor.original!==expectedMoney)return denied("amount_mismatch");
 if(root.status!=="CONCLUIDA")return denied("not_settled");
 if(!Array.isArray(root.pix)||root.pix.length<1||root.pix.length>500)return denied("invalid_response");
 const ids:string[]=[];
 const unique=new Set<string>();
 let paid=0;
 for(const item of root.pix){
  const p=asObject(item);
  if(!p)return denied("invalid_response");
  const id=p.endToEndId;
  const amount=pixMoneyToCents(p.valor);
  const time=p.horario;
  if(typeof id!=="string"||!/^E[A-Za-z0-9]{31}$/.test(id)||
     typeof time!=="string"||time.length>45||!Number.isFinite(Date.parse(time))||
     amount===null||amount<=0)return denied("invalid_response");
  if(unique.has(id))return denied("duplicate_receipts",ids);
  unique.add(id);ids.push(id);
  if(Array.isArray(p.devolucoes)&&p.devolucoes.length>0)return denied("partial_or_refunded",ids);
  paid+=amount;
  if(!Number.isSafeInteger(paid)||paid>expected.amountCents)return denied("amount_mismatch",ids);
 }
 if(paid!==expected.amountCents)return denied("amount_mismatch",ids);
 // Explicitly deny direct settlement from any unsigned/unattested JSON payload.
 return {candidate:true,reason:"bank_match_candidate",txid:expected.txid,endToEndIds:ids,
  bankAuthenticationVerified:false,settlementAuthorized:false};
}
