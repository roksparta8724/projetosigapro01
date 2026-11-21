import type { SessionUser, UserRole, AccountStatus } from "@/lib/platform";

/**
 * Only a server-verified, authenticated municipal administrator may receive this
 * registry. It is display data, never a source for granting route permissions.
 */
export interface VerifiedMunicipalUserRegistry {
  municipalityId: string;
  users: SessionUser[];
}

const MUNICIPAL_ROLES = new Set<UserRole>([
  "prefeitura_admin", "prefeitura_supervisor", "analista", "financeiro",
  "setor_intersetorial", "fiscal", "profissional_externo",
  "property_owner", "proprietario_consulta",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function humanDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "";
}

export function parseVerifiedMunicipalUserRegistry(value: unknown): VerifiedMunicipalUserRegistry | null {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("O banco retornou uma resposta inválida para os usuários municipais.");
  }
  const response = parsed as Record<string, unknown>;
  if (response.verified === false) return null;
  const municipalityId = text(response.municipalityId);
  if (response.verified !== true || !UUID.test(municipalityId) || !Array.isArray(response.users)) {
    throw new Error("Não foi possível confirmar a Prefeitura dos cadastros.");
  }
  const seen = new Set<string>();
  const users: SessionUser[] = response.users.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Cadastro municipal incompleto.");
    }
    const row = entry as Record<string, unknown>;
    const id = text(row.id);
    const rowMunicipality = text(row.municipalityId);
    const roleCode = text(row.role);
    const status = text(row.accountStatus);
    if (!UUID.test(id) || rowMunicipality !== municipalityId ||
        !MUNICIPAL_ROLES.has(roleCode as UserRole) ||
        !["active", "blocked", "inactive"].includes(status) || seen.has(id)) {
      throw new Error("O cadastro retornou um perfil de outra Prefeitura, desconhecido ou duplicado.");
    }
    seen.add(id);
    const role = roleCode as UserRole;
    const level = Number(row.accessLevel);
    const accessLevel: 1 | 2 | 3 = level === 2 || level === 3 ? level : 1;
    const external = ["profissional_externo", "property_owner", "proprietario_consulta"].includes(role);
    return {
      id,
      name: text(row.name) || text(row.email) || "Usuário",
      email: text(row.email),
      role,
      accessLevel,
      municipalityId,
      tenantId: municipalityId,
      title: text(row.title),
      profileLabel: text(row.profileLabel),
      department: text(row.department),
      userType: external ? "Externo" : "Interno",
      accountStatus: status as AccountStatus,
      createdAt: humanDate(row.createdAt),
      lastAccessAt: humanDate(row.lastAccessAt),
      blockedAt: text(row.blockedAt) || null,
      blockReason: text(row.blockReason) || null,
      deletedAt: null,
    };
  });
  return { municipalityId, users };
}

/**
 * Preserve visibility granted by the scoped, server-verified registry. Never
 * combine rows from a different municipality or use this list for auth grants.
 */
export function reconcileVerifiedMunicipalUsers(
  previous: SessionUser[],
  verified: VerifiedMunicipalUserRegistry | null,
): SessionUser[] {
  if (!verified) return previous;
  const result = [...previous];
  for (const user of verified.users) {
    const index = result.findIndex((candidate) =>
      candidate.id === user.id &&
      (candidate.municipalityId ?? candidate.tenantId) === verified.municipalityId);
    if (index === -1) result.push(user);
    else result[index] = { ...result[index], ...user };
  }
  return result;
}
