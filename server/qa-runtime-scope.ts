/** Explicit hosted QA identities. This does not grant authentication or DB privileges. */
export const CURRENT_QA_BRANCH = "fix/homologacao-geral-sei-dashboard-bank-20261113";
export const LEGACY_QA_BRANCH = "fix/qa-triagem-analise-pagamento-20261101";
export function currentQaPreview(env:Record<string,string|undefined>):boolean {
  if(env.VERCEL_ENV!=="preview"||env.VERCEL_GIT_COMMIT_REF!==CURRENT_QA_BRANCH||
     env.VITE_SIGAPRO_NEON_ISOLATED!=="true")return false;
  try {
    const api=new URL(String(env.VITE_NEON_DATA_API_URL||""));
    return api.protocol==="https:" && !api.username && !api.password && !api.port &&
      api.hostname==="ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech" &&
      api.pathname.replace(/\/$/,"")==="/sigapro_migration_stage_20260923/rest/v1" &&
      !api.search && !api.hash;
  } catch { return false; }
}
