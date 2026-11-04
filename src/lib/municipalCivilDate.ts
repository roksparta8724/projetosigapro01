/**
 * Calendar day in a Brazilian municipality, not the UTC date of a Vercel
 * function. Default zone is Campo Limpo Paulista's America/Sao_Paulo.
 *
 * This default must be replaced by the municipality's verified IANA time
 * zone when a different municipality is onboarded. The civil date here is
 * advisory and may be explicitly selected by the analyst where applicable.
 */
export const SIGAPRO_DEFAULT_MUNICIPAL_TIME_ZONE = "America/Sao_Paulo";

export function municipalCivilDate(
  instant: Date = new Date(),
  timeZone: string = SIGAPRO_DEFAULT_MUNICIPAL_TIME_ZONE,
): string {
  if (!Number.isFinite(instant.getTime())) throw new Error("Data de referência inválida.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (part: string) => parts.find((item) => item.type === part)?.value;
  const yyyy = get("year");
  const mm = get("month");
  const dd = get("day");
  if (!yyyy || !mm || !dd) throw new Error("Data local indisponível.");
  return `${yyyy}-${mm}-${dd}`;
}

/** A calendar date already supplied without a time is not an UTC instant. */
export function municipalCivilDateFromValue(
  value: string | null | undefined,
  instant: Date = new Date(),
  timeZone: string = SIGAPRO_DEFAULT_MUNICIPAL_TIME_ZONE,
): string {
  if (!value) return municipalCivilDate(instant, timeZone);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? municipalCivilDate(parsed, timeZone) :
    municipalCivilDate(instant, timeZone);
}
