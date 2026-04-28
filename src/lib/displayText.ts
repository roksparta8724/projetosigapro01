type DisplayTextType = "email" | "name" | "role" | "municipality" | "label" | "generic";

type FormatDisplayTextOptions = {
  fallback?: string;
  maxLength?: number;
};

const ROLE_LABELS: Record<string, string> = {
  profissional_externo: "Profissional Externo",
  administrador: "Administrador",
  analista: "Analista Técnico",
  master_admin: "Administrador Geral",
  master_ops: "Operação Geral",
  prefeitura_admin: "Administrador da Prefeitura",
  prefeitura_supervisor: "Supervisor da Prefeitura",
  financeiro: "Financeiro Municipal",
  setor_intersetorial: "Setor Intersetorial",
  fiscal: "Fiscalização e Postura",
  property_owner: "Proprietário do Imóvel",
  proprietario_consulta: "Proprietário do Imóvel",
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function titleCaseWords(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const safeLimit = Math.max(4, maxLength - 3);
  const sliced = value.slice(0, safeLimit);
  const lastSpace = sliced.lastIndexOf(" ");
  const candidate = lastSpace > safeLimit * 0.55 ? sliced.slice(0, lastSpace) : sliced;
  return `${candidate.trimEnd()}...`;
}

function truncateEmail(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  const [localPartRaw, domainRaw] = value.split("@");
  if (!localPartRaw || !domainRaw) return truncateText(value, maxLength);

  const domain = domainRaw.trim();
  const availableForLocal = Math.max(6, maxLength - domain.length - 4);
  const localPart = localPartRaw.slice(0, availableForLocal).trimEnd();

  if (`${localPart}...@${domain}`.length <= maxLength) {
    return `${localPart}...@${domain}`;
  }

  const trimmedDomain = truncateText(domain, Math.max(8, maxLength - localPart.length - 4));
  return `${localPart}...@${trimmedDomain}`;
}

export function humanizeRoleLabel(value: string | null | undefined, fallback = "Não informado") {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  const mapped = ROLE_LABELS[normalized.toLowerCase()];
  if (mapped) return mapped;

  if (/[_-]/.test(normalized)) {
    return titleCaseWords(normalized.replace(/[_-]+/g, " "));
  }

  return normalized;
}

export function formatDisplayText(
  value: string | null | undefined,
  type: DisplayTextType,
  options: FormatDisplayTextOptions = {},
) {
  const fallback = options.fallback ?? "Não informado";
  const normalized = normalizeText(value);

  if (!normalized) return fallback;

  if (type === "role") {
    return truncateText(humanizeRoleLabel(normalized, fallback), options.maxLength ?? 28);
  }

  if (type === "email") {
    return truncateEmail(normalized.toLowerCase(), options.maxLength ?? 30);
  }

  if (type === "name") {
    return truncateText(normalized, options.maxLength ?? 30);
  }

  if (type === "municipality") {
    return truncateText(normalized, options.maxLength ?? 44);
  }

  if (type === "label") {
    return truncateText(normalized, options.maxLength ?? 24);
  }

  return truncateText(normalized, options.maxLength ?? 36);
}
