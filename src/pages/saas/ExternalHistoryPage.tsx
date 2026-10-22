import { useMemo, useState } from "react";
import { Calendar, History, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { formatOfficialProcessNumber, getVisibleProcessesByScope } from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { isExternallyVisibleHistoryEvent } from "@/lib/institutionalHistoryAccess";


function parseSIGAPROHistoryDate(raw: unknown): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const hour = Number(br[4] || 0);
    const minute = Number(br[5] || 0);
    const second = Number(br[6] || 0);
    const date = new Date(year, month - 1, day, hour, minute, second);
    return year >= 1900 && hour < 24 && minute < 60 &&
      second < 60 && date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day ? date : null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function labelSIGAPROHistoryEvent(title: string): string {
  const names: Record<string, string> = {
    habite_se_completed: "Habite-se concluído",
    payment_confirmed: "Pagamento confirmado",
    guia_emitida: "Guia de pagamento emitida",
    dispatch: "Despacho administrativo",
    status_change: "Alteração da situação"
  };
  return names[title] || title.replace(/_/g, " ");
}

const periodOptions = [
  { value: "todos", label: "Todo o período" },
  { value: "15", label: "Últimos 15 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

export function ExternalHistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { processes: allProcesses } = usePlatformData();
  const { municipality, scopeId } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses).filter(
    (process) => process.isOfficial !== false,
  );

  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("todos");
  const activeTab = getExternalTabByPath(location.pathname);

  const timelineEntries = useMemo(() => {
    const entries = processes.flatMap((process) =>
      [...(process.timeline ?? []).filter((entry) => isExternallyVisibleHistoryEvent(entry)), ...(process.auditTrail ?? []).filter((entry) => isExternallyVisibleHistoryEvent(entry))].map((entry) => ({
        ...entry,
        process,
        date: parseSIGAPROHistoryDate(entry.at),
      })),
    );
    const seenEvents = new Set<string>();
    const uniqueEntries = entries.filter((entry) => {
      const detail = String(entry.detail ?? '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
      const actor = String(entry.actor ?? '').trim().toLocaleLowerCase('pt-BR');
      const timestamp = entry.date?.getTime();
      if (!detail || timestamp == null) return true;
      const identity = JSON.stringify([entry.process.id, timestamp, detail, actor]);
      if (seenEvents.has(identity)) return false;
      seenEvents.add(identity);
      return true;
    });
    return uniqueEntries.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }, [processes]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    const days = Number(periodFilter);
    const threshold =
      periodFilter === "todos" ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return timelineEntries.filter((entry) => {
      const matchesSearch =
        !term ||
        entry.process.protocol.toLowerCase().includes(term) ||
        entry.process.title.toLowerCase().includes(term) ||
        entry.title.toLowerCase().includes(term);
      const matchesPeriod = !threshold || (entry.date !== null && entry.date >= threshold);
      return matchesSearch && matchesPeriod;
    });
  }, [timelineEntries, search, periodFilter]);

  const activityCount = timelineEntries.length;
  const lastWeek = timelineEntries.filter((entry) => (entry.date?.getTime() ?? 0) > Date.now() - 7 * 24 * 60 * 60 * 1000).length;
  const activeProcesses = processes.length;
  const activeTabLabel = activeTab.label;

  return (
    <PortalFrame eyebrow="Acesso Externo" title="Histórico">
      <PageContainer>
        <PageIntro
          eyebrow="Histórico"
          title="Movimentações e eventos recentes"
          description="Acompanhe tudo o que mudou nos seus protocolos, com filtros rápidos."
          icon={History}
          actions={
            <Button variant="outline" className="rounded-full" onClick={() => navigate("/externo/controle")}>
              Voltar ao controle
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
          <MetricCard title="Atividades registradas" value={String(activityCount)} helper="Eventos no histórico" icon={History} tone="blue" />
          <MetricCard title="Últimos 7 dias" value={String(lastWeek)} helper="Atualizações recentes" icon={Calendar} tone="emerald" />
          <MetricCard title="Protocolos ativos" value={String(activeProcesses)} helper="Acompanhamentos" icon={Calendar} tone="amber" />
          <MetricCard title="Aba atual" value={activeTabLabel} helper="Histórico externo" icon={History} tone="default" />
        </StatsCards>

        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Linha do tempo"
              description="Eventos organizados do mais recente para o mais antigo."
              actions={
                <div className="mt-2 grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="relative min-w-0">
                    <Search className="sig-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar protocolo ou evento"
                      className="h-11 rounded-2xl pl-9 text-[14px]"
                    />
                  </div>
                  <Select value={periodFilter} onValueChange={setPeriodFilter}>
                    <SelectTrigger className="h-11 rounded-2xl sig-dark-panel text-[14px]">
                      <SelectValue placeholder="Todo o período" />
                    </SelectTrigger>
                    <SelectContent>
                      {periodOptions.map((option) => (
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
              {filteredEntries.map((entry) => (
                <div key={`${entry.process.id}-${entry.id}`} className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{labelSIGAPROHistoryEvent(entry.title)}</p>
                      <p className="mt-1 text-sm text-slate-600">{entry.detail}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                        {formatOfficialProcessNumber(entry.process.protocol)} · {entry.actor}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                      {entry.date ? entry.date.toLocaleString("pt-BR") : "Data não informada"}
                    </p>
                  </div>
                </div>
              ))}

              {filteredEntries.length === 0 ? (
                <div className="sig-dark-panel rounded-[12px] border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-[18px] font-semibold text-slate-900">Nenhum evento encontrado</p>
                  <p className="mt-2 text-[15px] text-slate-600">
                    Você ainda não possui movimentações com os filtros selecionados.
                  </p>
                </div>
              ) : null}
            </SectionPanel>
          </MainContent>

          <SideContent>
            <SectionPanel
              title="Resumo rápido"
              description="Leitura curta para orientar o próximo passo."
              contentClassName="space-y-3"
            >
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm text-slate-700">
                Os eventos do histórico são registrados automaticamente quando o protocolo muda de etapa ou recebe nova exigência.
              </div>
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm text-slate-700">
                Use a busca para localizar protocolos específicos e revisar decisões anteriores.
              </div>
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
