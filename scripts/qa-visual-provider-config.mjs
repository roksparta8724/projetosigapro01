#!/usr/bin/env node
/**
 * Preview QA provider configuration attestation — never calls an API.
 * Outputs only readiness categories, never credentials or model prompts.
 * A READY result means configuration exists, NOT that an external visual
 * reading succeeded or that any balance is available.
 */
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {qaDatabaseEndpointMatches} from "./qa-r2-original-bytes.mjs";
const QA_BRANCH="fix/qa-triagem-analise-pagamento-20261101";
const nonblank=(x)=>typeof x==="string" && x.trim().length>=20;
export function inspectVisualProviderEnvironment(env=process.env) {
  if(env.VERCEL_ENV!=="preview"||env.VERCEL_GIT_COMMIT_REF!==QA_BRANCH||
     !qaDatabaseEndpointMatches(
       String(env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||""),
       String(env.VITE_NEON_DATA_API_URL||"")
     ))return {status:"NOT_VERIFIED_QA_SCOPE"};
  const provider=String(env.SIGAPRO_AI_PDF_PROVIDER||"").toLowerCase().trim();
  const enabled=String(env.SIGAPRO_AI_PDF_ENABLED||"").toLowerCase().trim()!=="false";
  const claude=nonblank(env.ANTHROPIC_API_KEY)||nonblank(env.SIGAPRO_ANTHROPIC_API_KEY)||
    nonblank(env.SIGAPRO_CLAUDE_API_KEY)||nonblank(env.CLAUDE_API_KEY);
  const openai=nonblank(env.OPENAI_API_KEY);
  const cloudflare=nonblank(env.SIGAPRO_CF_API_TOKEN)&&
    /^[a-f0-9]{32}$/i.test(String(env.SIGAPRO_CF_ACCOUNT_ID||""));
  const gemini=nonblank(env.SIGAPRO_GEMINI_QA_API_KEY)&&
    env.SIGAPRO_GEMINI_QA_ENABLED==="true";
  const visual=provider==="claude"||provider==="anthropic"?claude:
    provider==="openai"?openai:provider==="gemini"?gemini:false;
  return {
    status:!enabled?"DISABLED":visual?"CONFIGURED_NOT_PROVEN":"EXTERNAL_VISUAL_NOT_CONFIGURED",
    configuredProvider:["claude","anthropic","openai","cloudflare","gemini"].includes(provider)
      ?provider:"none",
    externalVisualConfigured:enabled&&visual,
    cloudflareTextConfigured:enabled&&cloudflare,
    localPdfTextAvailable:true,
    visualInferenceProved:false,
  };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log("SIGAPRO_QA_VISUAL_PDF_READINESS "+
    JSON.stringify(inspectVisualProviderEnvironment()));
}
