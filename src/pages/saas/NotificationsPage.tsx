import { AlertCircle, BellRing, CheckCheck, MessageSquareMore, Send, Signature, Trash2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActivityList, type ActivityItem } from "@/components/platform/ActivityList";
import { EmptyState, EmptyStateAction } from "@/components/platform/EmptyState";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageHeader } from "@/components/platform/PageHeader";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageSideContent,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { QuickActionsCard } from "@/components/platform/QuickActionsCard";
import { SectionCard } from "@/components/platform/SectionCard";
import { SummaryCard } from "@/components/platform/SummaryCard";
import { TableContainer } from "@/components/platform/TableContainer";
import {
  buildProcessPath, formatOfficialProcessNumber, getProcessPaymentGuides, getVisibleProcessesByScope } from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useNotifications } from "@/hooks/useNotifications";
import { sendMasterSupportNotification } from "@/integrations/notifications/notificationClient";

type NotificationView = "visao-geral" | "notificacoes" | "mensagens" | "tramites" | "pendencias";

export function NotificationsPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId, tenantSettingsCompat } = useMunicipality();
  const { processes: allProcesses } = usePlatformData();
  const {
    notifications: officialNotifications,
    unreadCount,
    loading: notificationsLoading,
    error: notificationsError,
    markRead,
    markAllRead,
    deleteNotifications,
  } = useNotifications({ includeItems: true, limit: 150, pollMs: 10000 });
  const [view, setView] = useState<NotificationView>("visao-geral");
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([]);
  const [notificationBulkBusy, setNotificationBulkBusy] = useState<"" | "read" | "delete">("");
  const [notificationBulkError, setNotificationBulkError] = useState("");
  const [masterSupportTitle, setMasterSupportTitle] = useState("");
  const [masterSupportMessage, setMasterSupportMessage] = useState("");
  const [masterSupportBusy, setMasterSupportBusy] = useState(false);
  const [masterSupportStatus, setMasterSupportStatus] = useState("");
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;

  const handleMasterSupport = async () => {
    const title = masterSupportTitle.trim();
    const message = masterSupportMessage.trim();
    if (!title || !message || masterSupportBusy) return;

    setMasterSupportBusy(true);
    setMasterSupportStatus("");
    try {
      const recipients = await sendMasterSupportNotification({ title, message });
      setMasterSupportTitle("");
      setMasterSupportMessage("");
      setMasterSupportStatus(
        recipients > 0
          ? `Aviso enviado ao Master com sucesso (${recipients} destinatário(s)).`
          : "Nenhuma conta Master ativa recebeu o aviso.",
      );
    } catch (error) {
      setMasterSupportStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o aviso ao Master.",
      );
    } finally {
      setMasterSupportBusy(false);
    }
  };

  const processes = useMemo(
    () => getVisibleProcessesByScope(session, effectiveScopeId, allProcesses),
    [allProcesses, effectiveScopeId, session],
  );

  const messageItems = useMemo<ActivityItem[]>(
    () =>
      processes.flatMap((process) =>
        process.messages.map((message) => ({
          id: message.id,
          title: formatOfficialProcessNumber(process.protocol),
          description: message.message,
          meta: `Mensagem · ${message.at}`,
          badge: "Mensagem",
          icon: MessageSquareMore,
          action: (
            <Link
              to={buildProcessPath(process)}
              className="sig-dark-action-btn inline-flex rounded-full px-3 py-1.5 text-xs font-medium text-slate-50"
            >
              Abrir
            </Link>
          ),
        })),
      ),
    [processes],
  );

  const dispatchItems = useMemo<ActivityItem[]>(
    () =>
      processes.flatMap((process) =>
        process.dispatches.map((dispatch) => ({
          id: dispatch.id,
          title: `${formatOfficialProcessNumber(process.protocol)} · ${dispatch.subject}`,
          description: `${dispatch.from} -> ${dispatch.to}`,
          meta: `Trâmite · prazo ${dispatch.dueDate}`,
          badge: dispatch.status,
          icon: Send,
          action: (
            <Link
              to={buildProcessPath(process)}
              className="sig-dark-action-btn inline-flex rounded-full px-3 py-1.5 text-xs font-medium text-slate-50"
            >
              Ver fluxo
            </Link>
          ),
        })),
      ),
    [processes],
  );

  const requirementItems = useMemo<ActivityItem[]>(
    () =>
      processes.flatMap((process) =>
        process.requirements
          .filter((item) => item.status === "aberta" || item.status === "respondida")
          .map((item) => ({
            id: item.id,
            title: `${formatOfficialProcessNumber(process.protocol)} · ${item.title}`,
            description: item.description,
            meta: `Pendência · prazo ${item.dueDate}`,
            badge: item.status,
            icon: AlertCircle,
            action: (
              <Link
                to={buildProcessPath(process)}
                className="sig-dark-action-btn inline-flex rounded-full px-3 py-1.5 text-xs font-medium text-slate-50"
              >
                Tratar
              </Link>
            ),
          })),
      ),
    [processes],
  );

  const financeItems = useMemo<ActivityItem[]>(
    () =>
      processes.flatMap((process) =>
        getProcessPaymentGuides(process, tenantSettingsCompat).map((guide) => ({
          id: `${process.id}-guide-${guide.kind}`,
          title: `${formatOfficialProcessNumber(process.protocol)} · ${guide.label}`,
          description: `${guide.code} · status ${guide.status} · vencimento ${guide.dueDate}`,
          meta: "Financeiro",
          badge: guide.status,
          icon: Wallet,
          action: (
            <Link
              to={buildProcessPath(process)}
              className="sig-dark-action-btn inline-flex rounded-full px-3 py-1.5 text-xs font-medium text-slate-50"
            >
              Abrir
            </Link>
          ),
        })),
      ),
    [processes, tenantSettingsCompat],
  );

  const processById = useMemo(
    () => new Map(processes.map((process) => [process.id, process] as const)),
    [processes],
  );

  const selectableNotificationIds = useMemo(
    () => officialNotifications.map((item) => item.id),
    [officialNotifications],
  );
  const allNotificationsSelected =
    selectableNotificationIds.length > 0 &&
    selectableNotificationIds.every((id) => selectedNotificationIds.includes(id));

  const toggleNotificationSelection = (notificationId: string) => {
    setSelectedNotificationIds((current) =>
      current.includes(notificationId)
        ? current.filter((id) => id !== notificationId)
        : [...current, notificationId],
    );
  };

  const toggleAllNotifications = () => {
    setSelectedNotificationIds(
      allNotificationsSelected ? [] : selectableNotificationIds,
    );
  };

  const markSelectedNotificationsRead = async () => {
    if (selectedNotificationIds.length === 0 || notificationBulkBusy) return;
    setNotificationBulkBusy("read");
    try {
      await Promise.all(
        selectedNotificationIds.map((id) => markRead(id, true)),
      );
      setSelectedNotificationIds([]);
    } finally {
      setNotificationBulkBusy("");
    }
  };

  const deleteSelectedNotifications = async () => {
    if (selectedNotificationIds.length === 0 || notificationBulkBusy) return;
    setNotificationBulkBusy("delete");
    setNotificationBulkError("");
    try {
      await deleteNotifications(selectedNotificationIds);
      setSelectedNotificationIds([]);
    } catch (error) {
      setNotificationBulkError(
        error instanceof Error
          ? error.message
          : "Não foi possível apagar as notificações selecionadas.",
      );
    } finally {
      setNotificationBulkBusy("");
    }
  };

  const deleteAllNotifications = async () => {
    if (officialNotifications.length === 0 || notificationBulkBusy) return;
    setNotificationBulkBusy("delete");
    setNotificationBulkError("");
    try {
      await deleteNotifications();
      setSelectedNotificationIds([]);
    } catch (error) {
      setNotificationBulkError(
        error instanceof Error
          ? error.message
          : "Não foi possível apagar todas as notificações.",
      );
    } finally {
      setNotificationBulkBusy("");
    }
  };

  const officialNotificationItems = useMemo<ActivityItem[]>(
    () =>
      officialNotifications.map((notification) => {
        const linkedProcess = notification.processId
          ? processById.get(notification.processId)
          : undefined;
        const target =
          notification.actionUrl ||
          (linkedProcess ? buildProcessPath(linkedProcess) : "");

        const icon =
          notification.type === "assinatura"
            ? Signature
            : notification.type === "financeiro"
              ? Wallet
              : notification.type === "exigencia"
                ? AlertCircle
                : notification.type === "mensagem"
                  ? MessageSquareMore
                  : notification.type === "tramite"
                    ? Send
                    : BellRing;

        return {
          id: `official-${notification.id}`,
          title: notification.title,
          description: notification.message,
          meta: `${notification.isRead ? "Lida" : "Nova"} · ${new Date(
            notification.createdAt,
          ).toLocaleString("pt-BR")}`,
          badge: notification.isRead ? notification.category : "Nova",
          icon,
          action: (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedNotificationIds.includes(notification.id)}
                  onChange={() => toggleNotificationSelection(notification.id)}
                  className="h-4 w-4 rounded border-slate-300"
                  aria-label={`Selecionar notificação ${notification.title}`}
                />
                Selecionar
              </label>
              {!notification.isRead ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => void markRead(notification.id)}
                >
                  Marcar lida
                </button>
              ) : null}
              {target ? (
                <Link
                  to={target}
                  onClick={() => {
                    if (!notification.isRead) void markRead(notification.id);
                  }}
                  className="sig-dark-action-btn inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-medium text-slate-50"
                >
                  Abrir
                </Link>
              ) : null}
            </div>
          ),
        };
      }),
    [markRead, officialNotifications, processById, selectedNotificationIds],
  );

  const operationalItems = useMemo(
    () => [...messageItems, ...dispatchItems, ...requirementItems, ...financeItems],
    [dispatchItems, financeItems, messageItems, requirementItems],
  );

  const notificationItems = useMemo(
    () => [...officialNotificationItems, ...operationalItems],
    [officialNotificationItems, operationalItems],
  );

  const tabs = [
    { value: "visao-geral", label: "Visão geral", helper: "Leitura executiva" },
    { value: "notificacoes", label: "Notificações", helper: "Central consolidada" },
    { value: "mensagens", label: "Mensagens", helper: "Comunicação ativa" },
    { value: "tramites", label: "Trâmites", helper: "Despachos e circulação" },
    { value: "pendencias", label: "Pendências", helper: "Exigências e atenção" },
  ] as const;

  const mainFeed = notificationItems.slice(0, 10);
  const recentMessages = messageItems.slice(0, 4);
  const pendingAttention = requirementItems.slice(0, 4);

  const renderFeed = (items: ActivityItem[], emptyTitle: string, emptyDescription: string) =>
    items.length === 0 ? (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={BellRing}
        className="sig-dark-panel border-slate-200 bg-transparent"
        action={
          <EmptyStateAction asChild className="sig-dark-action-btn text-slate-50">
            <Link to="/prefeitura/protocolos">Abrir protocolos</Link>
          </EmptyStateAction>
        }
      />
    ) : (
      <ActivityList items={items} />
    );

  return (
    <PortalFrame eyebrow="Notificações" title="Central de notificações">
      <PageShell>
        <PageHeader
          eyebrow="Monitoramento institucional"
          title="Mensagens, trâmites e pendências do ambiente"
          description="Acompanhe o que mudou no escopo atual sem misturar histórico, operação e apoio em uma única coluna."
          icon={BellRing}
        />

        <PageStatsRow>
          <SummaryCard
            title="Total monitorado"
            value={String(notificationItems.length)}
            helper={unreadCount > 0 ? `${unreadCount} notificação(ões) não lida(s)` : "Nenhuma notificação não lida"}
            icon={BellRing}
            tone="blue"
          />
          <SummaryCard
            title="Mensagens"
            value={String(messageItems.length)}
            helper="Comunicação interna e externa"
            icon={MessageSquareMore}
            tone="emerald"
          />
          <SummaryCard
            title="Trâmites"
            value={String(dispatchItems.length)}
            helper="Despachos em circulação"
            icon={Send}
            tone="amber"
          />
          <SummaryCard
            title="Pendências"
            value={String(requirementItems.length)}
            helper="Itens que pedem ação"
            icon={AlertCircle}
            tone="rose"
          />
        </PageStatsRow>

        <InternalTabs
          items={tabs as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={view}
          onChange={(value) => setView(value as NotificationView)}
        />

        {view === "visao-geral" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableContainer
                title="Fluxo principal"
                description="Eventos recentes com prioridade de leitura institucional."
                icon={BellRing}
              >
                {renderFeed(
                  mainFeed,
                  "Nenhuma notificação recente",
                  "Quando houver atividade relevante, ela aparecerá aqui de forma consolidada.",
                )}
              </TableContainer>

              <div className="grid gap-5 xl:grid-cols-2">
                <SectionCard
                  title="Mensagens recentes"
                  description="Trocas mais recentes do ambiente atual."
                  icon={MessageSquareMore}
                >
                  {renderFeed(
                    recentMessages,
                    "Nenhuma mensagem recente",
                    "As novas conversas entre Prefeitura, análise e acesso externo aparecem aqui.",
                  )}
                </SectionCard>

                <SectionCard
                  title="Itens que exigem atenção"
                  description="Pendências formais que influenciam o fluxo operacional."
                  icon={AlertCircle}
                >
                  {renderFeed(
                    pendingAttention,
                    "Nenhuma pendência aberta",
                    "As exigências formais e retornos pendentes ficam concentrados nesta área.",
                  )}
                </SectionCard>
              </div>
            </PageMainContent>

            <PageSideContent>
              <QuickActionsCard
                title="Ações rápidas"
                description="Atalhos úteis sem competir com a leitura principal."
                actions={[
                  { id: "protocolos", label: "Abrir protocolos", icon: BellRing, href: "/prefeitura/protocolos" },
                  { id: "financeiro", label: "Ir para financeiro", icon: Wallet, href: "/prefeitura/financeiro" },
                  { id: "historico", label: "Ver histórico", icon: AlertCircle, href: "/historico" },
                ]}
              />

              {session.role === "prefeitura_admin" ? (
                <SectionCard
                  title="Suporte ao Master"
                  description="Canal administrativo. O Master não recebe notificações operacionais da Prefeitura; somente avisos enviados aqui."
                  icon={BellRing}
                >
                  <div className="space-y-3">
                    <Input
                      value={masterSupportTitle}
                      onChange={(event) => setMasterSupportTitle(event.target.value)}
                      placeholder="Assunto do aviso"
                      className="h-10 rounded-xl"
                    />
                    <Textarea
                      value={masterSupportMessage}
                      onChange={(event) => setMasterSupportMessage(event.target.value)}
                      placeholder="Descreva o que precisa da equipe Master"
                      className="min-h-[96px] rounded-xl"
                    />
                    <Button
                      type="button"
                      className="w-full rounded-xl"
                      disabled={
                        masterSupportBusy ||
                        !masterSupportTitle.trim() ||
                        !masterSupportMessage.trim()
                      }
                      onClick={() => void handleMasterSupport()}
                    >
                      {masterSupportBusy ? "Enviando..." : "Enviar aviso ao Master"}
                    </Button>
                    {masterSupportStatus ? (
                      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                        {masterSupportStatus}
                      </p>
                    ) : null}
                  </div>
                </SectionCard>
              ) : null}

              <SectionCard
                title="Resumo operacional"
                description="Leitura curta para saber onde agir primeiro."
                icon={Send}
              >
                <div className="space-y-3">
                  <div className="sig-dark-panel rounded-[18px] border border-slate-200 p-4">
                    <p className="sig-label">Maior volume</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {messageItems.length >= dispatchItems.length ? "Mensagens" : "Trâmites"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {messageItems.length >= dispatchItems.length
                        ? `${messageItems.length} comunicação(ões) registradas`
                        : `${dispatchItems.length} movimentação(ões) registradas`}
                    </p>
                  </div>
                  <div className="sig-dark-panel rounded-[18px] border border-slate-200 p-4">
                    <p className="sig-label">Atenção imediata</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {requirementItems.length > 0 ? `${requirementItems.length} item(ns)` : "Nenhum item crítico"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Use a aba de pendências para tratar exigências e retornos formais.
                    </p>
                  </div>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {view === "notificacoes" ? (
          <TableContainer
            title="Notificações direcionadas"
            description="Avisos oficiais destinados ao seu perfil, com leitura individual e atualização automática."
            icon={BellRing}
            actions={
              officialNotifications.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={toggleAllNotifications}
                  >
                    <input
                      type="checkbox"
                      checked={allNotificationsSelected}
                      readOnly
                      className="mr-2 h-4 w-4 rounded border-slate-300"
                      aria-hidden="true"
                    />
                    {allNotificationsSelected ? "Desmarcar todas" : "Selecionar todas"}
                  </button>

                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      disabled={Boolean(notificationBulkBusy)}
                      onClick={() => void markAllRead()}
                    >
                      <CheckCheck className="mr-2 h-4 w-4" />
                      Marcar todas como lidas
                    </button>
                  ) : null}

                  {selectedNotificationIds.length > 0 ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        disabled={Boolean(notificationBulkBusy)}
                        onClick={() => void markSelectedNotificationsRead()}
                      >
                        <CheckCheck className="mr-2 h-4 w-4" />
                        Marcar selecionadas como lidas
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        disabled={Boolean(notificationBulkBusy)}
                        onClick={() => void deleteSelectedNotifications()}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {allNotificationsSelected
                          ? "Apagar todas selecionadas"
                          : `Apagar selecionadas (${selectedNotificationIds.length})`}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      disabled={Boolean(notificationBulkBusy)}
                      onClick={() => void deleteAllNotifications()}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Apagar todas
                    </button>
                  )}
                </div>
              ) : null
            }
          >
            {notificationsError ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {notificationsError}
              </div>
            ) : null}
            {notificationBulkError ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {notificationBulkError}
              </div>
            ) : null}
            {notificationsLoading && officialNotificationItems.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                Atualizando notificações...
              </div>
            ) : (
              renderFeed(
                officialNotificationItems,
                "Nenhuma notificação direcionada",
                "Quando uma ação exigir sua atenção, ela aparecerá aqui automaticamente.",
              )
            )}
          </TableContainer>
        ) : null}

        {view === "mensagens" ? (
          <TableContainer
            title="Mensagens do ambiente"
            description="Comunicações internas e externas sem ruído adicional."
            icon={MessageSquareMore}
          >
            {renderFeed(
              messageItems,
              "Nenhuma mensagem encontrada",
              "As comunicações entre setores e usuários externos aparecerão aqui.",
            )}
          </TableContainer>
        ) : null}

        {view === "tramites" ? (
          <TableContainer
            title="Trâmites institucionais"
            description="Despachos, circulação entre filas e prazos vinculados."
            icon={Send}
          >
            {renderFeed(
              dispatchItems,
              "Nenhum trâmite encontrado",
              "Quando houver novos despachos, esta lista ficará disponível para consulta.",
            )}
          </TableContainer>
        ) : null}

        {view === "pendencias" ? (
          <TableContainer
            title="Pendências formais"
            description="Exigências, retornos e atenção operacional em uma fila limpa."
            icon={AlertCircle}
          >
            {renderFeed(
              requirementItems,
              "Nenhuma pendência encontrada",
              "Sem exigências abertas ou respostas pendentes no momento.",
            )}
          </TableContainer>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
