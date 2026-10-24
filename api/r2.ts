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

  // The Vercel preview inherits the official R2 credentials. All writes must
  // fail closed until a separate QA R2 store has been provisioned and reviewed.
  if (process.env.VERCEL_ENV === "preview" &&
      process.env.VITE_SIGAPRO_NEON_ISOLATED === "true" &&
      ["upload", "delete", "sign-get", "list-user-files", "master-logo-source", "profile-avatar-open"].includes(action)) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      error: "Armazenamento de homologação indisponível: acesso ao R2 oficial bloqueado para proteger documentos municipais.",
      code: "QA_R2_WRITE_DISABLED",
    }));
    return;
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
