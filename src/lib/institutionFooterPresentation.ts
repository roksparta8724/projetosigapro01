/** Presentation-only helpers for municipality footer. Never mutate official records. */
export function formatInstitutionPhone(raw: string): string {
  const value = raw.trim();
  if (!value || /não informado|nao informado|não cadastrado|nao cadastrado/i.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  if (national.length !== 10 && national.length !== 11) return value;
  const areaCode = national.slice(0, 2);
  const subscriber = national.slice(2);
  const formatted = subscriber.length === 9
    ? `${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
    : `${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
  return `${digits.length > 11 ? "+55 " : ""}(${areaCode}) ${formatted}`;
}

function normalizePlace(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

/** Avoid printing Campo Limpo Paulista/SP a second time after the full address. */
export function shouldRepeatInstitutionLocality(address: string, city: string): boolean {
  if (!city.trim()) return false;
  return !normalizePlace(address).includes(normalizePlace(city));
}

export function hasInstitutionEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
