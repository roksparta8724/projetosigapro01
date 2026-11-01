import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {validateVisionInput} from "../../server/urban-matrix-vision";
const server=readFileSync("server/urban-matrix-vision.ts","utf8");
const vercel=JSON.parse(readFileSync("vercel.json","utf8")) as {functions?:Record<string,{maxDuration:number}>};
describe("SIGAPRO QA — leitura visual Cloudflare com prazo controlado",()=>{
 it("usa o contrato de OCR do Moondream 3.1 documentado pela Cloudflare",()=>{
   // REST image is raw base64 after validating the browser data URI.
   expect(server).toContain('image:input.imageDataUrl,question:prompt');
   expect(server).toContain('stream:false,reasoning:false,max_tokens:1100');
   expect(server).toContain('"/ai/run/@cf/moondream/moondream3.1-9B-A2B"');
   expect(server).toContain('messages:[{role:"user",content:[');
   expect(server).toContain('expert?"/ai/run/@cf/google/gemma-4-26b-a4b-it":');
   expect(server).toContain("URBAN_VISION_JSON_PROMPT");
   expect(server).toContain('const structured=parseUrbanVisionResult(raw)');
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
