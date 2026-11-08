#!/usr/bin/env node
/**
 * Real network smoke against deployed SIGAPRO Preview, intentionally anonymous.
 * Never pretends to be a municipal user and never creates/processes a payment.
 * This verifies operational HTTP routing and public availability only.
 */
import { performance } from "node:perf_hooks";
const DEFAULT = "https://projetosigapro01-git-fix-qa-tria-c25603-roksparta8724s-projects.vercel.app";
const BASE = new URL(process.env.SIGAPRO_QA_PREVIEW_URL || DEFAULT);
if (BASE.protocol !== "https:" || !BASE.hostname.endsWith(".vercel.app") ||
    BASE.pathname !== "/" || BASE.search || BASE.hash) {
  throw Error("Preview smoke restricted to HTTPS Vercel deployment root");
}
const CASES = Object.freeze([
  { id:"health",path:"/api/health",status:200,kind:"json",key:"service",equal:"sigapro" },
  { id:"mercado_pago_qa_health",path:"/api/mp-qa-webhook",status:200,kind:"json",key:"environment",equal:"qa" },
  { id:"r2_chunk_get_denied",path:"/api/r2-process-proxy-upload",status:405,kind:"json" },
  { id:"r2_chunk_anonymous_write_denied",path:"/api/r2-process-proxy-upload",
    method:"POST",headers:{"Content-Type":"application/json"},body:"{}",status:401,kind:"json" },
  { id:"r2_chunk_foreign_origin_denied",path:"/api/r2-process-proxy-upload",
    method:"POST",headers:{"Content-Type":"application/json",
      "Authorization":"Bearer INVALID_FAKE_QA_TOKEN",
      "Origin":"https://invalid-origin.example"},body:"{}",status:403,kind:"json" },
  { id:"r2_upload_get_denied",path:"/api/r2-upload",status:405,kind:"json" },
  { id:"r2_delete_get_denied",path:"/api/r2-delete",status:405,kind:"json" },
  { id:"r2_sign_get_denied",path:"/api/r2-sign-get",status:405,kind:"json" },
  { id:"portal_login",path:"/acesso",status:200,kind:"html" },
  { id:"municipal_dashboard",path:"/prefeitura",status:200,kind:"html" },
  { id:"overview_processes",path:"/prefeitura/visao-geral/processos",status:200,kind:"html" },
  { id:"overview_pending",path:"/prefeitura/visao-geral/pendencias",status:200,kind:"html" },
  { id:"overview_activities",path:"/prefeitura/visao-geral/atividades",status:200,kind:"html" },
]);
function percentile(numbers, pct) {
  const ordered = numbers.slice().sort((a,b)=>a-b);
  return ordered[Math.min(ordered.length-1,Math.max(0,Math.ceil(pct*ordered.length)-1))] || 0;
}
async function probe(spec) {
  const url=new URL(spec.path,BASE);
  const started=performance.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(url,{
      method:spec.method || "GET",redirect:"error",cache:"no-store",
      headers:{"Accept":"application/json,text/html",...(spec.headers||{})},
      ...(spec.body ? {body:spec.body} : {}),
      signal:controller.signal,
    });
    const elapsedMs=Math.round(performance.now()-started);
    const contentType=response.headers.get("content-type") || "";
    const text=await response.text();
    if (response.status !== spec.status) throw Error(
      "Unexpected status ("+response.status+" vs "+spec.status+")");
    if (spec.kind==="json") {
      if (!contentType.includes("application/json")) throw Error("Expected JSON content-type");
      const obj=JSON.parse(text);
      if (spec.key && obj[spec.key]!==spec.equal) throw Error("Incorrect QA service identity");
    } else {
      if (!contentType.includes("text/html") || !/^<!doctype html>/i.test(text.trimStart()) ||
        !/<html\b[^>]*lang="pt-BR"/i.test(text) ||
        !/id="root"/.test(text)) throw Error("Portal SPA HTML shell missing");
    }
    return {id:spec.id,ok:true,status:response.status,elapsedMs};
  } catch(error) {
    return {id:spec.id,ok:false,error:error instanceof Error ? error.message : "Unknown"};
  } finally {clearTimeout(timer);}
}
const results=[];
for (const test of CASES) results.push(await probe(test));
const success=results.every(x=>x.ok);
const latencies=results.filter(x=>x.ok).map(x=>x.elapsedMs);
const output={
  // No tokens, account IDs, process keys, payment identifiers, or PII.
  environment:"preview",target:BASE.origin,checkedAt:new Date().toISOString(),
  type:"UNAUTHENTICATED_PUBLIC_HTTP_ONLY",
  passed:results.filter(x=>x.ok).length,
  total:CASES.length,p50HttpMs:percentile(latencies,.5),
  p95HttpMs:percentile(latencies,.95),
  note:"Does not certify login, bank settlement, physical R2, AI, authorization by role or DB recovery",
  results,
};
console.log("SIGAPRO_QA_LIVE_HTTP_SMOKE "+JSON.stringify(output));
if (!success) process.exitCode=1;
