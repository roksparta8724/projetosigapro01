import { useMemo, useState } from "react";
import { Calendar, CreditCard, Search } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/platform/MetricCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer, SideContent, StatsCards } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { formatCurrency, getProcessPaymentGuides, getVisibleProcessesByScope } from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

const paymentStatusOptions = [
  { value: "todos", label: "Todos os status" },
  { value: "pendente", label: "Pendente" },
  { value: "compensada", label: "Compensada" },
  { value: "vencida", label: "Vencida" },
];

function getGuideStatus(guide: { status: string; dueDate: string }) {
  if (guide.status === "compensada") return "compensada";
  const due = new Date(guide.dueDate);
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "vencida";
  return "pendente";
}

export function ExternalPaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { processes: allProcesses, getInstitutionSettings } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const activeTab = getExternalTabByPath(location.pathname);

  const guides = useMemo(
    () =>
      processes.flatMap((process) =>
        getProcessPaymentGuides(process, tenantSettings).map((guide) => ({
          process,
          guide,
          status: getGuideStatus(guide),
        })),
      ),
    [processes, tenantSettings],
  );

  const filteredGuides = useMemo(() => {
    const term = search.trim().toLowerCase();
    return guides.filter((item) => {
      const matchesStatus = statusFilter === "todos" || item.status === statusFilter;
      const matchesSearch =
        !term ||
        item.process.protocol.toLowerCase().includes(term) ||
        item.process.title.toLowerCase().includes(term) ||
        item.guide.code.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [guides, search, statusFilter]);

  const pendingCount = guides.filter((item) => item.status === "pendente").length;
  const overdueCount = guides.filter((item) => item.status === "vencida").length;
  const paidCount = guides.filter((item) => item.status === "compensada").length;
  const totalValue = guides.reduce((sum, item) => sum + item.guide.amount, 0);

  return (
    <PortalFrame eyebrow="Acesso Externo" title="Pagamentos">
      <PageContainer>
        <PageIntro
          eyebrow="Pagamentos"
          title="Guias e pendências financeiras"
          description="Acompanhe guias emitidas, status de compensação e vencimentos."
          icon={CreditCard}
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/externo/controle">Controle de processos</Link>
            </Button>
          }
        />

        <InternalTabs
          items={externalTabs.map(({ value, label, helper }) => ({ value, label, helper }))}
          value={activeTab.value}
          onChange={(value) => {
            const target = externalTabs.find((tab) => tab.value === value);
            if (target) navigate(target.route);
          }}
        />

        <StatsCards>
          <MetricCard title="Pendentes" value={String(pendingCount)} helper="Guias aguardando" icon={Calendar} tone="amber" />
          <MetricCard title="Vencidas" value={String(overdueCount)} helper="Requer atenção" icon={Calendar} tone="rose" />
          <MetricCard title="Compensadas" value={String(paidCount)} helper="Pagamentos confirmados" icon={CreditCard} tone="emerald" />
          <MetricCard title="Total emitido" value={formatCurrency(totalValue)} helper="Guias vinculadas" icon={CreditCard} tone="blue" />
        </StatsCards>

        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Guias vinculadas aos protocolos"
              description="Use a busca para localizar guias específicas por protocolo ou código."
              actions={
                <div className="mt-2 grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar protocolo, projeto ou guia"
                      className="h-11 rounded-2xl pl-9 text-[14px]"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 rounded-2xl sig-dark-panel text-[14px]">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
              contentClassName="space-y-4"
            >
              <div className="hidden rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 2xl:grid 2xl:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_0.6fr] 2xl:gap-3">
                <span>Protocolo</span>
                <span>Projeto</span>
                <span>Guia</span>
                <span>Vencimento</span>
                <span>Status</span>
                <span className="text-right">Ações</span>
              </div>

              {filteredGuides.map(({ process, guide, status }) => (
                <div key={`${process.id}-${guide.code}`} className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                  <div className="grid gap-4 2xl:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_0.6fr] 2xl:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-950">{process.protocol}</p>
                      <p className="mt-1 truncate text-[13px] text-slate-500">{process.externalProtocol}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-900">{process.title}</p>
                      <p className="mt-1 truncate text-[13px] text-slate-500">{process.type}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-slate-900">{guide.code}</p>
                      <p className="mt-1 text-[13px] text-slate-500">{formatCurrency(guide.amount)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-slate-900">{guide.dueDate}</p>
                      <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-slate-500">Vencimento</p>
                    </div>
                    <div className="min-w-0">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-3 py-1 text-[12px] ${
                          status === "compensada"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                            : status === "vencida"
                              ? "border-rose-200 bg-rose-50 text-rose-600"
                              : "border-amber-200 bg-amber-50 text-amber-600"
                        }`}
                      >
                        {status === "compensada" ? "Compensada" : status === "vencida" ? "Vencida" : "Pendente"}
                      </Badge>
                    </div>
                    <div className="flex justify-start 2xl:justify-end">
                      <Button asChild variant="outline" className="rounded-full text-[13px]">
                        <Link to={`/processos/${process.id}?aba=financeiro`}>Ver detalhes</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredGuides.length === 0 ? (
                <div className="sig-dark-panel rounded-[12px] border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-[18px] font-semibold text-slate-900">Nenhuma guia encontrada</p>
                  <p className="mt-2 text-[15px] text-slate-600">Não há guias compatíveis com os filtros selecionados.</p>
                </div>
              ) : null}
            </SectionPanel>
          </MainContent>

          <SideContent>
            <SectionPanel title="Pendências financeiras" description="Guias que exigem atenção imediata." contentClassName="space-y-3">
              {overdueCount === 0 && pendingCount === 0 ? (
                <div className="sig-dark-panel rounded-[10px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  Nenhuma pendência financeira crítica no momento.
                </div>
              ) : (
                guides
                  .filter((item) => item.status !== "compensada")
                  .slice(0, 3)
                  .map((item) => (
                    <div key={`side-${item.process.id}-${item.guide.code}`} className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm">
                      <p className="text-sm font-semibold text-slate-900">{item.process.protocol}</p>
                      <p className="mt-1 text-sm text-slate-600">{formatCurrency(item.guide.amount)}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
                        {item.status === "vencida" ? "Vencida" : "Pendente"}
                      </p>
                    </div>
                  ))
              )}
            </SectionPanel>

            <SectionPanel title="Ações rápidas" description="Atalhos para gestão financeira." contentClassName="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/controle">Controle de processos</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/historico">Histórico</Link>
              </Button>
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
