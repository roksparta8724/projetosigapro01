import { describe, expect, it } from "vitest";
import handler from "../../functions/sigaproqa/index.js";
describe("SIGAPRO branch-pinned QA large PDF function", () => {
 it("refuses every object request without a user JWT", async () => {
  for (const [method,path] of [["POST","/upload"],["GET","/read"],["DELETE","/object"]] as const) {
   const request=new Request("https://qa.invalid"+path+"?objectKey=municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/protocols/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/doc.pdf",{method});
   const response=await handler.fetch(request);
   expect(response.status).toBe(401);
  }
 });
 it("denies CORS from the official domain", async () => {
  const response=await handler.fetch(new Request("https://qa.invalid/upload",{method:"OPTIONS",headers:{Origin:"https://sigapromunicipal.com.br"}}));
  expect(response.status).toBe(403);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
 });
 it("allows the stable QA preview origin to perform preflights only", async () => {
  const origin="https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";
  const response=await handler.fetch(new Request("https://qa.invalid/upload",{method:"OPTIONS",headers:{Origin:origin}}));
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
 });
 it("rejects a forged object key before any database or storage I/O", async () => {
  const response=await handler.fetch(new Request("https://qa.invalid/upload?objectKey=../../secret.pdf",
    {method:"POST",headers:{Authorization:"Bearer synthetic"}}));
  expect(response.status).toBe(400);
 });
});
