import {describe,expect,it} from "vitest";
import {buildPixPayload,isValidPixPayload,pixPayloadAmountCents} from "@/lib/pix";

function withCrc(body:string):string{
  let crc=0xffff;
  for(const byte of new TextEncoder().encode(body)){
    crc^=byte<<8;
    for(let bit=0;bit<8;bit++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;
  }
  return body+crc.toString(16).toUpperCase().padStart(4,"0");
}

const valid=buildPixPayload({key:"pix@prefeitura.gov.br",merchantName:"Prefeitura Teste",
  merchantCity:"Campo Limpo",amount:35.24,txid:"DAM12026"})!;
describe("SIGAPRO QR PIX — integridade EMV e valor da guia",()=>{
  it("aceita somente BR Code completo e calcula centavos da cobrança",()=>{
    expect(isValidPixPayload(valid)).toBe(true);
    expect(pixPayloadAmountCents(valid)).toBe(3524);
    expect(isValidPixPayload(valid.slice(0,-1)+"0")).toBe(false);
  });
  it("rejeita cópia e cola com campo duplicado mesmo que alguém recalcule CRC",()=>{
    const duplicated=withCrc(valid.slice(0,-8)+"540535.24"+valid.slice(-8,-4));
    expect(isValidPixPayload(duplicated)).toBe(false);
  });
  it("rejeita descrição com campo truncado, bytes inconsistentes e GUI falso",()=>{
    const truncated=withCrc(valid.slice(0,-8)+"540935.24"+valid.slice(-8,-4));
    expect(isValidPixPayload(truncated)).toBe(false);
    const fakeGui=withCrc(valid.slice(0,-8).replace("BR.GOV.BCB.PIX","BR.GOV.BCB.FAK")+valid.slice(-8,-4));
    expect(isValidPixPayload(fakeGui)).toBe(false);
  });
  it("aceita valor ausente apenas como QR dinâmico, nunca como R$ 0,00",()=>{
    const withoutAmount=valid.replace("540535.24","");
    const dynamic=withCrc(withoutAmount.slice(0,-8));
    expect(isValidPixPayload(dynamic)).toBe(true);
    expect(pixPayloadAmountCents(dynamic)).toBeNull();
  });
  it("rejeita moeda diferente, país incorreto e valores financeiros ambíguos",()=>{
    const noCrc=valid.slice(0,-8);
    expect(isValidPixPayload(withCrc(noCrc.replace("5303986","5303840")))).toBe(false);
    expect(isValidPixPayload(withCrc(noCrc.replace("5802BR","5802US")))).toBe(false);
    expect(isValidPixPayload(withCrc(noCrc.replace("540535.24","540535,24")))).toBe(false);
  });
});
