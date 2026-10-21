import { callDataApiRpc } from "../server/municipal-storage";
import { encryptMunicipalCollectionSecret, municipalCollectionSecretFingerprint } from "../server/municipal-payment";
import { getMunicipalCollectionAdapter } from "../server/municipal-collection-adapters";

type Req = import("http").IncomingMessage & { method?: string; body?: Record<string, unknown> };
type Res = import("http").ServerResponse;
const json = (res: Res, status: number, body: unknown) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
async function body(req: Req) { if (req.body && typeof req.body === "object") return req.body; return await new Promise<Record<string, unknown>>((resolve, reject) => { const chunks: Buffer[] = []; req.on("data", c => chunks.push(Buffer.from(c))); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } }); req.on("error", reject); }); }
function uuid(value: unknown) { const id = String(value || "").trim(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("Prefeitura inválida."); return id; }
async function rpc<T>(req: Req, fn: string, args: Record<string, unknown>) { const result = await callDataApiRpc<T>(req, fn, args); if (!result.ok) throw new Error(result.error || "Operação não autorizada."); return result.payload; }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });
  try {
    const input = await body(req); const municipalityId = uuid(input.municipalityId); const action = String(input.action || "get");
    if (action === "get") return json(res, 200, await rpc(req, "get_municipal_collection_configuration_v1", { _municipality_id: municipalityId }) || {});
    if (action === "effective") return json(res, 200, await rpc(req, "get_active_municipal_collection_configuration_v1", { _municipality_id: municipalityId }) || {});
    if (action === "save") {
      const mode = String(input.mode || "sigapro"); const integrationType = String(input.integrationType || "automatic");
      if (!['sigapro','municipal_system'].includes(mode) || !['automatic','controlled_import'].includes(integrationType)) throw new Error("Modalidade de arrecadação inválida.");
      const secret = String(input.secret || "").trim();
      const saved = await rpc(req, "save_municipal_collection_configuration_v1", {
        _municipality_id: municipalityId, _mode: mode, _supplier_code: String(input.supplierCode || "").trim().toLowerCase(),
        _supplier_name: String(input.supplierName || "").trim(), _api_base_url: String(input.apiBaseUrl || "").trim(),
        _environment: input.environment === "production" ? "production" : "test", _integration_type: integrationType,
        _secret_ciphertext: secret ? encryptMunicipalCollectionSecret(secret) : null,
        _secret_fingerprint: secret ? municipalCollectionSecretFingerprint(secret) : null,
        _public_parameters: input.publicParameters && typeof input.publicParameters === "object" ? input.publicParameters : {},
        _capabilities: input.capabilities && typeof input.capabilities === "object" ? input.capabilities : {},
      });
      return json(res, 200, saved || {});
    }
    if (action === "validate") {
      const config = await rpc<Record<string, any>>(req, "get_municipal_collection_secret_admin_v1", { _municipality_id: municipalityId });
      if (!config) throw new Error("Configuração não encontrada.");
      if (config.mode === "sigapro") {
        const provider = await rpc<Record<string, any>>(req, "get_municipal_payment_connection_v1", { _municipality_id: municipalityId });
        if (provider?.status !== "active") throw new Error("Ative e teste o provedor da Guia SIGAPRO antes de validar a modalidade.");
        const validated = await rpc(req, "mark_municipal_collection_validation_v1", { _municipality_id: municipalityId, _ok: true, _message: "Provedor da Guia SIGAPRO já validado e ativo para esta Prefeitura." });
        return json(res, 200, validated || {});
      }
      if (config.integration_type === "controlled_import") {
        const validated = await rpc(req, "mark_municipal_collection_validation_v1", { _municipality_id: municipalityId, _ok: true, _message: "Configuração de importação controlada verificada. A operação com R2/Neon precisa de homologação prática; nenhuma API do fornecedor foi testada." });
        return json(res, 200, validated || {});
      }
      const adapter = getMunicipalCollectionAdapter(String(config.supplier_code || ""));
      if (!adapter) throw new Error("Fornecedor ainda sem adaptador homologado no SIGAPRO. A configuração permanecerá pendente.");
      throw new Error("O adaptador existe, mas o teste real exige credenciais homologadas e execução específica do fornecedor.");
    }
    if (action === "attach") {
      const processId = uuid(input.processId);
      const document = input.document && typeof input.document === "object" && !Array.isArray(input.document)
        ? input.document : null;
      if (!document) throw new Error("Dados da guia municipal inválidos.");
      return json(res, 200, await rpc(req, "append_municipal_collection_guide_document_v1", {
        _municipality_id: municipalityId,
        _process_id: processId,
        _reference: String(input.reference || ""),
        _guide_kind: String(input.guideKind || ""),
        _document: document,
      }) || {});
    }
    if (action === "activate") return json(res, 200, await rpc(req, "activate_municipal_collection_configuration_v1", { _municipality_id: municipalityId }) || {});
    throw new Error("Ação de arrecadação inválida.");
  } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : "Falha na configuração de arrecadação." }); }
}
