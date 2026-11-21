import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";
import { accessLevelLabels, roleLabels, type SessionUser, type UserProfile } from "@/lib/platform";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { DEFAULT_AVATAR_EDITOR_DIAMETER } from "@/lib/avatarCropGeometry";
import { resolveProfileAvatarDisplayUrl } from "@/lib/profileAvatarDisplay";

const statusText: Record<string, string> = {
  active: "Ativo",
  blocked: "Bloqueado",
  inactive: "Inativo",
};

function statusClass(status: string): string {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "blocked") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export type CompactUserRegistryProps = {
  users: readonly SessionUser[];
  page: number;
  onPageChange: (page: number) => void;
  renderDetails: (user: SessionUser) => ReactNode;
  /** Read from the municipality-scoped profile store, never invent a photo. */
  getAvatarProfile?: (user: SessionUser) => UserProfile | null;
  filterKey?: string;
  pageSize?: number;
  label?: string;
};

export function CompactUserRegistry({
  users, page, onPageChange, renderDetails, getAvatarProfile, filterKey = "", pageSize = 20,
  label = "Cadastro de usuários",
}: CompactUserRegistryProps) {
  const { isAuthenticated, authResolved, authenticatedUserId, authenticatedProfileId } = useAuthGateway();
  const authorizedViewerId = isAuthenticated && authResolved
    ? (authenticatedUserId || authenticatedProfileId)
    : null;
  const paged = useMemo(
    () => paginateMunicipalItems(users, page, pageSize),
    [users, page, pageSize],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    setExpandedId(null);
  }, [filterKey]);
  useEffect(() => {
    if (page !== paged.page) onPageChange(paged.page);
  }, [onPageChange, page, paged.page]);

  const showDetails = (id: string) => setExpandedId((current) => current === id ? null : id);

  return (
    <section data-sigapro-user-registry="compact" aria-label={label} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-600">
          <span className="font-semibold text-slate-900">{paged.total.toLocaleString("pt-BR")}</span>
          {" "}cadastros encontrados
        </p>
        <span className="text-xs text-slate-500">Selecione uma linha para consultar ou editar.</span>
      </div>
      {paged.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600" role="status">
          Nenhum usuário encontrado para os filtros atuais.
        </div>
      ) : (
        <div data-mobile-registry-scroll="true" className="max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.035)]">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm" aria-label={label}>
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-600">
              <tr>
                <th scope="col" className="w-[26%] px-4 py-3 font-semibold">Usuário</th>
                <th scope="col" className="w-[20%] px-4 py-3 font-semibold">Perfil e acesso</th>
                <th scope="col" className="w-[18%] px-4 py-3 font-semibold">Lotação</th>
                <th scope="col" className="w-[12%] px-4 py-3 font-semibold">Situação</th>
                <th scope="col" className="w-[14%] px-4 py-3 font-semibold">Último acesso</th>
                <th scope="col" className="w-[10%] px-4 py-3 text-right font-semibold">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.items.map((user) => {
                const expanded = expandedId === user.id;
                const rowId = "sigapro-user-detail-" + user.id.replace(/[^a-zA-Z0-9_-]/g, "");
                const profile = getAvatarProfile?.(user) ?? null;
                const imageUrl = resolveProfileAvatarDisplayUrl(profile);
                return (
                  <Fragment key={user.id}>
                    <tr data-sigapro-user-row="true" className="transition-colors hover:bg-sky-50/60">
                      <td className="max-w-0 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar
                            authenticatedOwnerId={authorizedViewerId}
                            name={user.name}
                            imageUrl={imageUrl}
                            crop={imageUrl && profile ? {
                              scale: profile.avatarScale ?? 1,
                              offsetX: profile.avatarOffsetX ?? 0,
                              offsetY: profile.avatarOffsetY ?? 0,
                              editorSize: DEFAULT_AVATAR_EDITOR_DIAMETER,
                            } : undefined}
                            size="md"
                            title={user.name || "Usuário"}
                            className="!h-10 !w-10 border-white bg-slate-50 ring-1 ring-slate-200 shadow-sm"
                            fallbackClassName="!bg-slate-100 !text-slate-700"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-950" title={user.name}>{user.name || "Usuário"}</p>
                            <p className="truncate text-xs text-slate-500" title={user.email}>{user.email || "E-mail não informado"}</p>
                          </div>
                        </div>
                      </td>
                      <td data-mobile-label="Perfil e acesso" className="max-w-0 px-4 py-3">
                        <p className="truncate font-medium text-slate-800" title={roleLabels[user.role] || user.role}>{roleLabels[user.role] || user.role}</p>
                        <p className="truncate text-xs text-slate-500">{accessLevelLabels[user.accessLevel] || "Sem nível"}</p>
                      </td>
                      <td data-mobile-label="Lotação" className="max-w-0 px-4 py-3">
                        <p className="truncate text-slate-600" title={user.department || user.title || ""}>{user.department || user.title || "Não informada"}</p>
                      </td>
                      <td data-mobile-label="Situação" className="px-4 py-3">
                        <span className={"inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold " + statusClass(user.accountStatus)}>
                          {statusText[user.accountStatus] || "Indefinido"}
                        </span>
                      </td>
                      <td data-mobile-label="Último acesso" className="max-w-0 px-4 py-3">
                        <span className="block truncate text-xs text-slate-600" title={user.lastAccessAt || ""}>{user.lastAccessAt || "Não registrado"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" aria-expanded={expanded} aria-controls={rowId} aria-label={(expanded ? "Recolher" : "Abrir") + " detalhes de " + (user.name || "usuário")}
                          onClick={() => showDetails(user.id)}
                          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
                          {expanded ? "Recolher" : "Detalhes"}
                          <ChevronDown aria-hidden="true" className={"h-4 w-4 transition-transform " + (expanded ? "rotate-180" : "")} />
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={6} id={rowId} data-sigapro-user-expanded="true" className="border-t border-sky-100 bg-slate-50/70 px-4 py-4">
                          {renderDetails(user)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {paged.total > 0 ? (
        <nav aria-label={"Paginação de " + label.toLowerCase()} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <span className="text-xs text-slate-600" aria-live="polite">
            Mostrando {paged.start + 1}–{paged.end} de {paged.total.toLocaleString("pt-BR")} · Página {paged.page} de {paged.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setExpandedId(null); onPageChange(paged.page - 1); }} disabled={paged.page === 1}
              className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={() => { setExpandedId(null); onPageChange(paged.page + 1); }} disabled={paged.page >= paged.totalPages}
              className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              Próxima <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </nav>
      ) : (
        <span className="sr-only">Sem usuários para exibir.</span>
      )}
    </section>
  );
}
