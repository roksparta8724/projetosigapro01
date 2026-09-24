import type { User } from "@supabase/supabase-js";

export type PendingSignup = {
  tenantId: string;
  role: "profissional_externo" | "property_owner";
  fullName: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  professionalType: string;
  registrationNumber: string;
  companyName: string;
  title: string;
  bio: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readPendingSignup(
  user: Pick<User, "email" | "user_metadata">,
  existingRole: string | null,
  existingMunicipalityId: string | null,
): PendingSignup | null {
  if (existingMunicipalityId) return null;
  if (existingRole && existingRole !== "profissional_externo" && existingRole !== "property_owner") return null;

  const metadata = user.user_metadata ?? {};
  const role = metadata.role;
  const tenantId = typeof metadata.tenant_id === "string" ? metadata.tenant_id.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if ((role !== "profissional_externo" && role !== "property_owner") || !UUID.test(tenantId) || !email) return null;

  const read = (key: string) => typeof metadata[key] === "string" ? metadata[key].trim() as string : "";
  return {
    tenantId,
    role,
    fullName: read("full_name"),
    email,
    cpfCnpj: read("cpf_cnpj"),
    phone: read("phone"),
    professionalType: read("professional_type"),
    registrationNumber: read("registration_number"),
    companyName: read("company_name"),
    title: read("title"),
    bio: read("bio"),
  };
}
