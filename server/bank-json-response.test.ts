// @vitest-environment node
import {describe,it,expect,vi} from "vitest";
import {readBankJson} from "./bank-json-response";
const headers={"Content-Type":"application/json"};
describe("External financial response bounds",()=>{
 it("reads a valid fragmented UTF-8 JSON body",async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({status:"concluído"}));
  const response=new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}}),{headers});
  expect(await readBankJson(response)).toEqual({status:"concluído"});
 });
 it("rejects non-JSON and an oversized declared body",async()=>{
  await expect(readBankJson(new Response("<html>error</html>",{headers:{"Content-Type":"text/html"}}))).rejects.toThrow("BANK_RESPONSE_INVALID");
  await expect(readBankJson(new Response("{}",{headers:{...headers,"Content-Length":"1000"}}),100)).rejects.toThrow("BANK_RESPONSE_INVALID");
 });
 it("cancels an oversized streaming response, without trusting content length",async()=>{
  const cancel=vi.fn();const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(64));c.enqueue(new Uint8Array(64));},cancel}),{headers});
  await expect(readBankJson(response,100)).rejects.toThrow("BANK_RESPONSE_TOO_LARGE");
  expect(cancel).toHaveBeenCalledTimes(1);
 });
 it("rejects invalid JSON and invalid UTF-8",async()=>{
  await expect(readBankJson(new Response("{",{headers}))).rejects.toThrow("BANK_RESPONSE_INVALID");
  await expect(readBankJson(new Response(new Uint8Array([0xff]),{headers}))).rejects.toThrow("BANK_RESPONSE_INVALID");
 });
});
