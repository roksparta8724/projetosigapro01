export function normalizeCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatCpf(value: string) {
  const digits = normalizeCpf(value);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  for (const position of [9, 10]) {
    const weightedSum = digits
      .slice(0, position)
      .split("")
      .reduce((sum, digit, index) => sum + Number(digit) * (position + 1 - index), 0);
    const remainder = (weightedSum * 10) % 11;
    if (Number(digits[position]) !== (remainder === 10 ? 0 : remainder)) return false;
  }

  return true;
}
