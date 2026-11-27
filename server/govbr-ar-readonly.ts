/**
 * GOVBR / Administração de Receitas — constrained read-only onboarding connector.
 *
 * NO vendor endpoint is guessed. A municipality must supply an officially authorized
 * HTTPS base URL, documented GET resource path and API credential. Public response data
 * is reduced to an anonymized shape preview: never logs or forwards raw tax records.
 *
 * This is intentionally NOT a charge-issuance, bank settlement or PDF integration.
 */
import type { MunicipalCollectionAdapter, MunicipalCollectionAdapterContext } from "./municipal-collection-adapters.js";

type AuthMode = "bearer" | "x-api-key";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function approvedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "govbr.com.br" || host.endsWith(".govbr.com.br") ||
    host === "govbr.cloud" || host.endsWith(".govbr.cloud");
}
export function govbrArReadSettings(context: MunicipalCollectionAdapterContext) {
  if (!uuid.test(context.municipalityId)) throw Error("Prefeitura não identificada para consulta GOVBR.");
  if (context.environment !== "test" && context.environment !== "production")
    throw Error("Ambiente GOVBR inválido.");
  if (!context.secret || context.secret.length < 8 || /[\r\n]/.test(context.secret))
    throw Error("Informe uma credencial GOVBR autorizada e protegida.");
  let base: URL;
  try { base = new URL(context.baseUrl); }
  catch { throw Error("Informe a URL HTTPS oficial da API GOVBR/AR."); }
  if (base.protocol !== "https:" || !approvedHost(base.hostname) || base.port && base.port !== "443" ||
      base.username || base.password || base.search || base.hash || base.pathname.includes(".."))
    throw Error("URL GOVBR/AR não permitida: utilize somente o domínio HTTPS oficial da fornecedora.");
  // RFC1918/local IP addresses and attacker-owned external domains are not accepted;
  // only vendor-owned DNS names are eligible for credential-bearing calls.
  const params = context.parameters?.govbrAr;
  if (!params || typeof params !== "object" || Array.isArray(params))
    throw Error("Informe a rota GET e o tipo de autenticação fornecidos pelo GOVBR.");
  const setup = params as Record<string, unknown>;
  const authMode = setup.authMode;
  const resourcePath = setup.readPath;
  if (authMode !== "bearer" && authMode !== "x-api-key")
    throw Error("Forma de autenticação GOVBR não configurada (Bearer ou X-Api-Key).");
  if (typeof resourcePath !== "string" || resourcePath.length < 2 || resourcePath.length > 160 ||
      !/^\/[A-Za-z0-9/_-]+$/.test(resourcePath) ||
      resourcePath.includes("//") || resourcePath.split("/").includes(".."))
    throw Error("Informe o caminho GET oficial (exemplo ilustrativo: /api/consulta).");
  const finalUrl = new URL(resourcePath.replace(/^\//, ""), base.origin + "/");
  if (!approvedHost(finalUrl.hostname) || finalUrl.origin !== base.origin)
    throw Error("A rota GET deve permanecer no domínio aprovado do GOVBR.");
  return { finalUrl, authMode: authMode as AuthMode };
}

export function govbrArResponseShape(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object")
    throw Error("A API retornou dados sem uma estrutura JSON compatível.");
  if (Array.isArray(input)) {
    return { kind: "array", recordCount: input.length, fields: Object.keys(
      input.find(x => x && typeof x === "object" && !Array.isArray(x)) || {}
    ).slice(0, 30).map(x => x.slice(0, 60)), exampleValuesExposed: false };
  }
  const root = input as Record<string, unknown>;
  const keys = Object.keys(root).slice(0, 30).map(x => x.slice(0, 60));
  const arrays = Object.entries(root).filter(([, v]) => Array.isArray(v)).slice(0, 10)
    .map(([key, value]) => ({ field: key.slice(0, 60), recordCount: (value as unknown[]).length }));
  return { kind: "object", fields: keys, arrays, exampleValuesExposed: false };
}

export const govbrArReadOnlyAdapter: MunicipalCollectionAdapter = {
  code: "govbr_ar",
  operations: ["query"] as const,
  async testConnection(context) {
    await this.execute("query", context, {});
    return { ok: true as const, message: "Conexão GET GOVBR respondeu em JSON. Estrutura reconhecida; nenhuma arrecadação foi confirmada." };
  },
  async execute(operation, context, payload) {
    if (operation !== "query" || Object.keys(payload).length !== 0)
      throw Error("GOVBR/AR: somente leitura de diagnóstico, sem emissão ou baixa financeira.");
    const { finalUrl, authMode } = govbrArReadSettings(context);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (authMode === "bearer") headers.Authorization = `Bearer ${context.secret}`;
    else headers["X-Api-Key"] = context.secret;
    let response: Response;
    try {
      response = await fetch(finalUrl, {
        method: "GET", headers, redirect: "manual", cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw Error("Não foi possível consultar a rota GOVBR/AR. Confira o endereço e a conectividade autorizada.");
    }
    if (response.status >= 300 && response.status < 400)
      throw Error("O GOVBR redirecionou a rota; a credencial não será encaminhada a outro endereço.");
    if (response.status === 401 || response.status === 403)
      throw Error("Credencial sem permissão para a rota de leitura informada.");
    if (!response.ok)
      throw Error("A API GOVBR/AR recusou a consulta GET (HTTP " + response.status + ").");
    const mime = response.headers.get("content-type") || "";
    if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(mime))
      throw Error("Esta rota GOVBR/AR não retornou JSON; a leitura requer adequação ao contrato técnico.");
    const maxBytes = 65_536;
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > maxBytes)
      throw Error("A resposta GOVBR é grande demais para o diagnóstico. Consulte uma rota paginada.");
    const reader = response.body?.getReader();
    if (!reader) throw Error("A API GOVBR retornou uma resposta vazia.");
    let total = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > maxBytes) throw Error("Resposta GOVBR excede 64 KB; utilize uma consulta paginada.");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const piece of chunks) { bytes.set(piece, offset); offset += piece.byteLength; }
    let data: unknown;
    try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw Error("A API GOVBR retornou JSON inválido."); }
    return {
      ok: true, supplierCode: "govbr_ar", method: "GET",
      readOnly: true, chargeIssuanceAvailable: false,
      automaticSettlementAvailable: false, pdfAvailable: false,
      ...govbrArResponseShape(data),
      caution: "Consulta técnica apenas. Dados do fornecedor não autenticam pagamentos, não geram guias e não liberam protocolo.",
    };
  },
};
