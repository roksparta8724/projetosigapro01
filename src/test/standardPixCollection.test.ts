import {describe,expect,it} from "vitest";
import {buildStandardPixCharge,inspectStandardPixCharge,pixCentsToMoney,pixMoneyToCents} from "../../server/standard-pix-collection";
import {readFileSync} from "node:fs";
const base={municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",guideId:"01234567-89ab-4cde-8012-123456789abc",
 txid:"SIGAPRO20261029MUNICIPAL000001",amountCents:12345,pixKey:"chave@prefeitura.gov.br"};
const e2e="E"+("1".repeat(31));
const payment=(id=e2e,amount="123.45",devolucoes?:unknown[])=>({endToEndId:id,valor:amount,horario:"2026-10-29T18:00:00Z",...(devolucoes?{devolucoes}:{})});
const cob=(change:Record<string,unknown>={})=>({txid:base.txid,chave:base.pixKey,valor:{original:"123.45"},status:"CONCLUIDA",pix:[payment()],...change});
describe("Bank-neutral Banco Central Pix API contract (no banking claims)",()=>{
 it("builds standard immediate cob request with exact integer cents",()=>{
  expect(buildStandardPixCharge(base)).toEqual({
   calendario:{expiracao:3600},valor:{original:"123.45"},chave:base.pixKey,
   solicitacaoPagador:"Guia municipal SIGAPRO 01234567-89a",
  });
  expect(pixMoneyToCents("123.45")).toBe(12345);
  expect(pixMoneyToCents("123,45")).toBeNull();
  expect(pixMoneyToCents("1.999")).toBeNull();
  expect(pixCentsToMoney(1)).toBe("0.01");
  expect(()=>pixCentsToMoney(Number.NaN)).toThrow();
 });
 it("accepts a matching response as candidate ONLY, never settles",()=>{
  const candidate=inspectStandardPixCharge(cob(),base);
  expect(candidate).toMatchObject({candidate:true,reason:"bank_match_candidate",
   bankAuthenticationVerified:false,settlementAuthorized:false,txid:base.txid,endToEndIds:[e2e]});
 });
 it("rejects mismatched txid, recipient key and charge total",()=>{
  expect(inspectStandardPixCharge(cob({txid:"OTHER"}),base).reason).toBe("wrong_charge");
  expect(inspectStandardPixCharge(cob({chave:"invalida"}),base).reason).toBe("wrong_charge");
  expect(inspectStandardPixCharge(cob({valor:{original:"1.00"}}),base).reason).toBe("amount_mismatch");
 });
 it("never calls a merely active or cancelled charge paid",()=>{
  for(const status of ["ATIVA","REMOVIDA_PELO_USUARIO_RECEBEDOR","REMOVIDA_PELO_PSP"]){
   expect(inspectStandardPixCharge(cob({status}),base).reason).toBe("not_settled");
  }
  expect(inspectStandardPixCharge(cob({pix:[]}),base).reason).toBe("invalid_response");
 });
 it("rejects partial credits, excess amounts and duplicates",()=>{
  expect(inspectStandardPixCharge(cob({pix:[payment(e2e,"120.00")]}),base).reason).toBe("amount_mismatch");
  expect(inspectStandardPixCharge(cob({pix:[payment(e2e,"124.00")]}),base).reason).toBe("amount_mismatch");
  expect(inspectStandardPixCharge(cob({pix:[payment(),payment()]}),base).reason).toBe("duplicate_receipts");
  expect(inspectStandardPixCharge(cob({pix:[payment(e2e,"100.00"),payment("E"+("2".repeat(31)),"23.45")]}),base).candidate).toBe(true);
 });
 it("blocks refunded, invalid timestamp and fake endToEnd evidence",()=>{
  expect(inspectStandardPixCharge(cob({pix:[payment(e2e,"123.45",[{}])]}),base).reason).toBe("partial_or_refunded");
  expect(inspectStandardPixCharge(cob({pix:[{...payment(),horario:"invalid-date"}]}),base).reason).toBe("invalid_response");
  expect(inspectStandardPixCharge(cob({pix:[payment("fake")]}),base).reason).toBe("invalid_response");
 });
 it("rejects malformed charge identities and amounts before any operation",()=>{
  expect(()=>buildStandardPixCharge({...base,txid:"SHORT"})).toThrow(/txid/);
  expect(()=>buildStandardPixCharge({...base,municipalityId:"bad"})).toThrow(/Município/);
  expect(()=>buildStandardPixCharge({...base,amountCents:0})).toThrow(/Valor/);
  expect(()=>buildStandardPixCharge(base,2)).toThrow(/expiração/);
  expect(()=>inspectStandardPixCharge(null,base)).not.toThrow();
 });
 it("never performs direct DB mutation, webhook acceptance or network calls",()=>{
  const implementation=readFileSync("server/standard-pix-collection.ts","utf8");
  expect(implementation).not.toContain("fetch(");
  expect(implementation).not.toContain("UPDATE public.payment_guides");
  expect(implementation).not.toContain("settlementAuthorized:true");
  expect(implementation).toContain("bankAuthenticationVerified:false");
 });
});
