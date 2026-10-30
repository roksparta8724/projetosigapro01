import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {validateVisionInput} from "../../server/urban-matrix-vision";
const server=readFileSync("server/urban-matrix-vision.ts","utf8");
const vercel=JSON.parse(readFileSync("vercel.json","utf8")) as {functions?:Record<string,{maxDuration:number}>};
describe("SIGAPRO QA — leitura visual Cloudflare com prazo controlado",()=>{
 it("usa o contrato de API de visão do Llama 3.2 documentado pela Cloudflare",()=>{
   expect(server).toContain('messages:[');
   expect(server).toContain('image:input.imageDataUrl,max_tokens:900,temperature:0');
   expect(server).not.toContain('body:JSON.stringify({prompt,image:input.imageDataUrl');
 });
 it("permite tempo de inferência adequado e mantém um teto para não consumir recursos ilimitados",()=>{
   expect(server).toContain('PROVIDER_TIMEOUT_MS=45000');
   expect(vercel.functions?.["api/ai-assistant.ts"]?.maxDuration).toBe(60);
   expect(server).toContain('CLOUDFLARE_VISION_TIMEOUT');
 });
 it("não registra imagens, tokens, conteúdo do PDF ou regras no banco durante OCR",()=>{
   expect(server).toContain('elapsedMs:Date.now()-startedAt');
   expect(server).not.toContain("save_urban_matrix_numeric_review_v1");
   expect(server).not.toContain('console.log(input.imageDataUrl)');
   expect(server).toContain('automaticallyActivated:false');
   expect(validateVisionInput({action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:"invalid"})).toBe(null);
 });
});
