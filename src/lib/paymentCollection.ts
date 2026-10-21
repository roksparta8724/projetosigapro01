import { buildPixPayload, isValidPixPayload } from "@/lib/pix";
import { bankDigits, normalizeOfficialBanking } from "@/lib/bankCodes";
import type { PaymentGuideEntry, TenantSettings } from "@/lib/platform";

export function normalizeMunicipalPixKey(
  value: string | null | undefined,
  type: TenantSettings["pixKeyType"],
) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (type === "cpf" || type === "cnpj") {
    return raw.replace(/\D/g, "");
  }
  if (type === "phone") {
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+")) return `+${digits}`;
    if (digits.startsWith("55")) return `+${digits}`;
    return digits ? `+55${digits}` : "";
  }
  return raw;
}

export function validateMunicipalPixKey(
  value: string | null | undefined,
  type: TenantSettings["pixKeyType"] = "random",
) {
  const normalized = normalizeMunicipalPixKey(value, type);
  if (!normalized) {
    return { valid: false, normalized, message: "Informe a chave PIX." };
  }

  if (type === "cpf") {
    return {
      valid: /^\d{11}$/.test(normalized),
      normalized,
      message: "A chave PIX do tipo CPF deve conter 11 dígitos.",
    };
  }
  if (type === "cnpj") {
    return {
      valid: /^\d{14}$/.test(normalized),
      normalized,
      message: "A chave PIX do tipo CNPJ deve conter 14 dígitos.",
    };
  }
  if (type === "email") {
    return {
      valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 77,
      normalized,
      message: "Informe um e-mail válido para a chave PIX.",
    };
  }
  if (type === "phone") {
    return {
      valid: /^\+55\d{10,11}$/.test(normalized),
      normalized,
      message: "Informe o telefone PIX com DDD; o sistema usa o padrão +55.",
    };
  }

  return {
    valid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(normalized),
    normalized,
    message: "A chave aleatória PIX deve ser uma chave UUID válida.",
  };
}

export function normalizeBankBarcode(value?: string | null) {
  const digits = bankDigits(value);
  return /^\d{44}$/.test(digits) ? digits : "";
}

export function normalizeDigitableLine(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 47 || digits.length === 48 ? digits : "";
}

export function collectionModeLabel(mode?: TenantSettings["bankCollectionMode"]) {
  if (mode === "agreement") return "Convênio bancário";
  if (mode === "api") return "Integração bancária por API";
  return "PIX e baixa municipal";
}

export function isMunicipalPixReady(settings?: TenantSettings | null) {
  return Boolean(
    settings?.pixEnabled !== false &&
      settings?.chavePix?.trim() &&
      settings?.beneficiarioArrecadacao?.trim(),
  );
}

export function isMunicipalBankIdentified(settings?: TenantSettings | null) {
  return Boolean(settings?.bankCode?.trim() && settings?.bankName?.trim());
}

export function isBankBarcodeIntegrationReady(settings?: TenantSettings | null) {
  if (!settings) return false;
  if (settings.bankCollectionMode === "api") {
    return isMunicipalBankIdentified(settings);
  }
  if (settings.bankCollectionMode === "agreement") {
    return Boolean(
      isMunicipalBankIdentified(settings) &&
        settings.bankAgreementCode?.trim(),
    );
  }
  return false;
}

function resolvePixTxid(guide: Pick<PaymentGuideEntry, "code">) {
  const txid = String(guide.code || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-25);
  return txid || "***";
}

export function buildGuidePixPayload(input: {
  settings?: TenantSettings | null;
  guide: Pick<PaymentGuideEntry, "code" | "amount" | "pixPayload">;
  municipalityName?: string | null;
  municipalityCity?: string | null;
}) {
  if (isValidPixPayload(input.guide.pixPayload)) {
    return input.guide.pixPayload!.trim();
  }

  const settings = input.settings;
  if (!isMunicipalPixReady(settings)) return "";

  const pixKey = normalizeMunicipalPixKey(settings?.chavePix, settings?.pixKeyType ?? "random");
  const validation = validateMunicipalPixKey(pixKey, settings?.pixKeyType ?? "random");
  if (!validation.valid) return "";

  return buildPixPayload({
    key: validation.normalized,
    merchantName:
      settings?.beneficiarioArrecadacao ||
      input.municipalityName ||
      "PREFEITURA MUNICIPAL",
    merchantCity:
      settings?.pixMerchantCity ||
      input.municipalityCity ||
      "MUNICIPIO",
    amount: Number(input.guide.amount || 0),
    txid: resolvePixTxid(input.guide),
  });
}

export function resolveGuideBankingData(input: {
  settings?: TenantSettings | null;
  guide: PaymentGuideEntry;
  municipalityName?: string | null;
  municipalityCity?: string | null;
}) {
  const official = normalizeOfficialBanking(input.guide.barcode, input.guide.digitableLine);
  return {
    pixPayload: buildGuidePixPayload(input),
    barcode: official.barcode,
    digitableLine: official.digitableLine,
    bankName: input.settings?.bankName?.trim() || "",
    bankAgreement: input.settings?.bankAgreementCode?.trim() || "",
    bankInstructions: input.settings?.bankInstructions?.trim() || "",
    collectionMode: input.settings?.bankCollectionMode ?? "manual",
  };
}
