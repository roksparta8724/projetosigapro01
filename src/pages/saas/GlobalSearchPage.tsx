import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, FileText, Search, Users2 } from "lucide-react";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useMunicipality } from "@/hooks/useMunicipality";
import { can, matchesOperationalScope } from "@/lib/platform";

export function GlobalSearchPage() {
  const [params] = useSearchParams();
  const query = params.get("query") ?? "";
  const normalizedQuery = query.trim().toLowerCase();
  const { processes, institutions, sessionUsers } = usePlatformData();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const activeInstitutionId = municipality?.id ?? scopeId ?? session.tenantId ?? null;

  const visibleProcesses = useMemo(
    () =>
      processes.filter((process) =>
        matchesOperationalScope(activeInstitutionId, process),
      ),
    [activeInstitutionId, processes],
  );

  const filteredProcesses = useMemo(() => {
    if (!normalizedQuery) return [];
    return visibleProcesses.filter((process) => {
      const haystack = [
        process.protocol,
        process.title,
        process.requesterName,
        process.ownerName,
        process.technicalLead,
        process.status,
        process.property?.address,
        process.property?.city,
        process.property?.neighborhood,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, visibleProcesses]);

  const exactProcess = useMemo(() => {
    if (!normalizedQuery) return null;
    return (
      filteredProcesses.find((process) => process.protocol.toLowerCase() === normalizedQuery) ||
      null
    );
  }, [filteredProcesses, normalizedQuery]);

  const visibleInstitutions = useMemo(() => {
    if (can(session, "manage_tenants") || can(session, "manage_tenant_users")) {
      return institutions;
    }
    return activeInstitutionId
      ? institutions.filter((institution) => institution.id === activeInstitutionId)
      : [];
  }, [activeInstitutionId, institutions, session]);

  const filteredInstitutions = useMemo(() => {
    if (!normalizedQuery) return [];
    return visibleInstitutions.filter((institution) => {
      const haystack = [
        institution.name,
        institution.city,
        institution.state,
        institution.subdomain,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, visibleInstitutions]);

  const filteredUsers = useMemo(() => {
    if (!normalizedQuery) return [];
    return sessionUsers
      .filter((user) => {
        if (session.role === "master_admin" || session.role === "master_ops") return true;
        if (!activeInstitutionId) return false;
        return user.tenantId === activeInstitutionId || user.municipalityId === activeInstitutionId;
      })
      .filter((user) => {
        const haystack = [user.name, user.email, user.title, user.role]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [activeInstitutionId, normalizedQuery, session.role, sessionUsers]);

  const hasResults =
    filteredProcesses.length > 0 ||
    filteredInstitutions.length > 0 ||
    filteredUsers.length > 0;

  return (
    <PortalFrame title="Pesquisa rápida" eyebrow="Busca global">
      <div className="space-y-6">
        <Card className="sig-strong-card border border-slate-200/70 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <Search className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Resultado da pesquisa
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {normalizedQuery ? `“${query}”` : "Digite um termo no topo para buscar"}
              </p>
              <p className="text-sm text-slate-600">
                A busca considera processos, prefeituras e usuários dentro do seu escopo.
              </p>
            </div>
          </div>
        </Card>

        {!normalizedQuery ? (
          <Card className="sig-strong-card border border-dashed border-slate-200/70 bg-white p-8 text-center text-sm text-slate-600">
            Use o campo “Buscar no sistema” no topo para localizar protocolos, usuários ou prefeituras.
          </Card>
        ) : null}

        {normalizedQuery && !hasResults ? (
          <Card className="sig-strong-card border border-dashed border-slate-200/70 bg-white p-8 text-center text-sm text-slate-600">
            Nenhum resultado encontrado para a pesquisa atual. Revise o termo e tente novamente.
          </Card>
        ) : null}

        {filteredProcesses.length > 0 ? (
          <Card className="sig-strong-card border border-slate-200/70 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Protocolos</p>
                  <p className="text-xs text-slate-500">Resultados operacionais</p>
                </div>
              </div>
            </div>
            {exactProcess ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Protocolo encontrado: {exactProcess.protocol}
                  </p>
                  <p className="text-xs text-slate-500">{exactProcess.title}</p>
                </div>
                <Button asChild className="h-9 rounded-full text-xs">
                  <Link to={`/processos/${exactProcess.id}`}>Abrir protocolo</Link>
                </Button>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {filteredProcesses.slice(0, 8).map((process) => (
                <div
                  key={process.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{process.protocol}</p>
                    <p className="text-xs text-slate-500">{process.title}</p>
                  </div>
                  <Button asChild variant="outline" className="h-9 rounded-full text-xs">
                    <Link to={`/processos/${process.id}`}>
                      Abrir protocolo
                      <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {filteredInstitutions.length > 0 ? (
          <Card className="sig-strong-card border border-slate-200/70 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Users2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Prefeituras</p>
                <p className="text-xs text-slate-500">Instituições no seu escopo</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {filteredInstitutions.slice(0, 6).map((institution) => (
                <div
                  key={institution.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{institution.name}</p>
                    <p className="text-xs text-slate-500">
                      {institution.city} {institution.state ? `• ${institution.state}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="h-9 rounded-full text-xs">
                    <Link to="/prefeitura">Ver painel</Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {filteredUsers.length > 0 ? (
          <Card className="sig-strong-card border border-slate-200/70 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Users2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Usuários</p>
                <p className="text-xs text-slate-500">Equipe e acessos cadastrados</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {filteredUsers.slice(0, 8).map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <Button asChild variant="outline" className="h-9 rounded-full text-xs">
                    <Link to="/configuracoes">Ver usuários</Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </PortalFrame>
  );
}
