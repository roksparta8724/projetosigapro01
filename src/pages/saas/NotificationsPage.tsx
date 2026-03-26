import { AlertCircle, BellRing, MessageSquareMore, Send, Wallet } from "lucide-react";
import { PageHero } from "@/components/platform/PageHero";
import { PageMainContent, PageMainGrid, PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { getVisibleProcessesByScope } from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function NotificationsPage() {
  const { session } = usePlatformSession();
  const { scopeId } = useMunicipality();
  const { processes: allProcesses } = usePlatformData();
  const processes = getVisibleProcessesByScope(session, scopeId, allProcesses);

  const notifications = processes.flatMap((process) => [
    ...process.messages.map((message) => ({
      id: message.id,
      title: `${process.protocol} - nova mensagem`,
      detail: message.message,
      icon: MessageSquareMore,
      time: message.at,
    })),
    ...process.dispatches.map((dispatch) => ({
      id: dispatch.id,
      title: `${process.protocol} - tramitação`,
      detail: `${dispatch.subject} (${dispatch.from} para ${dispatch.to})`,
      icon: Send,
      time: dispatch.dueDate,
    })),
    ...process.requirements
      .filter((item) => item.status === "aberta" || item.status === "respondida")
      .map((item) => ({
        id: item.id,
        title: `${process.protocol} - exigência formal`,
        detail: `${item.title} com prazo ${item.dueDate}.`,
        icon: AlertCircle,
        time: item.createdAt,
      })),
    {
      id: `${process.id}-guide`,
      title: `${process.protocol} - guia`,
      detail: `Guia ${process.payment.guideNumber} com status ${process.payment.status}.`,
      icon: Wallet,
      time: process.payment.dueDate,
    },
  ]);
  const messagesCount = notifications.filter((item) => item.icon === MessageSquareMore).length;
  const dispatchCount = notifications.filter((item) => item.icon === Send).length;
  const requirementsCount = notifications.filter((item) => item.icon === AlertCircle).length;

  return (
    <PortalFrame eyebrow="Notificações" title="Notificações do ambiente">
      <PageShell>
        <PageHero
          eyebrow="🔔 Notificações"
          title="Mensagens, tramitações e eventos do ambiente"
          description="Acompanhe o que mudou no escopo atual com leitura mais objetiva."
          icon={BellRing}
        />
        <PageStatsRow>
          <StatCard label="🔔 Notificações" value={String(notifications.length)} description="Eventos visíveis no escopo atual" icon={BellRing} tone="blue" />
          <StatCard label="💬 Mensagens" value={String(messagesCount)} description="Mensagens internas e externas" icon={MessageSquareMore} tone="emerald" />
          <StatCard label="📤 Tramitações" value={String(dispatchCount)} description="Despachos e circulação entre filas" icon={Send} tone="amber" />
          <StatCard label="📌 Exigências" value={String(requirementsCount)} description="Pendências formais em aberto" icon={AlertCircle} tone="default" />
        </PageStatsRow>
        <PageMainGrid>
          <PageMainContent className="xl:col-span-12">
            <SectionCard title="🔔 Central de notificações" description="Leitura consolidada de mensagens, trâmites e itens financeiros.">
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div key={notification.id} className="rounded-[20px] border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-slate-100 text-slate-700">
                        <notification.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950" title={notification.title}>
                          {notification.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600" title={notification.detail}>
                          {notification.detail}
                        </p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </PageMainContent>
        </PageMainGrid>
      </PageShell>
    </PortalFrame>
  );
}
