/** Bank sandbox endpoints are allowed ONLY on a named isolated QA branch.
 * Production tokens, the production database and a generic Preview are
 * rejected before any external provider POST. No secrets are logged.
 */
export function isIsolatedQaBankRuntime(
  env:Record<string,string|undefined>=process.env,
):boolean{
  if(env.VITE_SIGAPRO_NEON_ISOLATED!=="true")return false;
  if(env.SIGAPRO_LOCAL_QA_LAUNCH==="true" &&
     env.SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES==="true" &&
     (!env.VERCEL_ENV||env.VERCEL_ENV==="development"))return true;
  if(env.VERCEL_ENV!=="preview" ||
     env.VERCEL_GIT_COMMIT_REF!=="fix/qa-triagem-analise-pagamento-20261101")
    return false;
  try{
    const db=new URL(String(env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||""));
    const api=new URL(String(env.VITE_NEON_DATA_API_URL||""));
    if(!["postgres:","postgresql:"].includes(db.protocol)||
       api.protocol!=="https:")return false;
    const marker=/^(ep-[a-z0-9-]+)\.apirest\./.exec(api.hostname)?.[1];
    return Boolean(marker &&
      db.username==="sigapro_qa_webhook_worker" &&
      db.pathname==="/sigapro_migration_stage_20260923" &&
      (db.searchParams.get("sslmode")==="require"||
       db.searchParams.get("sslmode")==="verify-full") &&
      (db.hostname.startsWith(marker+".") ||
       db.hostname.startsWith(marker+"-pooler.")) &&
      !marker.includes("blue-cloud"));
  }catch{return false;}
}
export function assertIsolatedQaBankRuntime(
  env:Record<string,string|undefined>=process.env,
):void{
  if(!isIsolatedQaBankRuntime(env))
    throw new Error("Emissão de teste permitida somente na homologação SIGAPRO isolada.");
}
