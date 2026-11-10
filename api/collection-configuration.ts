import { callDataApiRpc } from "../server/municipal-storage.js";
import { encryptMunicipalCollectionSecret, municipalCollectionSecretFingerprint } from "../server/municipal-payment.js";
import { getMunicipalCollectionAdapter, describeMunicipalCollectionAdapter } from "../server/municipal-collection-adapters.js";
import { parseCnab240CollectionReturn, compareCnabCandidateToGuide } from "../server/bank-return-cnab240.js";
import { readStoredGuide } from "../server/guide-persistence.js";
import { decryptPaymentAccessToken } from "../server/municipal-payment.js";

type Req = import("http").IncomingMessage & { method?: string; body?: Record<string, unknown> };
type Res = import("http").ServerResponse;
const json = (res: Res, status: number, body: unknown) => { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
async function body(req: Req) {
  // Preserve the bank-return file in memory only; reject oversized payloads before JSON parsing.
  const limit = 750_000;
  if (req.body && typeof req.body === "object") {
    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > limit) throw new Error("Arquivo bancário excede o tamanho permitido.");
    return req.body;
  }
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    let bytes = 0; let rejected = false; const chunks: Buffer[] = [];
    req.on("data", c => {
      if (rejected) return;
      const part = Buffer.from(c); bytes += part.length;
      if (bytes > limit) { rejected = true; req.pause(); reject(new Error("Arquivo bancário excede o tamanho permitido.")); return; }
      chunks.push(part);
    });
    req.on("end", () => { if (!rejected) { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } } });
    req.on("error", reject);
  });
}
function uuid(value: unknown) { const id = String(value || "").trim(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("Prefeitura inválida."); return id; }
async function rpc<T>(req: Req, fn: string, args: Record<string, unknown>) { const result = await callDataApiRpc<T>(req, fn, args); if (!result.ok) throw new Error(result.error || "Operação não autorizada."); return result.payload; }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });
  try {
    const input = await body(req); const municipalityId = uuid(input.municipalityId); const action = String(input.action || "get");
    if (action === "get") return json(res, 200, await rpc(req, "get_municipal_collection_configuration_v1", { _municipality_id: municipalityId }) || {});
    if (action === "effective") return json(res, 200, await rpc(req, "get_active_municipal_collection_configuration_v1", { _municipality_id: municipalityId }) || {});
    if (action === "provider_status") {
      // Verify this authenticated municipal admin using the existing SQL RLS/RPC.
      await rpc(req, "get_municipal_collection_configuration_v1", { _municipality_id: municipalityId });
      const supplierCode=String(input.supplierCode||"").trim().toLowerCase();
      if(!/^[a-z0-9_-]{1,64}$/.test(supplierCode))
        throw new Error("Identificador do banco/fornecedor inválido.");
      return json(res,200,describeMunicipalCollectionAdapter(supplierCode));
    }
    if (action === "govbr_read_preview") {
      // Authenticated municipal payment administrator only. Database RPC never
      // exposes this decrypted secret to the browser or an unrelated tenant.
      const config = await rpc<Record<string, unknown>>(
        req, "get_municipal_collection_secret_admin_v1",
        { _municipality_id: municipalityId },
      );
      if (!config || config.municipality_id !== municipalityId ||
          config.mode !== "municipal_system" || config.supplier_code !== "govbr_ar" ||
          config.integration_type !== "automatic" ||
          !["homologation", "validated"].includes(String(config.status || "")) ||
          !["test", "production"].includes(String(config.environment || "")) ||
          typeof config.secret_ciphertext !== "string" || !config.secret_ciphertext)
        throw new Error("Configure a API GOVBR/AR para esta Prefeitura antes de testar a leitura.");
      if (config.environment === "production" && process.env.VERCEL_ENV !== "production")
        throw new Error("Consultas GOVBR de produção não podem ser executadas pela homologação isolada do SIGAPRO.");
      const adapter = getMunicipalCollectionAdapter("govbr_ar");
      if (!adapter) throw new Error("Conector de leitura GOVBR/AR indisponível.");
      const read = await adapter.execute("query", {
        municipalityId, environment: config.environment as "test" | "production",
        baseUrl: String(config.api_base_url || ""),
        secret: decryptPaymentAccessToken(config.secret_ciphertext),
        parameters: config.public_parameters && typeof config.public_parameters === "object" &&
          !Array.isArray(config.public_parameters) ? config.public_parameters as Record<string, unknown> : {},
      }, {});
      // Only anonymized metadata returns. No provider payload, secret or payer data.
      return json(res, 200, read);
    }
    if (action === "bank_get") return json(res, 200, await rpc(req, "get_municipal_collection_bank_details_v1", { _municipality_id: municipalityId }) || {});
    if (action === "bank_return_preview") {
      // Strictly read-only. No guide is marked paid and no CNAB bytes are logged or stored.
      // The existing RPC applies user + municipality authorization before the file is interpreted.
      await rpc(req, "get_municipal_collection_configuration_v1", { _municipality_id: municipalityId });
      const bank = await rpc<Record<string, unknown>>(
        req, "get_municipal_collection_bank_details_v1", { _municipality_id: municipalityId },
      );
      const bankCode = String(bank?.bankCode || "").trim();
      if (!/^[0-9]{3}$/.test(bankCode) || bankCode === "000")
        throw new Error("Configure primeiro o código oficial do banco arrecadador desta Prefeitura.");
      if (typeof input.fileContent !== "string" || Buffer.byteLength(input.fileContent, "utf8") > 600_000)
        throw new Error("Envie um arquivo CNAB240 de texto com até 600 KB.");
      const preview = parseCnab240CollectionReturn(input.fileContent, {
        expectedBankCode: bankCode, maxEntries: 100,
      });
      const guideCode = typeof input.guideCode === "string" ? input.guideCode.trim() : "";
      if (guideCode && !/^[a-zA-Z0-9_-]{1,120}$/.test(guideCode))
        throw new Error("Número da guia inválido.");
      if (!guideCode) return json(res, 200, preview);
      // A comparison requires the live municipality-scoped Neon guide, never an arbitrary
      // guide/amount supplied by the browser. This still grants ZERO settlement authority.
      const guide = await readStoredGuide(req, municipalityId, guideCode);
      const matches = preview.entries.map(entry => compareCnabCandidateToGuide(entry, guide));
      return json(res, 200, { ...preview, guideCode,
        guideComparison: matches,
        independentBankProofRequired: true,
      });
    }
    if (action === "bank_save") {
      const fields = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? input.fields : null;
      if (!fields) throw new Error("Dados bancários inválidos.");
      return json(res, 200, await rpc(req, "save_municipal_collection_bank_details_v1", { _municipality_id: municipalityId, _fields: fields }) || {});
    }
    if (action === "save") {
      const mode = String(input.mode || "sigapro"); const integrationType = String(input.integrationType || "automatic");
      if (!['sigapro','municipal_system'].includes(mode) || !['automatic','controlled_import'].includes(integrationType)) throw new Error("Modalidade de arrecadação inválida.");
      const secret = String(input.secret || "").trim();
      let capabilities = input.capabilities && typeof input.capabilities === "object" && !Array.isArray(input.capabilities)
        ? { ...(input.capabilities as Record<string, unknown>) }
        : {};
      if (mode === "municipal_system" && integrationType === "automatic") {
        const adapter = getMunicipalCollectionAdapter(String(input.supplierCode || ""));
        // The administrator selects a provider, never grants capabilities.
        // Unimplemented suppliers are draft-only and must not collect tokens.
        // Operational flags are derived exclusively from certified adapters.
        if (!adapter) {
          if (secret) throw new Error("Não envie credenciais: este fornecedor ainda não tem conector automático homologado. Use importação controlada.");
          capabilities = { query:false, pdf:false, payment:false, reissue:false, cancel:false };
        } else {
          capabilities = Object.fromEntries(
            (["query","pdf","payment","reissue","cancel"] as const)
              .map(operation => [operation, capabilities[operation] === true && adapter.operations.includes(operation)])
          );
        }
      }
      if (mode === "sigapro") {
        // Capabilities belong to the ACTIVE municipal provider, not the UI
        // checkboxes. Manual/unknown banks must never advertise bank callbacks.
        const payment = await rpc<Record<string, unknown>>(
          req, "get_municipal_payment_connection_v1", { _municipality_id: municipalityId },
        );
        if (payment?.provider !== "mercado_pago" ||
            payment?.status !== "active" ||
            payment?.environment !== (input.environment === "production" ? "production" : "test")) {
          capabilities = { ...capabilities, query: false, payment: false, reissue: false, cancel: false };
        }
      }
      const saved = await rpc(req, "save_municipal_collection_configuration_v1", {
        _municipality_id: municipalityId, _mode: mode, _supplier_code: String(input.supplierCode || "").trim().toLowerCase(),
        _supplier_name: String(input.supplierName || "").trim(), _api_base_url: String(input.apiBaseUrl || "").trim(),
        _environment: input.environment === "production" ? "production" : "test", _integration_type: integrationType,
        _secret_ciphertext: secret ? encryptMunicipalCollectionSecret(secret) : null,
        _secret_fingerprint: secret ? municipalCollectionSecretFingerprint(secret) : null,
        _public_parameters: input.publicParameters && typeof input.publicParameters === "object" ? input.publicParameters : {},
        _capabilities: capabilities,
      });
      return json(res, 200, saved || {});
    }
    if (action === "validate") {
      const config = await rpc<Record<string, unknown> & { capabilities?: { query?: boolean; payment?: boolean } }>(req, "get_municipal_collection_secret_admin_v1", { _municipality_id: municipalityId });
      if (!config) throw new Error("Configuração não encontrada.");
      if (config.mode === "sigapro") {
        const provider = await rpc<Record<string, unknown>>(req, "get_municipal_payment_connection_v1", { _municipality_id: municipalityId });
        if (provider?.status !== "active") throw new Error("Ative e teste o provedor da Guia SIGAPRO antes de validar a modalidade.");
        if (provider.environment !== config.environment) {
          throw new Error("Ambientes incompatíveis: a modalidade SIGAPRO e o provedor bancário devem usar a mesma homologação ou produção.");
        }
        if (provider.provider === "bank_direct") {
          throw new Error("Integração bancária direta ainda não possui adaptador de emissão homologado no SIGAPRO.");
        }
        const automated = Boolean(config.capabilities?.query || config.capabilities?.payment);
        if (provider.provider === "manual" && automated) {
          throw new Error("PIX/baixa manual não oferece consulta bancária nem confirmação automática. Desative essas capacidades ou conecte um provedor homologado.");
        }
        if (!["manual", "mercado_pago"].includes(String(provider.provider || ""))) {
          throw new Error("Provedor bancário não homologado para emissão de guias.");
        }
        if (config.environment === "production") {
          const bank = await rpc<Record<string, unknown>>(req, "get_municipal_collection_bank_details_v1", { _municipality_id: municipalityId });
          const document = String(bank?.bankBeneficiaryDocument || "").replace(/\D/g, "");
          if (!/^\d{14}$/.test(document) || !String(bank?.beneficiarioArrecadacao || "").trim()) {
            throw new Error("Produção bloqueada: informe o CNPJ e o beneficiário oficial da conta arrecadadora da Prefeitura.");
          }
        }
        const validated = await rpc(req, "mark_municipal_collection_validation_v1", {
          _municipality_id: municipalityId, _ok: true,
          _message: provider.provider === "manual"
            ? "PIX/baixa manual conferidos apenas para fluxo manual, sem consulta ou compensação automática."
            : "Provedor Mercado Pago ativo no mesmo ambiente; homologação de cobrança real e conferência de titularidade continuam obrigatórias.",
        });
        return json(res, 200, validated || {});
      }
      if (config.integration_type === "controlled_import") {
        const validated = await rpc(req, "mark_municipal_collection_validation_v1", { _municipality_id: municipalityId, _ok: true, _message: "Configuração de importação controlada verificada. A operação com R2/Neon precisa de homologação prática; nenhuma API do fornecedor foi testada." });
        return json(res, 200, validated || {});
      }
      const adapter = getMunicipalCollectionAdapter(String(config.supplier_code || ""));
      if (!adapter) throw new Error("Fornecedor ainda sem adaptador homologado no SIGAPRO. A configuração permanecerá pendente.");
      if (config.supplier_code === "govbr_ar") throw new Error("GOVBR/AR possui apenas consulta GET de diagnóstico. Utilize Testar leitura GOVBR; não é possível habilitar emissão ou baixa financeira.");
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na configuração de arrecadação.";
    const unauthorized = /jwk\s+not\s+found|jwt|jwks|invalid\s+token|invalid\s+signature|autentica[cç][aã]o necess[aá]ria|unauthorized/i.test(message);
    const schemaMissing = /PGRST202|PGRST205|schema\s+cache|function\s+.*does\s+not\s+exist|relation\s+.*does\s+not\s+exist/i.test(message);
    json(res, unauthorized ? 401 : schemaMissing ? 503 : 400, { error: message });
  }
}
