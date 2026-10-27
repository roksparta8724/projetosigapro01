import { createHmac } from "node:crypto";
import { callDataApiRpc, readEnv, type ApiReq } from "./municipal-storage.js";
import type { MercadoPagoGuideBoletoResult } from "./mercadopago.js";
import { normalizeOfficialBanking } from "../src/lib/bankCodes.js";

export type StoredGuide = {
  id: string;
  municipality_id: string;
  process_id: string;
  guide_number: string;
  amount: number;
  due_date: string;
  created_at: string;
  status: string;
  paid?: boolean;
  bank_reference?: string;
  bank_payment_id?: string;
  bank_status?: string;
  bank_status_detail?: string;
  bank_authenticated_at?: string;
  payment_provider?: string;
  provider_environment?: "test" | "production";
  barcode?: string;
  digitable_line?: string;
  ticket_url?: string;
  collection_mode_snapshot?: "sigapro" | "municipal_system";
  collection_provider_snapshot?: string;
};

export async function readStoredGuide(req: ApiReq, municipalityId: string | undefined, guideCode: string) {
  if (!municipalityId || !guideCode) throw new Error("Prefeitura e número da guia são obrigatórios.");
  const result = await callDataApiRpc<StoredGuide>(req, "get_payment_guide_original_v1", {
    _municipality_id: municipalityId, _guide_code: guideCode,
  });
  if (!result.ok || !result.payload?.id) {
    throw new Error(result.error || "Guia não encontrada ou acesso não autorizado.");
  }
  return result.payload;
}

export async function assertGuideProviderWriteAccess(req: ApiReq, guide: StoredGuide, sandboxOnly = false) {
  if (guide.collection_mode_snapshot === "municipal_system") {
    throw new Error("Esta guia pertence ao sistema próprio de arrecadação da Prefeitura; o SIGAPRO não emitirá outra cobrança.");
  }
  const result = await callDataApiRpc(req, sandboxOnly
    ? "qa_authorize_payment_guide_charge_v1"
    : "authorize_payment_guide_charge_v1", {
    _municipality_id: guide.municipality_id, _guide_code: guide.guide_number,
  });
  if (!result.ok || result.payload !== true) throw new Error(result.error || "Sem permissão para preparar cobrança desta guia.");
}

export async function assertGuideProviderSyncAccess(req: ApiReq, guide: StoredGuide, sandboxOnly = false) {
  if (!guide.bank_reference) throw new Error("A guia não possui cobrança bancária vinculada.");
  const result = await callDataApiRpc(req, sandboxOnly
    ? "qa_authorize_payment_guide_provider_sync_v1"
    : "authorize_payment_guide_provider_sync_v1", {
    _municipality_id: guide.municipality_id,
    _guide_code: guide.guide_number,
    _bank_reference: guide.bank_reference,
  });
  if (!result.ok || result.payload !== true) throw new Error(result.error || "Sem permissão para atualizar a cobrança desta guia.");
}

export function storedGuideCharge(guide: StoredGuide): MercadoPagoGuideBoletoResult {
  const banking = normalizeOfficialBanking(guide.barcode, guide.digitable_line);
  const complete = Boolean(
    guide.bank_reference && guide.payment_provider === "mercado_pago" &&
    (guide.provider_environment === "test" || guide.provider_environment === "production") &&
    banking.barcode && banking.digitableLine,
  );
  return {
    ok: complete, environment: guide.provider_environment || "test",
    externalReference: guide.guide_number, amount: Number(guide.amount).toFixed(2),
    orderId: guide.bank_reference, paymentId: guide.bank_payment_id,
    status: guide.bank_status, statusDetail: guide.bank_status_detail,
    authenticatedAt: guide.bank_authenticated_at, barcodeContent: banking.barcode,
    digitableLine: banking.digitableLine, ticketUrl: guide.ticket_url,
    error: complete ? undefined : "Os dados bancários persistidos da guia ainda estão incompletos ou inconsistentes.",
  };
}


/** Only the API server signs a bank/provider reply. Browsers never receive the signing key. */
export function assertBankChargeAttestationReady(): string {
  const secret = readEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET");
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error("Assinatura bancária segura não configurada no servidor. A cobrança não será criada.");
  }
  return secret;
}

export function signVerifiedBankCharge(guide: StoredGuide, charge: MercadoPagoGuideBoletoResult) {
  if (!charge.ok || !charge.orderId || charge.externalReference !== guide.guide_number ||
      !Number.isFinite(Number(charge.amount)) ||
      Math.round(Number(charge.amount) * 100) !== Math.round(Number(guide.amount) * 100)) {
    throw new Error("Somente resposta bancária coerente com a guia pode ser assinada.");
  }
  const secret = assertBankChargeAttestationReady();
  const stamp = String(Math.floor(Date.now() / 1000));
  const fields = [
    "sigapro-charge-v1", guide.municipality_id, guide.guide_number,
    String(charge.externalReference || ""), String(charge.amount || ""),
    String(charge.orderId || ""), String(charge.environment || ""),
    String(charge.paymentId || ""), String(charge.status || ""),
    String(charge.statusDetail || ""), String(charge.authenticatedAt || ""),
    String(charge.barcodeContent || ""), String(charge.digitableLine || ""),
    String(charge.ticketUrl || ""), stamp,
  ];
  if (fields.some((value) => /[\r\n]/.test(value))) {
    throw new Error("Retorno bancário contém caracteres de controle inválidos.");
  }
  const signature = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(fields.join("\n"), "utf8").digest("hex");
  return { ...charge, __receipt_epoch: stamp, __receipt_mac: signature };
}

export async function persistGuideCharge(req: ApiReq, guide: StoredGuide, charge: MercadoPagoGuideBoletoResult, sandboxOnly = false) {
  if (!charge.orderId) throw new Error("A cobrança não retornou referência bancária persistível.");
  if (charge.externalReference !== guide.guide_number || !Number.isFinite(Number(charge.amount)) || Math.round(Number(charge.amount) * 100) !== Math.round(Number(guide.amount) * 100)) {
    throw new Error("A cobrança retornada não corresponde ao número e valor originais da guia.");
  }
  const saved = await callDataApiRpc(req, sandboxOnly
    ? "qa_persist_payment_guide_provider_charge_v1"
    : "persist_payment_guide_provider_charge_v2", {
    _municipality_id: guide.municipality_id, _guide_code: guide.guide_number,
    _charge: sandboxOnly ? charge : signVerifiedBankCharge(guide, charge),
  });
  if (!saved.ok) throw new Error(`Falha ao salvar dados bancários no Neon. ${saved.error}`);
  const persisted = saved.payload as StoredGuide | null;
  if (!persisted?.id || persisted.id !== guide.id || persisted.municipality_id !== guide.municipality_id ||
      persisted.guide_number !== guide.guide_number || persisted.bank_reference !== charge.orderId ||
      persisted.payment_provider !== "mercado_pago" || persisted.provider_environment !== charge.environment ||
      Math.round(Number(persisted.amount) * 100) !== Math.round(Number(guide.amount) * 100)) {
    throw new Error("O Neon não confirmou a persistência da cobrança na guia original.");
  }
  return storedGuideCharge(persisted);
}
