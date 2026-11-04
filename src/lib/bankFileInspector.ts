/**
 * Read-only local bank file inspector. NEVER authorizes a municipal settlement.
 * CNAB layout variants/occurrences are bank- and agreement-specific.
 */
export type BankFileFormat = "cnab240" | "cnab400" | "ofx";
export type BankFileInspection = {
 format:BankFileFormat;bankCode:string|null;records:number;details:number;
 incomingCredits:number|null;duplicateIdentifiers:number;warnings:string[];
 automaticSettlementAllowed:false;verifiedByBank:false;
};
const MAX_FILE_CHARS=2_000_000,MAX_LINES=15_000,MAX_TRANSACTIONS=5_000;
const noSettlement={automaticSettlementAllowed:false,verifiedByBank:false} as const;
function linesOf(input:string):string[]{
 const raw=input.replace(/^\uFEFF/,"").split(/\r\n|\r|\n/);
 if(raw[raw.length-1]==="")raw.pop();
 if(!raw.length||raw.length>MAX_LINES)throw Error("Quantidade de registros bancários fora do limite.");
 return raw;
}
function cnab240(lines:string[],expectedBank:string):BankFileInspection {
 const first=lines[0],bankCode=first.slice(0,3);
 if(!/^[0-9]{3}$/.test(bankCode)||first[7]!=="0"||lines[lines.length-1][7]!=="9")
  throw Error("CNAB 240 inválido: cabeçalho ou trailer de arquivo ausente.");
 let details=0,t=0,u=0;
 for(const line of lines){
  if(line.slice(0,3)!==bankCode)throw Error("CNAB 240 inválido: códigos bancários divergentes.");
  if(!"01359".includes(line[7]))throw Error("CNAB 240 inválido: tipo de registro desconhecido.");
  if(line[7]==="3"){
   details++;if(line[13]==="T")t++;if(line[13]==="U")u++;
  }
 }
 const warnings=["Leitura estrutural, sem confirmação de pagamento. Ocorrências e valores dependem do leiaute homologado com o banco."];
 if(expectedBank&&expectedBank!==bankCode)warnings.unshift("Banco do arquivo não corresponde ao banco cadastrado nesta Prefeitura.");
 if(t!==u)warnings.push("Segmentos T e U não correspondem em quantidade; confira o retorno.");
 return {format:"cnab240",bankCode,records:lines.length,details,incomingCredits:null,
 duplicateIdentifiers:0,warnings,...noSettlement};
}
function cnab400(lines:string[]):BankFileInspection {
 if(lines[0][0]!=="0"||lines[lines.length-1][0]!=="9")
  throw Error("CNAB 400 inválido: cabeçalho ou trailer ausente.");
 return {format:"cnab400",bankCode:null,records:lines.length,
  details:lines.slice(1,-1).filter(x=>x[0]==="1").length,
  incomingCredits:null,duplicateIdentifiers:0,
  warnings:["CNAB 400: campos e ocorrências variam por banco e convênio. É necessário homologar o leiaute antes de reconhecer liquidação."],
  ...noSettlement};
}
function field(section:string,name:string){
 const m=section.match(new RegExp("<"+name+">([^\\r\\n<]{0,256})","i"));
 return m?m[1].trim():"";
}
function cents(value:string):number|null{
 if(!/^[+-]?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value))return null;
 const v=Math.round(Number(value)*100);
 return Number.isSafeInteger(v)?v:null;
}
function isDate(value:string):boolean{
 if(!/^\d{8}/.test(value))return false;
 const y=Number(value.slice(0,4)),m=Number(value.slice(4,6)),d=Number(value.slice(6,8));
 if(y<1900||y>2200||m<1||m>12||d<1)return false;
 const v=new Date(Date.UTC(y,m-1,d));
 return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d;
}
function ofx(text:string):BankFileInspection{
 const matches=[...text.matchAll(/<STMTTRN>/gi)];
 if(matches.length>MAX_TRANSACTIONS)throw Error("Extrato OFX acima do limite de lançamentos.");
 const seen=new Set<string>();
 let credits=0,duplicates=0,incomplete=0;
 for(let i=0;i<matches.length;i++){
  const start=(matches[i].index||0)+matches[i][0].length;
  const next=i+1<matches.length?matches[i+1].index!:text.length;
  const close=text.indexOf("</STMTTRN>",start);
  const section=text.slice(start,close>=0&&close<next?close:next);
  const id=field(section,"FITID"),amount=cents(field(section,"TRNAMT"));
  if(!id||!isDate(field(section,"DTPOSTED"))||amount===null){incomplete++;continue;}
  if(seen.has(id))duplicates++;else seen.add(id);
  if(amount>0)credits++;
 }
 const warnings=["OFX é extrato de conta, não comprovação de liquidação de guia. Créditos não podem ser compensados automaticamente sem referência bancária autenticada."];
 if(duplicates)warnings.push("Há transações com FITID repetido. Evite contar créditos duplicados.");
 if(incomplete)warnings.push("Há lançamentos sem data, valor ou identificador válido.");
 if(!matches.length)warnings.push("Nenhum lançamento STMTTRN foi identificado.");
 return {format:"ofx",bankCode:null,records:matches.length,details:matches.length,
  incomingCredits:credits,duplicateIdentifiers:duplicates,warnings,...noSettlement};
}
export function inspectBankFile(content:string,expectedBankCode=""):BankFileInspection{
 if(typeof content!=="string"||!content||content.length>MAX_FILE_CHARS||content.includes("\0"))
  throw Error("Arquivo vazio, binário ou acima de 2 MB. Use retorno bancário textual válido.");
 const lines=linesOf(content);
 if(lines.every(x=>x.length===240))return cnab240(lines,expectedBankCode.trim());
 if(lines.every(x=>x.length===400))return cnab400(lines);
 if(/<OFX(?:\s[^>]*)?>/i.test(content)&&/<BANKTRANLIST(?:\s[^>]*)?>/i.test(content))return ofx(content);
 throw Error("Formato não reconhecido. Utilize OFX ou retorno CNAB 240/400 do banco.");
}
