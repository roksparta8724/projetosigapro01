import handleDelete from "../server/api/r2-delete.js";
import handleListUserFiles from "../server/api/r2-list-user-files.js";
import handleMasterLogoSource from "../server/api/r2-master-logo-source.js";
import handleProfileAvatarOpen from "../server/api/profile-avatar-open.js";
import handleSignGet from "../server/api/r2-sign-get.js";
import handleUpload from "../server/api/r2-upload.js";

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
