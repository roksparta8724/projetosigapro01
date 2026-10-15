const expectedOwner = "roksparta8724";
const expectedRepo = "projetosigapro01";

const isVercel = process.env.VERCEL === "1";
if (!isVercel) {
  process.exit(0);
}

const owner = String(process.env.VERCEL_GIT_REPO_OWNER || "").trim();
const repo = String(process.env.VERCEL_GIT_REPO_SLUG || "").trim();
const branch = String(process.env.VERCEL_GIT_COMMIT_REF || "").trim();
const env = String(process.env.VERCEL_ENV || "").trim();

if (owner && owner !== expectedOwner) {
  console.error(`[SIGAPRO] Build bloqueado: owner Git inesperado: ${owner}`);
  process.exit(1);
}
if (repo && repo !== expectedRepo) {
  console.error(`[SIGAPRO] Build bloqueado: repositório Git inesperado: ${repo}`);
  process.exit(1);
}
if (env === "production" && branch !== "main") {
  console.error(`[SIGAPRO] Build de produção bloqueado: branch esperada main, recebida ${branch || "(vazia)"}`);
  process.exit(1);
}

console.log(`[SIGAPRO] Fonte canônica validada: ${owner || expectedOwner}/${repo || expectedRepo} @ ${branch || "local"} (${env || "unknown"})`);
