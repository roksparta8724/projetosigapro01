/** Nomes institucionais por prefeitura. Não conferem permissões por si. */
export const municipalPositionPresets = [
  { key: "diretor_urbanismo", defaultTitle: "Diretor de Urbanismo", area: "Urbanismo", role: "prefeitura_supervisor" },
  { key: "secretario_urbanismo", defaultTitle: "Secretário de Urbanismo", area: "Urbanismo", role: "prefeitura_supervisor" },
  { key: "secretario_financeiro", defaultTitle: "Secretário do Financeiro", area: "Financeiro", role: "prefeitura_supervisor" },
  { key: "diretor_financeiro", defaultTitle: "Diretor do Financeiro", area: "Financeiro", role: "prefeitura_supervisor" },
  { key: "diretor_administracao", defaultTitle: "Diretor da Administração", area: "Administração", role: "prefeitura_supervisor" },
  { key: "secretario_administracao", defaultTitle: "Secretário da Administração", area: "Administração", role: "prefeitura_supervisor" },
  { key: "diretor_ti", defaultTitle: "Diretor de TI", area: "Tecnologia da Informação", role: "prefeitura_admin" },
] as const;
export type MunicipalPositionKey = typeof municipalPositionPresets[number]["key"];
export type MunicipalPositionLabels = Partial<Record<MunicipalPositionKey, string>>;
export type MunicipalPositionAliases = Partial<Record<MunicipalPositionKey, string[]>>;

const allowedKeys = new Set<string>(municipalPositionPresets.map((item) => item.key));
function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
    .replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
export function normalizeMunicipalPositionLabels(value: unknown): MunicipalPositionLabels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const incoming = value as Record<string, unknown>;
  const out: MunicipalPositionLabels = {};
  for (const [key, name] of Object.entries(incoming)) {
    if (!allowedKeys.has(key) || typeof name !== "string") continue;
    const clean = name.replace(/[\x00-\x1f\x7f]/g, "").trim().replace(/\s+/g, " ");
    if (clean && clean.length <= 90) out[key as MunicipalPositionKey] = clean;
  }
  return out;
}
export function normalizeMunicipalPositionAliases(value: unknown): MunicipalPositionAliases {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const out: MunicipalPositionAliases = {};
  for (const entry of municipalPositionPresets) {
    const aliases = input[entry.key];
    if (Array.isArray(aliases)) out[entry.key] = aliases
      .filter((alias): alias is string => typeof alias === "string" && alias.length <= 90)
      .slice(-15);
  }
  return out;
}
export function getMunicipalPositionDisplayTitle(
  storedTitle: string | null | undefined,
  labels?: MunicipalPositionLabels | null,
  aliases?: MunicipalPositionAliases | null,
): string {
  const title = (storedTitle || "").trim();
  if (!title) return title;
  const match = municipalPositionPresets.find((item) =>
    [item.defaultTitle, labels?.[item.key], ...(aliases?.[item.key] || [])]
      .some((candidate) => Boolean(candidate && normalized(candidate) === normalized(title))),
  );
  return match ? labels?.[match.key] || match.defaultTitle : title;
}
export function getMunicipalPositionDefaults(): Record<MunicipalPositionKey, string> {
  return Object.fromEntries(municipalPositionPresets.map((item) => [item.key, item.defaultTitle]))
    as Record<MunicipalPositionKey, string>;
}

/** Modo de teste local: sem qualquer gravação em Neon/R2. */
const DEV_PREFIX = "sigapro:municipal-position-labels:local-v1:";
export function readLocalMunicipalPositionLabels(municipalityId: string | null | undefined): MunicipalPositionLabels {
  if (!import.meta.env.DEV || !municipalityId || typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(DEV_PREFIX + municipalityId);
    return stored ? normalizeMunicipalPositionLabels(JSON.parse(stored)) : {};
  } catch { return {}; }
}
export function writeLocalMunicipalPositionLabels(municipalityId: string, labels: MunicipalPositionLabels): void {
  if (!import.meta.env.DEV || typeof window === "undefined" || !municipalityId) {
    throw Error("A edição local está disponível somente no ambiente de desenvolvimento.");
  }
  window.localStorage.setItem(DEV_PREFIX + municipalityId, JSON.stringify(normalizeMunicipalPositionLabels(labels)));
  window.dispatchEvent(new CustomEvent("sigapro:municipal-positions-changed", { detail: { municipalityId } }));
}
