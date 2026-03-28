import { AlertCircle, BellRing, MessageSquareMore, Send, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { getVisibleProcessesByScope } from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type NotificationView = "visao-geral" | "notificacoes" | "mensagens" | "tramites" | "pendencias";

export function NotificationsPage() {
  const { session } = usePlatformSession();
  const { scopeId } = useMunicipality();
  const { processes: allProcesses } = usePlatformData();
  const [view, setView] = useState<NotificationView>("visao-geral");

  const processes = useMemo(
    () => getVisibleProcessesByScope(session, scopeId, allProcesses),
    [allProcesses, scopeId, session],
  );

  const messageItems = useMemo<ActivityItem[]>(
    () =>
      processes.flatMap((process) =>
        process.messages.map((message) => ({
          id: message.id,
          title: process.protocol,
          description: message.message,
          meta: `Mensagem · ${message.at}`,
          badge: "Mensagem",
          icon: MessageSquareMore,
          action: (
            <Link
              to={`/processos/${process.id}`}
              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
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
          title: `${process.protocol} · ${dispatch.subject}`,
          description: `${dispatch.from} → ${dispatch.to}`,
          meta: `Tramitação · prazo ${dispatch.dueDate}`,
          badge: dispatch.status,
          icon: Send,
          action: (
            <Link
              to={`/processos/${process.id}`}
              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
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
            title: `${process.protocol} · ${item.title}`,
            description: item.description,
            meta: `Pendência · prazo ${item.dueDate}`,
            badge: item.status,
            icon: AlertCircle,
            action: (
              <Link
                to={`/processos/${process.id}`}
                className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
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
      processes.map((process) => ({
        id: `${process.id}-guide`,
        title: `${process.protocol} · Guia ${process.payment.guideNumber}`,
        description: `Status ${process.payment.status} · vencimento ${process.payment.dueDate}`,
        meta: "Financeiro",
        badge: process.payment.status,
        icon: Wallet,
        action: (
          <Link
            to={`/processos/${process.id}`}
            className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            Abrir
          </Link>
        ),
      })),
    [processes],
  );

  const notificationItems = useMemo(
    () => [...messageItems, ...dispatchItems, ...requirementItems, ...financeItems],
    [dispatchItems, financeItems, messageItems, requirementItems],
  );

  const tabs = [
    { value: "visao-geral", label: "Visão geral", helper: "Leitura executiva" },
    { value: "notificacoes", label: "Notificações", helper: "Central consolidada" },
    { value: "mensagens", label: "Mensagens", helper: "Comunicação ativa" },
    { value: "tramites", label: "Trâmites", helper: "Despachos e circulação" },
    { value: "pendencias", label: "Pendências", helper: "Exigências e atenção" },
  ] as const;

  const mainFeed = notificationItems.slice(0, 8);
  const recentMessages = messageItems.slice(0, 4);
  const pendingAttention = requirementItems.slice(0, 4);

  const renderFeed = (items: ActivityItem[], emptyTitle: string, emptyDescription: string) =>
    items.length === 0 ? (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={BellRing}
        action={
          <EmptyStateAction asChild>
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
            helper="Eventos visíveis no escopo atual"
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
                {renderFeed(mainFeed, "Nenhuma notificação recente", "Quando houver atividade relevante, ela aparecerá aqui de forma consolidada.")}
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

              <SectionCard
                title="Resumo operacional"
                description="Leitura curta para saber onde agir primeiro."
                icon={Send}
              >
                <div className="space-y-3">
                  <div className="sig-dark-panel rounded-[18px] border border-slate-200 bg-slate-50 p-4">
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
                  <div className="sig-dark-panel rounded-[18px] border border-slate-200 bg-slate-50 p-4">
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
            title="Central consolidada"
            description="Leitura única de notificações, mensagens, trâmites e financeiro."
            icon={BellRing}
          >
            {renderFeed(
              notificationItems,
              "Nenhuma notificação encontrada",
              "O ambiente ainda não gerou eventos visíveis para este perfil.",
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
