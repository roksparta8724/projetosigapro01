export function normalizeSignatureVerificationCode(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

export function buildPublicSignatureVerificationUrl(
  verificationCode: string | null | undefined,
) {
  const code = normalizeSignatureVerificationCode(verificationCode);
  if (!code) return "";

  const configuredOrigin = String(
    import.meta.env.VITE_PUBLIC_APP_URL || "https://sigapromunicipal.com.br",
  )
    .trim()
    .replace(/\/+$/, "");

  return `${configuredOrigin}/verificar-assinatura?codigo=${encodeURIComponent(code)}`;
}
