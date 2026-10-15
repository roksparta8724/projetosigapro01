type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

export default function handler(req: Req, res: Res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Método não permitido." });
    return;
  }

  json(res, 200, {
    app: "SIGAPRO Municipal",
    canonicalRepository: "roksparta8724/projetosigapro01",
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    gitRepoOwner: process.env.VERCEL_GIT_REPO_OWNER || null,
    gitRepoSlug: process.env.VERCEL_GIT_REPO_SLUG || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    projectId: process.env.VERCEL_PROJECT_ID || null,
    region: process.env.VERCEL_REGION || null,
  });
}
