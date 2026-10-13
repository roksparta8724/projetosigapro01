export type AuthUserLike = {
  id?: string | null;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type PendingSignup = {
  tenantId: string;
  role: "profissional_externo" | "property_owner";
  fullName: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  rg: string;
  birthDate: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  professionalType: string;
  registrationNumber: string;
  companyName: string;
  title: string;
  bio: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PENDING_SIGNUP_PREFIX = "sigapro.pending-signup.v2:";
const PENDING_SIGNUP_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

type StoredPendingSignup = PendingSignup & { savedAt: number };

function pendingSignupStorageKey(email: string) {
  return `${PENDING_SIGNUP_PREFIX}${email.trim().toLowerCase()}`;
}

export function writePendingSignup(pending: PendingSignup) {
  if (typeof window === "undefined") return;
  const email = pending.email.trim().toLowerCase();
  if (!email || !UUID.test(pending.tenantId)) return;

  try {
    const payload: StoredPendingSignup = {
      ...pending,
      email,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(pendingSignupStorageKey(email), JSON.stringify(payload));
  } catch {
    // O cadastro continua; o backend/auth ainda pode concluir pela metadata.
  }
}

export function clearPendingSignup(email: string | null | undefined) {
  if (typeof window === "undefined" || !email) return;
  try {
    window.localStorage.removeItem(pendingSignupStorageKey(email));
  } catch {
    // noop
  }
}

function readStoredPendingSignup(email: string): PendingSignup | null {
  if (typeof window === "undefined" || !email) return null;
  try {
    const raw = window.localStorage.getItem(pendingSignupStorageKey(email));
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredPendingSignup>;
    if (
      typeof stored.savedAt !== "number" ||
      Date.now() - stored.savedAt > PENDING_SIGNUP_MAX_AGE_MS ||
      !UUID.test(String(stored.tenantId || "")) ||
      (stored.role !== "profissional_externo" && stored.role !== "property_owner")
    ) {
      window.localStorage.removeItem(pendingSignupStorageKey(email));
      return null;
    }

    return {
      tenantId: String(stored.tenantId),
      role: stored.role,
      fullName: String(stored.fullName || ""),
      email,
      cpfCnpj: String(stored.cpfCnpj || ""),
      phone: String(stored.phone || ""),
      rg: String(stored.rg || ""),
      birthDate: String(stored.birthDate || ""),
      addressLine: String(stored.addressLine || ""),
      addressNumber: String(stored.addressNumber || ""),
      addressComplement: String(stored.addressComplement || ""),
      neighborhood: String(stored.neighborhood || ""),
      city: String(stored.city || ""),
      state: String(stored.state || ""),
      zipCode: String(stored.zipCode || ""),
      professionalType: String(stored.professionalType || ""),
      registrationNumber: String(stored.registrationNumber || ""),
      companyName: String(stored.companyName || ""),
      title: String(stored.title || ""),
      bio: String(stored.bio || ""),
    };
  } catch {
    return null;
  }
}


export function readPendingSignup(
  user: Pick<AuthUserLike, "email" | "user_metadata">,
  existingRole: string | null,
  existingMunicipalityId: string | null,
): PendingSignup | null {
  if (existingMunicipalityId) return null;
  // O gatilho legado cria primeiro um perfil provisório como "profissional".
  if (existingRole && !["profissional", "profissional_externo", "property_owner"].includes(existingRole)) return null;

  const metadata = user.user_metadata ?? {};
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return null;

  const role = metadata.role;
  const tenantId = typeof metadata.tenant_id === "string" ? metadata.tenant_id.trim() : "";

  if (
    (role === "profissional_externo" || role === "property_owner") &&
    UUID.test(tenantId)
  ) {
    const read = (key: string) => typeof metadata[key] === "string" ? metadata[key].trim() as string : "";
    return {
      tenantId,
      role,
      fullName: read("full_name"),
      email,
      cpfCnpj: read("cpf_cnpj"),
      phone: read("phone"),
      rg: read("rg"),
      birthDate: read("birth_date"),
      addressLine: read("address_line"),
      addressNumber: read("address_number"),
      addressComplement: read("address_complement"),
      neighborhood: read("neighborhood"),
      city: read("city"),
      state: read("state"),
      zipCode: read("zip_code"),
      professionalType: read("professional_type"),
      registrationNumber: read("registration_number"),
      companyName: read("company_name"),
      title: read("title"),
      bio: read("bio"),
    };
  }

  // Neon Auth não garante persistência de todos os campos customizados enviados
  // no signUp. Mantemos uma cópia local temporária para concluir o vínculo após
  // a confirmação por e-mail, sem criar conta órfã.
  return readStoredPendingSignup(email);
}
