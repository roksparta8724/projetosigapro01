import handleDelete from "../server/api/r2-delete";
import handleListUserFiles from "../server/api/r2-list-user-files";
import handleMasterLogoSource from "../server/api/r2-master-logo-source";
import handleSignGet from "../server/api/r2-sign-get";
import handleUpload from "../server/api/r2-upload";

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

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    error: "Rota de armazenamento inválida.",
    code: "R2_ROUTE_NOT_FOUND",
  }));
}
