import type { ProcessRecord } from "@/lib/platform";

export type RegistryStatus = "ausente" | "incompleto" | "formato_invalido" | "formato_valido";

function validCpf(digits: string): boolean {
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const checksum = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce((total, number, index) => total + Number(number) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checksum(9) === Number(digits[9]) && checksum(10) === Number(digits[10]);
}

function validCnpj(digits: string): boolean {
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const checksum = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return checksum(12) === Number(digits[12]) && checksum(13) === Number(digits[13]);
}

/** Valida somente o formato e os dígitos verificadores. Não consulta CPF/CNPJ em cadastro oficial. */
export function validateBrazilianTaxId(value: string | null | undefined): RegistryStatus {
  const text = String(value ?? "").trim();
  if (!text) return "ausente";
  if (/[*•●]/.test(text)) return "incompleto";
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 11 && digits.length !== 14) return "formato_invalido";
  return (digits.length === 11 ? validCpf(digits) : validCnpj(digits))
    ? "formato_valido" : "formato_invalido";
}

export function hasRealRegistryValue(value: unknown): boolean {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return Boolean(normalized) && !["nao informado", "nao informada", "sem informacao", "indisponivel", "n/a", "-", "0"].includes(normalized);
}

export function getProcessRegistrationIssues(process: ProcessRecord, hasProfessionalRegistration: boolean): string[] {
  const issues: string[] = [];
  if (!hasRealRegistryValue(process.ownerName)) issues.push("Nome do proprietário não informado.");
  if (validateBrazilianTaxId(process.ownerDocument) !== "formato_valido") {
    issues.push("CPF/CNPJ do proprietário incompleto ou inválido no registro do processo.");
  }
  if (!hasRealRegistryValue(process.technicalLead)) issues.push("Responsável técnico não informado.");
  if (!hasProfessionalRegistration) issues.push("Registro do conselho profissional não vinculado ao cadastro consultado.");
  if (!hasRealRegistryValue(process.address)) issues.push("Endereço do imóvel não informado.");
  if (!hasRealRegistryValue(process.property.iptu)) issues.push("Inscrição imobiliária/IPTU não informada.");
  if (!hasRealRegistryValue(process.property.registration)) issues.push("Matrícula imobiliária não informada.");
  if (!hasRealRegistryValue(process.property.usage)) issues.push("Uso da edificação não informado.");
  if (!(Number(process.property.area) > 0)) issues.push("Área do imóvel não informada ou inválida.");
  return issues;
}
