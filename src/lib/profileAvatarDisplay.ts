/**
 * Fonte visual única da foto de um usuário, independente de preferências legadas
 * ou do componente onde ela é desenhada (perfil, topo, funcionários).
 *
 * O backend persiste imagens novas como `r2:objectKey`; o navegador deve abrir
 * a rota estável do SIGAPRO, não uma URL assinada temporária.
 */
type AvatarRecord = {
  avatarUrl?: string | null;
  avatarStorageRef?: string | null;
  /** Preferência histórica mantida no banco; não deve bloquear a foto salva. */
  useAvatarInHeader?: boolean | null;
};

const PROFILE_AVATAR_OBJECT_KEY =
  /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/profiles\/avatars\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/i;

function stableR2AvatarUrl(ref: string): string {
  if (!ref.startsWith("r2:")) return "";
  const objectKey = ref.slice(3).trim();
  return PROFILE_AVATAR_OBJECT_KEY.test(objectKey)
    ? `/api/profile-avatar-open?objectKey=${encodeURIComponent(objectKey)}`
    : "";
}

export function resolveProfileAvatarDisplayUrl(profile: AvatarRecord | null | undefined): string {
  if (!profile) return "";

  // Priorizar a chave do R2 evita expiração de URL assinada e recupera
  // perfis antigos que só tinham o storageRef gravado no banco.
  const storageRef = String(profile.avatarStorageRef || "").trim();
  const stableRefUrl = stableR2AvatarUrl(storageRef);
  if (stableRefUrl) return stableRefUrl;

  const savedUrl = String(profile.avatarUrl || "").trim();
  if (!savedUrl) return "";
  const fromSavedR2 = stableR2AvatarUrl(savedUrl);
  if (fromSavedR2) return fromSavedR2;

  // URLs legadas e rota interna continuam compatíveis. Referências R2
  // malformadas não devem ser apresentadas como endereço de imagem.
  if (savedUrl.startsWith("r2:")) return "";
  return /^(?:https?:\/\/|\/|blob:|data:image\/)/i.test(savedUrl) ? savedUrl : "";
}
