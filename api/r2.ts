import handleDelete from "../server/api/r2-delete.js";
import handleListUserFiles from "../server/api/r2-list-user-files.js";
import handleMasterLogoSource from "../server/api/r2-master-logo-source.js";
import handleProfileAvatarOpen from "../server/api/profile-avatar-open.js";
import handleSignGet from "../server/api/r2-sign-get.js";
import handleUpload from "../server/api/r2-upload.js";
import { handleQaStorage } from "../server/qa-storage.js";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function resolveAction(req: Req) {
  try {
    const url = new URL(req.url || "/api/r2", "https://sigapro.local");
    return String(url.searchParams.get("action") || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export default async function handler(req: Req, res: Res) {
  const action = resolveAction(req);

  // A QA preview must never fall back to inherited production R2 secrets,
  // even if its isolation flag was accidentally omitted or changed.
  const isPreview = process.env.VERCEL_ENV === "preview";
  const isQaBranch = isPreview &&
    process.env.VERCEL_GIT_COMMIT_REF === "qa/sigapro-ia-logo-integrado-20261023";
  if (isQaBranch && process.env.VITE_SIGAPRO_NEON_ISOLATED !== "true") {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({code:"QA_ISOLATION_NOT_CONFIGURED"}));
    return;
  }
  if (isPreview && (isQaBranch || process.env.VITE_SIGAPRO_NEON_ISOLATED === "true")) {
    return handleQaStorage(req, res, action);
  }

  if (action === "upload") return handleUpload(req as never, res);
  if (action === "delete") return handleDelete(req as never, res);
  if (action === "sign-get") return handleSignGet(req as never, res);
  if (action === "list-user-files") return handleListUserFiles(req as never, res);
  if (action === "master-logo-source") return handleMasterLogoSource(req as never, res);
  if (action === "profile-avatar-open") return handleProfileAvatarOpen(req as never, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    error: "Rota de armazenamento inválida.",
    code: "R2_ROUTE_NOT_FOUND",
  }));
}
