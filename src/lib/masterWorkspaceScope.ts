export function resolveMasterWorkspaceScope(explicitId: string, institutions: readonly {id:string}[]): string {
  // An explicit selection is not replaced by an unrelated institution on refresh.
  // A new-registration draft never owns or clears this independent workspace scope.
  return explicitId || (institutions.length === 1 ? institutions[0].id : "");
}
export function masterWorkspaceSearch(current: string, section: string, scopeId: string, mode: "novo"|"editar"): string {
  const params = new URLSearchParams(current);
  params.set("secao", section);
  if (scopeId) params.set("municipio",scopeId); else params.delete("municipio");
  if (section === "cadastro" && mode === "editar" && scopeId) params.set("modo","editar"); else params.delete("modo");
  return "?" + params.toString();
}

export function resolveMasterFormMode(search: string): "novo" | "editar" {
  const params = new URLSearchParams(search);
  return params.get("secao") === "cadastro" && params.get("modo") === "editar" && Boolean(params.get("municipio")) ? "editar" : "novo";
}
