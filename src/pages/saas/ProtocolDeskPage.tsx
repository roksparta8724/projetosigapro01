import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileWarning,
  Globe2,
  Layers3,
  Search,
  Store,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCard } from "@/components/platform/AlertCard";
import { PageHero } from "@/components/platform/PageHero";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageSideContent,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { TableCard } from "@/components/platform/TableCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import {
  formatCurrency,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  statusLabel,
  statusTone,
  type ProcessRecord,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type ProtocolSection =
  | "visao-geral"
  | "fila"
  | "entradas"
  | "documentos"
  | "balcao"
  | "online"
  | "historico";

function getOpeningDate(process: ProcessRecord) {
  return process.timeline[process.timeline.length - 1]?.at ?? process.payment.issuedAt ?? "-";
}

function getMissingRequiredDocuments(process: ProcessRecord) {
  return process.documents.filter((document) => document.required && !document.uploaded).length;
}

export function ProtocolDeskPage() {
  const { session } = usePlatformSession();
  const {
    processes: allProcesses,
    markGuideAsPaid,
    getInstitutionSettings,
    dispatchProcess,
    getUserProfile,
  } = usePlatformData();
  const { scopeId, institutionSettingsCompat } = useMunicipality();
  const processes = getVisibleProcessesByScope(session, scopeId, allProcesses);
  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(scopeId ?? session.tenantId);

  const [protocolQuery, setProtocolQuery] = useState("");
  const [manualGuideRegistered, setManualGuideRegistered] = useState<string | null>(null);
  const [section, setSection] = useState<ProtocolSection>("visao-geral");
  const currentUnit = session.department || session.title || "Setor de protocolo";

  const queueItems = useMemo(
    () =>
      [...processes].sort((a, b) => {
        if (a.sla.breached !== b.sla.breached) return a.sla.breached ? -1 : 1;
        return a.sla.hoursRemaining - b.sla.hoursRemaining;
      }),
    [processes],
  );

  const newProtocols = processes.filter(
    (item) => item.triage.status === "recebido" || item.triage.status === "em_triagem",
  );
  const pendingDocuments = processes.filter((item) => getMissingRequiredDocuments(item) > 0);
  const incompleteProtocols = processes.filter(
    (item) => item.status === "pendencia_documental" || getMissingRequiredDocuments(item) > 0,
  );
  const triagedProtocols = processes.filter((item) => item.triage.status === "concluido");
  const urgentProtocols = queueItems.filter(
    (item) => item.sla.breached || item.sla.hoursRemaining <= 8,
  );
  const deskProtocols = processes.filter((item) =>
    item.dispatches.some(
      (dispatch) =>
        dispatch.from === "Setor de protocolo" || dispatch.to === "Setor de protocolo",
    ),
  );
  const deskProtocolIds = new Set(deskProtocols.map((item) => item.id));
  const onlineProtocolItems = processes.filter((item) => !deskProtocolIds.has(item.id));

  const latestActivity = useMemo(
    () =>
      queueItems
        .flatMap((process) =>
          process.timeline.slice(0, 2).map((entry) => ({
            id: `${process.id}-${entry.id}`,
            protocol: process.protocol,
            title: entry.title,
            detail: entry.detail,
            at: entry.at,
          })),
        )
        .slice(0, 10),
    [queueItems],
  );

  const matchedProcess = useMemo(() => {
    const normalized = protocolQuery.trim().toLowerCase();
    if (!normalized) return null;

    return (
      processes.find(
        (item) =>
          item.protocol.toLowerCase() === normalized ||
          item.externalProtocol.toLowerCase() === normalized ||
          getProcessPaymentGuides(item, tenantSettings).some(
            (guide) => guide.code.toLowerCase() === normalized,
          ),
      ) || null
    );
  }, [processes, protocolQuery, tenantSettings]);
  const dispatchRows = useMemo(
    () =>
      processes.flatMap((process) =>
        process.dispatches.map((dispatch) => ({
          id: `${process.id}-${dispatch.id}`,
          processId: process.id,
          protocol: process.protocol,
          title: process.title,
          from: dispatch.from,
          to: dispatch.to,
          subject: dispatch.subject,
          dueDate: dispatch.dueDate,
          dispatchStatus: dispatch.status,
          priority: dispatch.priority ?? "media",
          assignedTo: dispatch.assignedTo || "",
          currentFolder: process.processControl?.currentFolder || dispatch.to || process.sla.currentStage,
        })),
      ),
    [processes],
  );
  const receivedAtProtocol = useMemo(
    () =>
      dispatchRows.filter(
        (item) =>
          item.to.toLowerCase().includes(currentUnit.toLowerCase()) ||
          item.currentFolder.toLowerCase().includes(currentUnit.toLowerCase()),
      ),
    [currentUnit, dispatchRows],
  );
  const generatedByProtocol = useMemo(
    () => dispatchRows.filter((item) => item.from.toLowerCase().includes(currentUnit.toLowerCase())),
    [currentUnit, dispatchRows],
  );
  const assignedAtProtocol = useMemo(
    () => dispatchRows.filter((item) => item.assignedTo).slice(0, 6),
    [dispatchRows],
  );
  const restrictedTransitCount = useMemo(
    () => processes.filter((process) => (process.processControl?.externalTransitView ?? "completo") === "restrito").length,
    [processes],
  );
  const criticalDispatches = useMemo(
    () =>
      dispatchRows.filter(
        (item) => item.priority === "critica" || item.priority === "alta" || item.dispatchStatus === "aguardando",
      ).slice(0, 5),
    [dispatchRows],
  );

  const navItems = [
    { value: "visao-geral", label: "Visão geral", helper: "Resumo, prioridades e movimentos" },
    { value: "fila", label: "Fila de triagem", helper: "Operação principal do protocolo" },
    { value: "entradas", label: "Entradas", helper: "Separação por canal de recebimento" },
    { value: "documentos", label: "Documentos pendentes", helper: "Bloqueios, exigências e regularização" },
    { value: "balcao", label: "Atendimento balcão", helper: "Recepção presencial e apoio assistido" },
    { value: "online", label: "Atendimento online", helper: "Entrada digital e despacho inicial" },
    { value: "historico", label: "Histórico", helper: "Últimos registros e rastreabilidade" },
  ] as const;

  const renderQueueList = (
    items: ProcessRecord[],
    emptyMessage = "Nenhum protocolo disponível nesta seção.",
  ) => (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        items.map((process) => {
          const guides = getProcessPaymentGuides(process, tenantSettings);
          const protocolGuide = guides[0];
          const missingRequired = getMissingRequiredDocuments(process);
          const isUrgent = process.sla.breached || process.sla.hoursRemaining <= 8;
          const isDeskFlow = deskProtocolIds.has(process.id);

          return (
            <div key={process.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-semibold text-slate-950" title={process.protocol}>
                      {process.protocol}
                    </p>
                    <Badge variant="outline" className={statusTone(process.status)}>
                      {statusLabel(process.status)}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                      {isDeskFlow ? "Balcão" : "Online"}
                    </Badge>
                    {isUrgent ? (
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                        ⏱ SLA crítico
                      </Badge>
                    ) : null}
                    {missingRequired > 0 ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                        ⚠ {missingRequired} documento(s)
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-900" title={process.title}>{process.title}</p>

                  <div className="mt-3 flex min-w-0 items-center gap-2">
                    <UserAvatar
                      name={process.ownerName}
                      imageUrl={getUserProfile(process.createdBy)?.avatarUrl}
                      size="sm"
                    />
                    <p className="sig-truncate text-sm text-slate-600" title={`${process.ownerName} - ${process.address}`}>
                      {process.ownerName} - {process.address}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="rounded-full">
                    <Link to={`/processos/${process.id}`}>Abrir protocolo</Link>
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="sig-label">Abertura</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950" title={getOpeningDate(process)}>{getOpeningDate(process)}</p>
                  <p className="mt-1 text-xs text-slate-500">Entrada no protocolo</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="sig-label">Guia principal</p>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-950" title={protocolGuide?.code || "Não emitida"}>
                    {protocolGuide?.code || "Não emitida"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatCurrency(protocolGuide?.amount || 0)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="sig-label">Pagamento</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {protocolGuide?.status === "compensada" ? "Confirmado" : "Pendente"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Vencimento {protocolGuide?.dueDate || "-"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="sig-label">Responsável</p>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <UserAvatar name={process.technicalLead} size="sm" />
                    <span className="sig-truncate text-sm font-semibold text-slate-950" title={process.technicalLead}>
                      {process.technicalLead}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="sig-label">Fluxo atual</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950" title={process.dispatches[0]?.to || "Fluxo interno"}>
                    {process.dispatches[0]?.to || "Fluxo interno"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{process.sla.hoursRemaining}h para o SLA</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderSearchPanel = ({
    title,
    description,
    hint,
  }: {
    title: string;
    description: string;
    hint: string;
  }) => (
    <SectionCard title={title} description={description}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={protocolQuery}
              onChange={(event) => setProtocolQuery(event.target.value)}
              placeholder="Buscar por protocolo, protocolo externo ou guia"
              className="h-12 rounded-2xl border-slate-200 pl-11"
            />
          </div>

          {matchedProcess ? (
            <div className="flex flex-col gap-3 md:flex-row">
              <Button
                type="button"
                className="rounded-full bg-[#143b63] hover:bg-[#123554]"
                onClick={() => setManualGuideRegistered(matchedProcess.id)}
              >
                Registrar guia manual
              </Button>

              {getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.status === "pendente" ? (
                <Button
                  type="button"
                  className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    setManualGuideRegistered(matchedProcess.id);
                    markGuideAsPaid(matchedProcess.id, session.name, "protocolo");
                  }}
                >
                  Confirmar pagamento
                </Button>
              ) : null}

              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() =>
                  dispatchProcess({
                    processId: matchedProcess.id,
                    actor: session.name,
                    from: "Setor de protocolo",
                    to: "Análise técnica",
                    subject: "Despacho do protocolo para a fila técnica",
                    dueDate: new Date().toLocaleDateString("pt-BR"),
                    visibility: "interno",
                  })
                }
              >
                Despachar protocolo
              </Button>
            </div>
          ) : null}
        </div>

        {matchedProcess ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="sig-label">Protocolo</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{matchedProcess.protocol}</p>
              </div>
              <div>
                <p className="sig-label">Guia principal</p>
                <p className="mt-2 truncate text-sm font-semibold text-slate-950">
                  {getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.code}
                </p>
              </div>
              <div>
                <p className="sig-label">Situação</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.status === "compensada"
                    ? "Pagamento confirmado"
                    : "Pagamento pendente"}
                </p>
              </div>
              <div>
                <p className="sig-label">Valor</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {formatCurrency(getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.amount || 0)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {getProcessPaymentGuides(matchedProcess, tenantSettings).map((guide) => (
                <div key={guide.kind} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="truncate text-sm font-semibold text-slate-950" title={guide.label}>
                    {guide.label}
                  </p>
                  <p className="mt-2 truncate text-sm text-slate-700" title={guide.code}>
                    {guide.code}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{formatCurrency(guide.amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">Vencimento {guide.dueDate}</p>
                  <p
                    className={`mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      guide.status === "compensada" ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {guide.status === "compensada" ? "Confirmado" : "Pendente"}
                  </p>
                </div>
              ))}
            </div>

            {manualGuideRegistered === matchedProcess.id ? (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Guia manual registrada com os dados preenchidos automaticamente pelo protocolo.
              </div>
            ) : null}
          </div>
        ) : protocolQuery.trim() ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Nenhum protocolo localizado com este número.
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
            {hint}
          </div>
        )}
      </div>
    </SectionCard>
  );

  return (
    <PortalFrame eyebrow="SETOR DE PROTOCOLO" title="Triagem municipal, atendimento e fluxo inicial">
      <PageShell>
        <PageHero
          eyebrow="Operação de protocolo"
          title="Recepção, conferência documental e despacho inicial"
          description="Organize a entrada municipal com uma visão mais limpa, prioridades claras e canais separados por operação."
          icon={ClipboardList}
          actions={
            <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
              <Link to="/prefeitura/protocolos/novo">
                <FilePlus2 className="mr-2 h-4 w-4" />
                Protocolar no balcão
              </Link>
            </Button>
          }
        />

        <InternalSectionNav
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as ProtocolSection)}
        />

        {section === "visao-geral" ? (
          <>
            <PageStatsRow className="xl:grid-cols-4">
              <StatCard label="📁 Novos protocolos" value={String(newProtocols.length)} description="Entradas prontas para conferência" icon={ClipboardList} tone="blue" />
              <StatCard label="📄 Documentos pendentes" value={String(pendingDocuments.length)} description="Cadastros com exigência documental" icon={FileWarning} tone="amber" />
              <StatCard label="⚠ Incompletos" value={String(incompleteProtocols.length)} description="Processos travados na triagem" icon={AlertTriangle} tone="rose" />
              <StatCard label="✅ Triados" value={String(triagedProtocols.length)} description="Protocolos liberados para a próxima etapa" icon={CheckCircle2} tone="emerald" />
            </PageStatsRow>

            <PageMainGrid>
              <PageMainContent>
              <TableCard
                title="Fila prioritária"
                description="Protocolos com maior urgência, leitura rápida por prioridade e ação imediata."
                icon={Layers3}
                actions={
                  <Button asChild variant="outline" className="rounded-full">
                    <Link to="/prefeitura/protocolos/novo">
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      Novo protocolo
                    </Link>
                  </Button>
                }
              >
                {renderQueueList(queueItems.slice(0, 5))}
              </TableCard>

              <SectionCard title="Movimentos recentes" description="Últimas alterações registradas na operação de protocolo.">
                <div className="space-y-3">
                  {latestActivity.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{entry.protocol}</p>
                          <p className="mt-1 text-sm text-slate-800">{entry.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{entry.detail}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{entry.at}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
              </PageMainContent>

              <PageSideContent>
                <SectionCard title="Painel de apoio" description="Prioridades, canais e atalhos em uma leitura curta.">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <AlertCard
                        title="⏱ SLA crítico"
                        description={
                          urgentProtocols.length > 0
                            ? `${urgentProtocols.length} protocolo(s) com prazo curto ou vencido.`
                            : "Nenhum protocolo em situação crítica no momento."
                        }
                        tone={urgentProtocols.length > 0 ? "danger" : "success"}
                        icon={Clock3}
                      />
                      <AlertCard
                        title="📄 Pendência documental"
                        description={
                          pendingDocuments.length > 0
                            ? `${pendingDocuments.length} entrada(s) aguardam documento obrigatório.`
                            : "Checklist documental em dia na fila atual."
                        }
                        tone={pendingDocuments.length > 0 ? "warning" : "success"}
                        icon={FileWarning}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">🏛 Balcão</p>
                          <span className="text-lg font-semibold text-slate-950">{deskProtocols.length}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Atendimento presencial e protocolo assistido.</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">🌐 Online</p>
                          <span className="text-lg font-semibold text-slate-950">{onlineProtocolItems.length}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Entradas digitais visíveis na mesma operação.</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Button asChild variant="outline" className="h-11 w-full justify-start rounded-2xl">
                        <Link to="/prefeitura/protocolos/novo">
                          <FilePlus2 className="mr-2 h-4 w-4" />
                          Novo protocolo assistido
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-11 w-full justify-start rounded-2xl">
                        <Link to="/prefeitura">
                          <Building2 className="mr-2 h-4 w-4" />
                          Voltar ao painel municipal
                        </Link>
                      </Button>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Recebidos</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{receivedAtProtocol.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Caixa atual do protocolo.</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Gerados</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{generatedByProtocol.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Despachos emitidos pelo setor.</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Fluxo restrito</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{restrictedTransitCount}</p>
                        <p className="mt-1 text-sm text-slate-500">Processos com trâmites internos ocultos.</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {criticalDispatches.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          Nenhum despacho crítico para o protocolo no momento.
                        </div>
                      ) : (
                        criticalDispatches.slice(0, 3).map((item) => (
                          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-semibold text-slate-950">{item.protocol}</p>
                              <Badge variant="outline" className="rounded-full border-slate-200 text-slate-700">
                                {item.priority}
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500">{item.subject}</p>
                            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">Pasta atual</p>
                            <p className="mt-1 text-sm text-slate-900">{item.currentFolder}</p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-3">
                      {assignedAtProtocol.length === 0 ? null : assignedAtProtocol.slice(0, 2).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="truncate text-sm font-semibold text-slate-950">{item.protocol}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.assignedTo}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        ) : null}

        {section === "fila" ? (
          <TableCard title="Fila de triagem" description="Leitura operacional completa com prioridade, prazo, responsável e avanço do protocolo." icon={Layers3}>
            {renderQueueList(queueItems, "Nenhum protocolo em triagem no momento.")}
          </TableCard>
        ) : null}

        {section === "entradas" ? (
          <>
            <PageStatsRow className="xl:grid-cols-3">
              <StatCard
                label="🏛 Balcão"
                value={String(deskProtocols.length)}
                description="Entradas com atendimento presencial"
                icon={Store}
                tone="blue"
              />
              <StatCard
                label="🌐 Online"
                value={String(onlineProtocolItems.length)}
                description="Recepção digital disponível"
                icon={Globe2}
                tone="emerald"
              />
              <StatCard
                label="📁 Novos registros"
                value={String(newProtocols.length)}
                description="Protocolos ainda na etapa inicial"
                icon={ClipboardList}
                tone="amber"
              />
            </PageStatsRow>

            <TableCard
              title="Entradas por canal"
              description="Recepção municipal organizada por origem, com leitura clara entre atendimento presencial e entrada digital."
              icon={ClipboardList}
            >
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                      <Store className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Atendimento balcão</p>
                          <p className="mt-1 text-sm text-slate-500">Protocolos com apoio presencial do setor.</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          {deskProtocols.length} entrada{deskProtocols.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    {renderQueueList(deskProtocols.slice(0, 6), "Nenhuma entrada presencial disponível.")}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                      <Globe2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Atendimento online</p>
                          <p className="mt-1 text-sm text-slate-500">Entradas digitais prontas para conferência.</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          {onlineProtocolItems.length} entrada{onlineProtocolItems.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    {renderQueueList(onlineProtocolItems.slice(0, 6), "Nenhuma entrada digital disponível.")}
                  </div>
                </div>
              </div>
            </TableCard>

            <SectionCard title="Leitura da recepção" description="Distribuição rápida das entradas atuais e situação operacional do setor.">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="sig-label">Balcão</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{deskProtocols.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Fluxo com atendimento assistido.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="sig-label">Online</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{onlineProtocolItems.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Recepção digital do sistema.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="sig-label">Novos registros</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{newProtocols.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Protocolos ainda na etapa inicial.</p>
                </div>
              </div>
            </SectionCard>
          </>
        ) : null}

        {section === "documentos" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Documentos pendentes" description="Entradas bloqueadas por ausência de arquivo obrigatório ou necessidade de regularização." icon={FileWarning}>
                {renderQueueList(incompleteProtocols, "Nenhum protocolo com pendência documental no momento.")}
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Situação da regularização" description="Leitura curta das principais travas documentais.">
                <div className="space-y-3">
                  <AlertCard
                    title="📄 Documentação obrigatória"
                    description={`${pendingDocuments.length} processo(s) aguardam envio ou conferência de documento obrigatório.`}
                    tone={pendingDocuments.length > 0 ? "warning" : "success"}
                    icon={FileWarning}
                  />
                  <AlertCard
                    title="⏱ SLA sob atenção"
                    description={`${urgentProtocols.filter((item) => getMissingRequiredDocuments(item) > 0).length} protocolo(s) com pendência documental e prazo curto.`}
                    tone={urgentProtocols.some((item) => getMissingRequiredDocuments(item) > 0) ? "danger" : "default"}
                    icon={Clock3}
                  />
                  <AlertCard
                    title="📌 Comunicação"
                    description={
                      incompleteProtocols.length > 0
                        ? "Há protocolos que exigem retorno institucional ao requerente."
                        : "Nenhuma comunicação pendente nesta etapa."
                    }
                    tone={incompleteProtocols.length > 0 ? "warning" : "success"}
                    icon={AlertTriangle}
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "balcao" ? (
          <PageMainGrid>
            <PageMainContent>
              {renderSearchPanel({
                title: "Atendimento de balcão",
                description: "Registre guias, confirme pagamentos e despache protocolos com apoio presencial do setor.",
                hint: "Busque um protocolo para registrar guia manual, confirmar pagamento ou despachar para a fila técnica.",
              })}
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Fila do balcão" description="Protocolos com passagem operacional pelo atendimento presencial.">
                {renderQueueList(deskProtocols.slice(0, 4), "Nenhum protocolo em atendimento presencial.")}
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "online" ? (
          <PageMainGrid>
            <PageMainContent>
              {renderSearchPanel({
                title: "Atendimento online",
                description: "Conduza a entrada digital, acompanhe as guias e avance os protocolos recebidos por canal eletrônico.",
                hint: "Busque um protocolo digital para validar documentos, confirmar pagamento ou encaminhar a próxima etapa.",
              })}
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Fila online" description="Entradas digitais sob responsabilidade do setor.">
                {renderQueueList(onlineProtocolItems.slice(0, 4), "Nenhum protocolo digital em atendimento.")}
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "historico" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Histórico operacional" description="Últimos registros de recepção, conferência, despacho e andamento do protocolo." icon={ClipboardList}>
                <div className="space-y-3">
                  {latestActivity.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{entry.protocol}</p>
                          <p className="mt-1 text-sm text-slate-800">{entry.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{entry.detail}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{entry.at}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Atalhos do protocolo" description="Ações recorrentes da rotina municipal.">
                <div className="space-y-3">
                  <Button asChild variant="outline" className="h-11 w-full justify-start rounded-2xl">
                    <Link to="/prefeitura/protocolos/novo">
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      Novo protocolo assistido
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 w-full justify-start rounded-2xl">
                    <Link to="/prefeitura">
                      <Building2 className="mr-2 h-4 w-4" />
                      Voltar ao painel municipal
                    </Link>
                  </Button>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
