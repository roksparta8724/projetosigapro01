import type { IncomingMessage, ServerResponse } from "node:http";
import { callDataApiRpc, readBearer } from "../server/municipal-storage.js";
import { isMunicipalityUuid, summarizeUrbanLegalReadiness } from "../server/urban-legal-readiness.js";

type Req = IncomingMessage & { method?: string };
type Res = ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}
function sameOrigin(req: Req): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  try {
    const url = new URL(origin);
    return Boolean(host) && url.host.toLowerCase() === host.toLowerCase() &&
      (url.protocol === "https:" || (url.protocol === "http:" && /^localhost(?::|$)/i.test(host)));
  } catch { return false; }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") return json(res, 405, { error: "Método não permitido." });
  if (!sameOrigin(req)) return json(res, 403, { error: "Origem de acesso não autorizada." });
  if (!readBearer(req)) return json(res, 401, { error: "Sessão SIGAPRO necessária." });

  // The account, tenant and role must come from a verified Neon JWT.
  // Never accept municipality_id from URL, body or request headers.
  const profile = await callDataApiRpc<Record<string, unknown>>(req, "get_current_profile_context", {});
  if (!profile.ok) return json(res, profile.status === 401 ? 401 : 403, { error: "Sessão sem autorização." });
  const identity = profile.payload;
  if (!identity || !isMunicipalityUuid(identity.profile_id) ||
    identity.account_status !== "active" || identity.deleted_at ||
    identity.is_master === true || !isMunicipalityUuid(identity.municipality_id) ||
    (identity.tenant_id !== null && identity.tenant_id !== undefined &&
      identity.tenant_id !== identity.municipality_id)) {
    return json(res, 403, { error: "Somente usuários internos de uma prefeitura podem consultar a base legal." });
  }
  const municipalityId = identity.municipality_id;
  const [rules, evidence] = await Promise.all([
    callDataApiRpc<unknown>(req, "list_urban_regulation_versions_v1", { _municipality_id: municipalityId }),
    callDataApiRpc<unknown>(req, "list_urban_legal_evidence_v2", { _municipality_id: municipalityId }),
  ]);
  // Both RPCs independently enforce internal municipal role and tenant access.
  if (!rules.ok || !evidence.ok) return json(res,
    rules.status === 401 || evidence.status === 401 ? 401 :
      rules.status === 403 || evidence.status === 403 ? 403 : 503,
    { error: "Acervo legal indisponível ou sem autorização para este perfil." });
  try {
    const readiness = summarizeUrbanLegalReadiness(
      rules.payload, evidence.payload, municipalityId, new Date().toISOString().slice(0, 10),
    );
    return json(res, 200, {
      ...readiness,
      source: "neon_verified_municipal_records",
      automatedCompliance: false,
      cloudflareTransmission: false,
    });
  } catch {
    return json(res, 503, { error: "Dados do acervo municipal inconsistentes; nenhuma norma foi aplicada." });
  }
}
