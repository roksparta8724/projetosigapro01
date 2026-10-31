import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {unwrapCloudflareVisionAnswer,validateVisionInput} from "../../server/urban-matrix-vision";
import {parseUrbanVisionResult} from "@/lib/urbanVisionStructured";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const server=readFileSync("server/urban-matrix-vision.ts","utf8");

describe("SIGAPRO QA — retorno Cloudflare, reconsulta opcional e zona correta",()=>{
 const named="Zona: ZM-B(e)\nUso: comercial\nRecuo frontal: 10 m";
 it("aceita envelopes documentados mas não números soltos",()=>{
   for(const body of [
     {result:{answer:named}},
     {answer:named},
     {result:{response:named}},
     {result:{result:{answer:named}}},
     {result:{output:named}},
     {choices:[{message:{content:named}}]},
   ]) {
     const raw=unwrapCloudflareVisionAnswer(body);
     expect(raw).toBe(named);
     expect(parseUrbanVisionResult(raw)?.recognizable).toBe(3);
   }
   expect(unwrapCloudflareVisionAnswer({result:{answer:""}})).toBe(null);
   expect(parseUrbanVisionResult(unwrapCloudflareVisionAnswer({result:{answer:"0,05 0,5 1 50"}}))).toBeNull();
 });
 it("somente imagens com modelo e formato controlados chegam ao OCR",()=>{
   const image="data:image/jpeg;base64,"+Buffer.concat([
     Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(900,0),
   ]).toString("base64");
   const input={action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:image};
   expect(validateVisionInput(input)?.mode).toBe("structured");
   expect(validateVisionInput({...input,mode:"literal"})?.mode).toBe("literal");
   expect(validateVisionInput({...input,mode:"paid-fallback"})).toBeNull();
 });
 it("separa o modo literal da consulta original e cobra apenas após clique explícito",()=>{
   expect(ui).toContain('visionMode:"structured"|"literal"|"focused"|"expert"="structured"');
   expect(ui).toContain('quadro,page,hash,visionMode,visionMode==="focused"?focusSelection:""].join("|")');
   expect(ui).toContain('onClick={()=>void readPageImage("literal")}');
   expect(ui).toContain('data-urban-vision-literal-retry="true"');
   expect(ui).toContain('mode:visionMode');
   expect(server).toContain('input.mode==="literal"');
   expect(server).toContain('stream:false,reasoning:false');
 });
 it("divergência de zona nunca vira conferência automática",()=>{
   expect(ui).toContain('data-urban-ai-expected-row="true"');
   expect(ui).toContain("normalizeUrbanCode(extractedZone)!==normalizeUrbanCode(zone)");
   expect(ui).toContain("normalizeUrbanCode(extractedUse)!==normalizeUrbanCode(usage)");
   expect(ui).toContain('kind:zoneMismatch||useMismatch?"error":Number(result.recognizable)===13?"success":"reading"');
   expect(ui).toContain("Nenhuma regra foi aprovada.");
 });
 it("logs não incluem imagem, resposta da IA ou credenciais",()=>{
   expect(server).toContain('textLength:raw?.length||0');
   expect(server).toContain('resultKeys:resultNode?Object.keys(resultNode).slice(0,8):[]');
   expect(server).not.toContain("console.log(input.imageDataUrl)");
   expect(server).not.toContain("console.log(raw)");
   expect(server).not.toContain("save_urban_matrix_numeric_review_v1");
 });
});
