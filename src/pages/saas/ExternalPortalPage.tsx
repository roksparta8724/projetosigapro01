import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FilePlus2,
  FolderKanban,
  History,
  MessageSquare,
  Search,
  ShieldAlert,
  Signature,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/platform/MetricCard";
import { MainContent, MainGrid, PageContainer, StatsCards } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import {
  formatCurrency,
  getOwnerLinksForProfessional,
  getOwnerMessagesForLink,
  getOwnerRequestsForProfessional,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  parseMarker,
  statusLabel,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

const quickMarkers = [
  { label: "em andamento", color: "#2563eb" },
  { label: "concluído", color: "#16a34a" },
  { label: "aguardando retorno", color: "#d97706" },
  { label: "pendência", color: "#dc2626" },
];

export function ExternalPortalPage() {
  const { session } = usePlatformSession();
  const {
    processes: allProcesses,
    ownerRequests,
    ownerLinks,
    ownerMessages,
    addProcessMarkerWithColor,
    removeProcessMarker,
    getInstitutionSettings,
    getUserProfile,
    respondOwnerRequest,
    setOwnerChatEnabled,
    sendOwnerMessage,
  } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const [markerDrafts, setMarkerDrafts] = useState<Record<string, string>>({});
  const [markerColors, setMarkerColors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const profile = getUserProfile(session.id, session.email);

  const pendingRequirements = processes.reduce(
    (count, process) => count + (process.requirements ?? []).filter((item) => item.status === "aberta" || item.status === "respondida").length,
    0,
  );
  const pendingPayments = processes.filter((process) => process.payment?.status === "pendente").length;
  const signedBlocks = processes.reduce((count, process) => count + (process.signatures?.length ?? 0), 0);
  const concludedProcesses = processes.filter((process) => process.status === "aprovado" || process.status === "concluido").length;
  const activeProcesses = processes.length - concludedProcesses;

  const filteredProcesses = useMemo(() => {
    return processes.filter((process) => {
      const matchesStatus = statusFilter === "todos" || process.status === statusFilter;
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        process.protocol.toLowerCase().includes(normalizedSearch) ||
        process.title.toLowerCase().includes(normalizedSearch) ||
        process.address.toLowerCase().includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [processes, search, statusFilter]);

  const recentActivity = useMemo(
    () =>
      [...processes]
        .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
        .slice(0, 4),
    [processes],
  );

  const ownerRequestsForProfessional = useMemo(
    () => getOwnerRequestsForProfessional(session.id, ownerRequests),
    [ownerRequests, session.id],
  );
  const ownerLinksForProfessional = useMemo(
    () => getOwnerLinksForProfessional(session.id, ownerLinks),
    [ownerLinks, session.id],
  );
  const [selectedOwnerLinkId, setSelectedOwnerLinkId] = useState<string | null>(null);
  const [ownerMessageDraft, setOwnerMessageDraft] = useState("");
  const selectedOwnerLink =
    ownerLinksForProfessional.find((link) => link.id === selectedOwnerLinkId) ?? ownerLinksForProfessional[0] ?? null;
  const selectedOwnerMessages = selectedOwnerLink
    ? getOwnerMessagesForLink(selectedOwnerLink, ownerMessages)
    : [];
  const selectedOwnerProcess = selectedOwnerLink
    ? processes.find((process) => process.id === selectedOwnerLink.projectId)
    : null;

  return (
    <PortalFrame eyebrow="Acesso do profissional" title="Acompanhamento de protocolos, exigências, pagamentos e andamento">
      <PageContainer>
        <PageIntro
          eyebrow="Painel do profissional externo"
          title="Protocolos, pendências e pagamentos"
          description="Acompanhe o fluxo, consulte guias e abra novos protocolos com mais clareza."
          icon={FolderKanban}
          actions={
            <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
              <Link to="/externo/protocolar">
                <FilePlus2 className="mr-2 h-4 w-4" />
                Novo protocolo
              </Link>
            </Button>
          }
        />

        <StatsCards className="2xl:grid-cols-5">
          <MetricCard title="Em andamento" value={String(activeProcesses)} helper="Protocolos ativos" icon={Waypoints} tone="blue" />
          <MetricCard title="Concluídos" value={String(concludedProcesses)} helper="Processos finalizados" icon={CheckCircle2} tone="emerald" />
          <MetricCard title="Exigências abertas" value={String(pendingRequirements)} helper="Pendências com retorno" icon={AlertCircle} tone="amber" />
          <MetricCard title="Pagamentos pendentes" value={String(pendingPayments)} helper="Guias aguardando compensação" icon={CreditCard} tone="rose" />
          <MetricCard title="Assinaturas" value={String(signedBlocks)} helper="Blocos assinados" icon={Signature} tone="emerald" />
        </StatsCards>

        <MainGrid>
          <MainContent className="xl:col-span-12">
            <SectionPanel
              title="Meus protocolos e processos"
              description="Consulte status, etapa atual, guias e pendências em um único painel."
              actions={
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="relative min-w-[280px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar por protocolo, projeto ou endereço"
                      className="h-11 rounded-2xl pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 rounded-2xl sig-dark-panel">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      <SelectItem value="pagamento_pendente">Pagamento pendente</SelectItem>
                      <SelectItem value="analise_tecnica">Em análise</SelectItem>
                      <SelectItem value="aguardando_documentos">Aguardando documentos</SelectItem>
                      <SelectItem value="aguardando_pagamento">Aguardando pagamento</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
              contentClassName="space-y-5"
            >
              <div className="hidden rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 xl:grid xl:grid-cols-[1.15fr_0.7fr_0.7fr_0.8fr_0.8fr_0.65fr] xl:gap-4">
                <span>Protocolo e projeto</span>
                <span>Status</span>
                <span>Etapa atual</span>
                <span>Abertura</span>
                <span>Responsável</span>
                <span className="text-right">Ações</span>
              </div>

              {filteredProcesses.map((process) => {
                const openRequirements = (process.requirements ?? []).filter((item) => item.status === "aberta" || item.status === "respondida");
                const guides = getProcessPaymentGuides(process, tenantSettings);
                const markerDraft = markerDrafts[process.id] ?? "";
                const markerColor = markerColors[process.id] ?? "#2563eb";
                const processTags = process.tags ?? [];
                const createdDate = new Date(process.createdAt).toLocaleDateString("pt-BR");
                const pendingGuide = guides.find((guide) => guide.status !== "compensada");

                return (
                  <div key={process.id} className="sig-dark-panel rounded-[8px] border border-[#E5E7EB] p-5 shadow-sm">
                    <div className="flex flex-col gap-5">
                      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.7fr_0.7fr_0.8fr_0.8fr_0.65fr] xl:items-start">
                        <div className="min-w-0">
                          <p className="sig-fit-title text-lg font-semibold leading-7 text-slate-950" title={process.protocol}>{process.protocol}</p>
                          <p className="mt-1 line-clamp-2 text-base font-semibold leading-7 text-slate-900" title={process.title}>{process.title}</p>
                          <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500">{process.type}</p>
                          <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500">{process.address}</p>
                        </div>

                        <div className="min-w-0 space-y-2">
                          <Badge variant="outline" className="inline-flex max-w-full rounded-full capitalize">
                            <span className="sig-fit-title">{statusLabel(process.status)}</span>
                          </Badge>
                          {openRequirements.length > 0 ? (
                            <Badge variant="outline" className="inline-flex max-w-full border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400">
                              <span className="sig-fit-title">Exigência aberta</span>
                            </Badge>
                          ) : null}
                          {pendingGuide ? (
                            <Badge variant="outline" className="inline-flex max-w-full border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
                              <span className="sig-fit-title">Pagamento pendente</span>
                            </Badge>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-900">{statusLabel(process.status)}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">Etapa atual</p>
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-6 text-slate-900">{createdDate}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">Data de abertura</p>
                        </div>

                        <div className="min-w-0">
                          <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-900" title={process.technicalLead}>
                            {process.technicalLead}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">Responsável técnico</p>
                        </div>

                        <div className="flex xl:justify-end">
                          <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
                            <Link to={`/processos/${process.id}`}>Abrir</Link>
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-3">
                        <div className="sig-dark-panel flex min-h-[112px] flex-col justify-between rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                          <p className="sig-label">Etapa atual</p>
                          <p className="mt-2 line-clamp-2 text-lg font-semibold text-slate-950" title={statusLabel(process.status)}>{statusLabel(process.status)}</p>
                          <p className="sig-field-help mt-1">Andamento do protocolo</p>
                        </div>
                        <div className="sig-dark-panel flex min-h-[112px] flex-col justify-between rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                          <p className="sig-label">Guia inicial</p>
                          <p className="sig-fit-title mt-2 text-base font-semibold leading-7 text-slate-950" title={guides[0]?.code || "Sem guia"}>
                            {guides[0]?.code || "Sem guia emitida"}
                          </p>
                          <p className="sig-field-help mt-1">{guides[0]?.status === "compensada" ? "Pagamento confirmado" : "Pagamento pendente"}</p>
                        </div>
                        <div className="sig-dark-panel flex min-h-[112px] flex-col justify-between rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                          <p className="sig-label">Financeiro em etapas</p>
                          <p className="sig-fit-title mt-2 text-lg font-semibold leading-7 text-slate-950" title={formatCurrency(guides.reduce((sum, guide) => sum + guide.amount, 0))}>{formatCurrency(guides.reduce((sum, guide) => sum + guide.amount, 0))}</p>
                          <p className="mt-1 text-[15px] leading-6 text-slate-500">Protocolo, ISSQN e aprovação final</p>
                        </div>
                      </div>

                      <div className="sig-dark-panel rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                        <p className="sig-label">Marcadores do processo</p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {processTags.map((tag) => (
                            <div
                              key={tag}
                              className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                              style={{ backgroundColor: `${parseMarker(tag).color}18`, color: parseMarker(tag).color }}
                            >
                              <span className="sig-fit-title">{parseMarker(tag).label}</span>
                              <button
                                type="button"
                                className="shrink-0 rounded-full p-0.5 transition hover:bg-black/10"
                                onClick={() => removeProcessMarker(process.id, tag, session.name)}
                              >
                                <span className="sr-only">Remover marcador</span>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_64px_auto]">
                          <Input
                            value={markerDraft}
                            onChange={(event) => setMarkerDrafts((current) => ({ ...current, [process.id]: event.target.value }))}
                            placeholder="Criar marcador personalizado para este processo"
                            className="rounded-2xl"
                          />
                          <Input
                            type="color"
                            value={markerColor}
                            onChange={(event) => setMarkerColors((current) => ({ ...current, [process.id]: event.target.value }))}
                            className="h-11 w-16 rounded-2xl p-1"
                          />
                          <Button
                            type="button"
                            className="rounded-full bg-slate-950 hover:bg-slate-900"
                            onClick={() => {
                              if (!markerDraft.trim()) return;
                              addProcessMarkerWithColor(process.id, markerDraft, markerColor, session.name);
                              setMarkerDrafts((current) => ({ ...current, [process.id]: "" }));
                            }}
                          >
                            Salvar marcador
                          </Button>
                        </div>

                        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                          <Select
                            onValueChange={(value) => {
                              const chosen = quickMarkers.find((item) => item.label === value);
                              if (!chosen) return;
                              addProcessMarkerWithColor(process.id, chosen.label, chosen.color, session.name);
                            }}
                          >
                            <SelectTrigger className="rounded-2xl sig-dark-panel">
                              <SelectValue placeholder="Aplicar marcador rápido" />
                            </SelectTrigger>
                            <SelectContent>
                              {quickMarkers.map((item) => (
                                <SelectItem key={item.label} value={item.label}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex flex-wrap gap-2">
                            {processTags.map((tag) => (
                              <div
                                key={`quick-${tag}`}
                                className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                                style={{ backgroundColor: `${parseMarker(tag).color}18`, color: parseMarker(tag).color }}
                              >
                                <span className="sig-fit-title">{parseMarker(tag).label}</span>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-full p-0.5 transition hover:bg-black/10"
                                  onClick={() => removeProcessMarker(process.id, tag, session.name)}
                                >
                                  <span className="sr-only">Remover marcador</span>
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {openRequirements.length > 0 ? (
                        <div className="rounded-[8px] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
                          <p className="font-semibold">Pendências formais</p>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {openRequirements.map((item) => (
                              <div key={item.id} className="sig-dark-panel rounded-[8px] p-4 shadow-sm">
                                <p className="line-clamp-2 font-medium">{item.title}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">Prazo {item.dueDate}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {filteredProcesses.length === 0 ? (
                <div className="sig-dark-panel rounded-[8px] border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-lg font-semibold text-slate-900">Nenhum protocolo encontrado para este filtro.</p>
                  <p className="mt-2 text-[15px] leading-6 text-slate-600">Ajuste os filtros ou abra um novo protocolo para iniciar o fluxo.</p>
                </div>
              ) : null}

              <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-600 dark:text-amber-400 shadow-sm">
                <div className="flex items-center gap-3 font-semibold">
                  <ShieldAlert className="h-4 w-4" />
                  Proteção de dados ativa
                </div>
                <p className="mt-2">
                  O acesso externo não compartilha protocolos entre profissionais. A abertura por URL direta também é bloqueada pela regra de acesso.
                </p>
              </div>
            </SectionPanel>
          </MainContent>
        </MainGrid>

        <MainGrid className="mt-6">
          <MainContent className="xl:col-span-7">
            <SectionPanel
              title="Solicitações de acompanhamento"
              description="Proprietários solicitando acesso ao acompanhamento. O contato é feito somente com o profissional."
              contentClassName="space-y-4"
            >
              {ownerRequestsForProfessional.length === 0 ? (
                <div className="sig-dark-panel rounded-[8px] border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  Nenhuma solicitação pendente no momento.
                </div>
              ) : (
                ownerRequestsForProfessional.map((request) => {
                  const process = processes.find((item) => item.id === request.projectId);
                  const ownerProfile = getUserProfile(request.ownerUserId);
                  return (
                    <div key={request.id} className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-slate-500">Protocolo</p>
                          <p className="text-base font-semibold text-slate-900">{process?.protocol ?? "Processo"}</p>
                          <p className="mt-1 text-sm text-slate-600">{process?.title ?? "Solicitação de acompanhamento"}</p>
                          <p className="mt-2 text-sm text-slate-500">
                            Proprietário: {ownerProfile?.fullName ?? "Não informado"}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full capitalize">
                          {request.status === "approved"
                            ? "Aprovado"
                            : request.status === "rejected"
                              ? "Recusado"
                              : "Pendente"}
                        </Badge>
                      </div>
                      {request.status === "pending" ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button
                            className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() =>
                              void respondOwnerRequest({
                                requestId: request.id,
                                status: "approved",
                                professionalUserId: session.id,
                              })
                            }
                          >
                            Aprovar acesso
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            onClick={() =>
                              void respondOwnerRequest({
                                requestId: request.id,
                                status: "rejected",
                                professionalUserId: session.id,
                              })
                            }
                          >
                            Recusar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </SectionPanel>
          </MainContent>

          <div className="space-y-6 xl:col-span-5">
            <SectionPanel
              title="Proprietários vinculados"
              description="Controle o acesso e converse diretamente com o proprietário. A Prefeitura não participa desse canal."
              contentClassName="space-y-4"
            >
              {ownerLinksForProfessional.length === 0 ? (
                <div className="sig-dark-panel rounded-[8px] border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  Nenhum proprietário aprovado ainda.
                </div>
              ) : (
                ownerLinksForProfessional.map((link) => {
                  const process = processes.find((item) => item.id === link.projectId);
                  const ownerProfile = getUserProfile(link.ownerUserId);
                  return (
                    <div key={link.id} className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-500">Protocolo</p>
                          <p className="text-base font-semibold text-slate-900">{process?.protocol ?? "Processo"}</p>
                          <p className="mt-1 text-sm text-slate-600">{ownerProfile?.fullName ?? "Proprietário"}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {link.chatEnabled ? "Chat ativo" : "Chat desativado"}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() => {
                            setSelectedOwnerLinkId(link.id);
                          }}
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Ver mensagens
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            void setOwnerChatEnabled({
                              linkId: link.id,
                              enabled: !link.chatEnabled,
                              actor: session.id,
                            })
                          }
                        >
                          {link.chatEnabled ? "Desativar chat" : "Ativar chat"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </SectionPanel>

            {selectedOwnerLink && selectedOwnerProcess ? (
              <SectionPanel
                title="Mensagens com proprietário"
                description="Conversa privada vinculada ao protocolo. Use este canal apenas para orientações técnicas."
                contentClassName="space-y-4"
              >
                <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-3">
                  <p className="text-sm text-slate-500">Protocolo</p>
                  <p className="text-base font-semibold text-slate-900">{selectedOwnerProcess.protocol}</p>
                </div>
                <div className="space-y-3">
                  {selectedOwnerMessages.length === 0 ? (
                    <div className="sig-dark-panel rounded-[8px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                      Nenhuma mensagem enviada ainda.
                    </div>
                  ) : (
                    selectedOwnerMessages.map((message) => (
                      <div key={message.id} className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                          {message.senderUserId === session.id ? "Você" : "Proprietário"}
                        </p>
                        <p className="mt-2 leading-6 text-slate-800">{message.message}</p>
                      </div>
                    ))
                  )}
                </div>
                {selectedOwnerLink.chatEnabled ? (
                  <div className="space-y-3">
                    <Input
                      value={ownerMessageDraft}
                      onChange={(event) => setOwnerMessageDraft(event.target.value)}
                      placeholder="Escreva uma mensagem ao proprietário"
                      className="h-11 rounded-2xl"
                    />
                    <Button
                      className="rounded-full bg-slate-950 hover:bg-slate-900"
                      onClick={() => {
                        if (!selectedOwnerLink || !ownerMessageDraft.trim()) return;
                        void sendOwnerMessage({
                          projectId: selectedOwnerLink.projectId,
                          ownerUserId: selectedOwnerLink.ownerUserId,
                          professionalUserId: selectedOwnerLink.professionalUserId,
                          senderUserId: session.id,
                          message: ownerMessageDraft,
                        });
                        setOwnerMessageDraft("");
                      }}
                    >
                      Enviar mensagem
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-50 p-3 text-sm text-amber-700">
                    O chat está desativado para este proprietário.
                  </div>
                )}
              </SectionPanel>
            ) : null}
          </div>
        </MainGrid>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <SectionPanel title="Painel do profissional" description="Contexto do perfil, ações rápidas e histórico recente." contentClassName="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <div className="sig-dark-panel min-w-0 rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                <p className="sig-label">Resumo do acesso</p>
                <div className="mt-3 space-y-2">
                  <p className="text-[15px] font-medium leading-6 text-slate-800">Responsável técnico: {profile?.fullName || session.name}</p>
                  <p className="text-[15px] font-medium leading-6 text-slate-800">Registro profissional: {profile?.registrationNumber || "Atualize em Meu Perfil"}</p>
                  <p className="text-[15px] font-medium leading-6 text-slate-800">Secretaria responsável: {tenantSettings?.secretariaResponsavel || "Não configurada"}</p>
                </div>
              </div>

              <div className="sig-dark-panel min-w-0 rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-900" />
                  <p className="sig-fit-title text-base font-semibold leading-6 text-slate-950">Ações rápidas</p>
                </div>
                <div className="mt-4 grid gap-3">
                  <Button asChild variant="outline" className="w-full min-w-0 justify-start overflow-hidden rounded-2xl px-4">
                    <Link to="/perfil">
                      <FolderKanban className="mr-2 h-4 w-4 shrink-0" />
                      <span className="sig-fit-title">Atualizar dados profissionais</span>
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="sig-dark-panel min-w-0 rounded-[8px] border border-[#E5E7EB] p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-900" />
                  <p className="sig-fit-title text-base font-semibold leading-6 text-slate-950">Histórico recente</p>
                </div>
                <div className="mt-4 space-y-3">
                  {recentActivity.length === 0 ? (
                    <p className="text-[15px] leading-6 text-slate-600">Nenhuma movimentação recente encontrada para este perfil.</p>
                  ) : (
                    recentActivity.slice(0, 2).map((process) => (
                      <div key={`history-${process.id}`} className="sig-dark-panel rounded-[8px] border border-[#E5E7EB] p-4">
                        <p className="text-[15px] font-medium leading-6 text-slate-900">{process.protocol}</p>
                        <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-slate-600">{process.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">Etapa atual: {statusLabel(process.status)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </SectionPanel>

          <SectionPanel title="Andamento do fluxo" description="Passos essenciais para acompanhar o processo com clareza." contentClassName="space-y-3 text-sm text-slate-700">
            {[
              "1. Abra um novo protocolo apenas quando tiver os dados e documentos prontos.",
              "2. Acompanhe aqui as exigências, guias e a situação de cada processo.",
              "3. Use a tela de novo protocolo como área principal de cadastro e envio.",
            ].map((step) => (
              <div key={step} className="sig-dark-panel rounded-[8px] border border-[#E5E7EB] px-4 py-3 text-[15px] leading-6 text-slate-700">
                {step}
              </div>
            ))}
          </SectionPanel>
        </div>
      </PageContainer>
    </PortalFrame>
  );
}


