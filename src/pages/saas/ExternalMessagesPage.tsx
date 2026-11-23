import { useMemo, useState } from "react";
import { MessageSquare, UserRound, Copy, MessageCircle, UserPlus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer, SideContent } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { formatOfficialProcessNumber, formatOfficialProcessTitle, getOwnerLinksForProfessional, getOwnerMessagesForLink, getOwnerRequestsForProfessional, getInstitutionClientSlug, processBelongsToExternalProfessional } from "@/lib/platform";
import { buildOwnerInvitationUrl } from "@/lib/ownerInvitation";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useOwnerAccessInbox } from "@/hooks/useOwnerAccessInbox";
import { useOwnerPrivateConversation } from "@/hooks/useOwnerPrivateConversation";
import { formatOwnerConversationTime } from "@/lib/ownerConversationDisplay";

export function ExternalMessagesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const {
    processes,
    tenants,
    ownerRequests,
    ownerLinks,
    ownerMessages,
    respondOwnerRequest,
    setOwnerChatEnabled,
    sendOwnerMessage,
    getUserProfile,
  } = usePlatformData();

  const activeTab = getExternalTabByPath(location.pathname);
  const ownProcesses = useMemo(
    () => processes.filter((process) => processBelongsToExternalProfessional(session, process)),
    [processes, session.id, session.email],
  );
  const [invitedProcessId, setInvitedProcessId] = useState("");
  const [invitationStatus, setInvitationStatus] = useState("");
  const invitedProcess = ownProcesses.find((process) => process.id === invitedProcessId)
    ?? ownProcesses[0] ?? null;
  const invitedTenant = invitedProcess
    ? tenants.find((institution) => institution.id === invitedProcess.tenantId)
    : null;
  const invitationUrl = invitedProcess && invitedTenant
    ? (() => {
        try {
          return buildOwnerInvitationUrl(
            window.location.origin,
            getInstitutionClientSlug(invitedTenant),
            invitedProcess.protocol,
          );
        } catch { return ""; }
      })()
    : "";
  const copyInvitation = async () => {
    if (!invitationUrl) {
      setInvitationStatus("Não foi possível identificar o protocolo ou a Prefeitura. Atualize os processos.");
      return;
    }
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setInvitationStatus("Convite copiado. Envie o link diretamente ao proprietário do imóvel.");
    } catch {
      setInvitationStatus("O navegador bloqueou a cópia. Selecione o endereço exibido abaixo e copie manualmente.");
    }
  };
  const shareInvitation = () => {
    if (!invitationUrl || !invitedProcess) return;
    const message = [
      "SIGAPRO — convite para acompanhar seu projeto.",
      `Protocolo: ${formatOfficialProcessNumber(invitedProcess.protocol)}`,
      "Acesse o link abaixo, crie ou entre em sua conta de proprietário e confirme seu CPF/CNPJ para solicitar acompanhamento:",
      invitationUrl,
      "O acesso à conversa será liberado após aprovação do profissional responsável.",
    ].join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  const inbox = useOwnerAccessInbox(session.id, ownerRequests, ownerLinks);
  const ownerRequestsForProfessional = useMemo(
    () => getOwnerRequestsForProfessional(session.id, inbox.requests),
    [inbox.requests, session.id],
  );
  const ownerLinksForProfessional = useMemo(
    () => getOwnerLinksForProfessional(session.id, inbox.links),
    [inbox.links, session.id],
  );
  const requestedConversationId = new URLSearchParams(location.search).get("conversa");
  const [selectedOwnerLinkId, setSelectedOwnerLinkId] = useState<string | null>(requestedConversationId);
  const [ownerMessageDraft, setOwnerMessageDraft] = useState("");
  const [ownerActionStatus, setOwnerActionStatus] = useState("");
  const [ownerActionBusy, setOwnerActionBusy] = useState("");

  const selectedOwnerLink =
    ownerLinksForProfessional.find((link) => link.id === requestedConversationId)
      ?? ownerLinksForProfessional.find((link) => link.id === selectedOwnerLinkId)
      ?? ownerLinksForProfessional[0] ?? null;
  const selectedOwnerMessages = selectedOwnerLink ? getOwnerMessagesForLink(selectedOwnerLink, ownerMessages) : [];
  const conversation = useOwnerPrivateConversation({
    link: selectedOwnerLink,
    initialMessages: selectedOwnerMessages,
    actorProfileId: session.id,
    active: Boolean(selectedOwnerLink),
  });
  const selectedOwnerProcess = selectedOwnerLink
    ? processes.find((process) => process.id === selectedOwnerLink.projectId)
    : null;
  const selectedOwnerProfile = selectedOwnerLink ? getUserProfile(selectedOwnerLink.ownerUserId) : null;

  const runOwnerAction = async (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    if (ownerActionBusy) return false;
    setOwnerActionBusy(key);
    setOwnerActionStatus("");
    try {
      const result = await action();
      if (result === null || result === false) {
        throw new Error("O banco não confirmou esta operação. Confira o vínculo e tente novamente.");
      }
      await inbox.refresh();
      setOwnerActionStatus(successMessage);
      return true;
    } catch (error) {
      setOwnerActionStatus(
        error instanceof Error
          ? `Não foi possível concluir a operação: ${error.message}`
          : "Não foi possível concluir a operação no banco oficial.",
      );
      return false;
    } finally {
      setOwnerActionBusy("");
    }
  };

  return (
    <PortalFrame eyebrow="Acesso Externo" title="Mensagens">
      <PageContainer>
        <PageIntro
          eyebrow="Mensagens"
          title="Solicitações e conversas com proprietários"
          description="Gerencie solicitações de acompanhamento e mantenha a comunicação centralizada."
          icon={MessageSquare}
          actions={
            <Button variant="outline" className="rounded-full" onClick={() => navigate("/externo/controle")}>
              Voltar ao controle
            </Button>
          }
        />

        {ownerActionStatus ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            ownerActionStatus.startsWith("Não foi possível")
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {ownerActionStatus}
          </div>
        ) : null}

        <InternalTabs
          items={externalTabs.map(({ value, label, helper }) => ({ value, label, helper }))}
          value={activeTab.value}
          onChange={(value) => {
            const target = externalTabs.find((tab) => tab.value === value);
            if (target) navigate(target.route);
          }}
        />

        {inbox.error ? (
          <p role="alert" className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-800">
            A atualização de solicitações e vínculos falhou: {inbox.error}
          </p>
        ) : null}
        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Iniciar conversa com proprietário"
              description="Escolha um protocolo seu e envie um convite de acesso. O proprietário não precisa informar o número manualmente."
              contentClassName="space-y-4"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0 space-y-2">
                  <label htmlFor="convite-proprietario-processo" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Processo do profissional
                  </label>
                  {ownProcesses.length > 0 ? (
                    <Select value={invitedProcess?.id ?? ""} onValueChange={(value) => { setInvitedProcessId(value); setInvitationStatus(""); }}>
                      <SelectTrigger id="convite-proprietario-processo" className="h-11 w-full min-w-0 rounded-xl text-left">
                        <SelectValue placeholder="Selecione um processo" />
                      </SelectTrigger>
                      <SelectContent>
                        {ownProcesses.map((process) => (
                          <SelectItem key={process.id} value={process.id}>
                            {formatOfficialProcessNumber(process.protocol)} — {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      Nenhum protocolo associado a esta conta. Registre seu primeiro processo para convidar o proprietário.
                    </p>
                  )}
                </div>
                <Button type="button" className="h-11 rounded-xl" disabled={!invitationUrl} onClick={() => void copyInvitation()}>
                  <Copy className="mr-2 h-4 w-4" /> Copiar convite
                </Button>
              </div>
              {invitationUrl ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="rounded-xl" onClick={shareInvitation}>
                      <MessageCircle className="mr-2 h-4 w-4" /> Compartilhar no WhatsApp
                    </Button>
                    <span className="text-xs text-slate-600">O WhatsApp abrirá com uma mensagem pronta; escolha o contato e confirme o envio.</span>
                  </div>
                  <Input aria-label="Endereço do convite ao proprietário" value={invitationUrl} readOnly
                    onFocus={(event) => event.target.select()}
                    className="h-11 min-w-0 rounded-xl bg-slate-50 text-xs" />
                </>
              ) : null}
              {invitationStatus ? <p role="status" className="text-sm font-medium text-sky-800">{invitationStatus}</p> : null}
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                <UserPlus className="mt-0.5 h-4 w-4 shrink-0" />
                1. Envie o convite. 2. O proprietário cria ou acessa sua conta e comprova CPF/CNPJ.
                3. Aprove a solicitação abaixo. 4. A conversa é liberada para ambos.
                O convite por si só não autoriza acesso ao processo.
              </div>
            </SectionPanel>
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
                          <p className="text-base font-semibold text-slate-900">{process ? formatOfficialProcessNumber(process.protocol) : "Processo"}</p>
                          <p className="mt-1 text-sm text-slate-600">{process ? formatOfficialProcessTitle({ title: process.title, type: process.type }) : "Solicitação de acompanhamento"}</p>
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
                            disabled={Boolean(ownerActionBusy)}
                            onClick={() =>
                              void runOwnerAction(
                                `approve-${request.id}`,
                                () =>
                                  respondOwnerRequest({
                                    requestId: request.id,
                                    status: "approved",
                                    professionalUserId: session.id,
                                  }),
                                "Acesso do proprietário aprovado e salvo no banco oficial.",
                              )
                            }
                          >
                            Aprovar acesso
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full"
                            disabled={Boolean(ownerActionBusy)}
                            onClick={() =>
                              void runOwnerAction(
                                `reject-${request.id}`,
                                () =>
                                  respondOwnerRequest({
                                    requestId: request.id,
                                    status: "rejected",
                                    professionalUserId: session.id,
                                  }),
                                "Solicitação recusada e registrada no banco oficial.",
                              )
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

            <SectionPanel
              title="Proprietários vinculados"
              description="Controle o acesso e abra a conversa com cada proprietário."
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
                  const isActive = link.id === selectedOwnerLink?.id;
                  return (
                    <div key={link.id} className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-500">Protocolo</p>
                          <p className="text-base font-semibold text-slate-900">{process ? formatOfficialProcessNumber(process.protocol) : "Processo"}</p>
                          <p className="mt-1 text-sm text-slate-600">{ownerProfile?.fullName ?? "Proprietário"}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {link.chatEnabled ? "Chat ativo" : "Chat desativado"}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          variant={isActive ? "default" : "outline"}
                          className="rounded-full"
                          onClick={() => {
                            setSelectedOwnerLinkId(link.id);
                            setOwnerMessageDraft("");
                            setOwnerActionStatus("");
                            navigate({ pathname: location.pathname, search: `?conversa=${encodeURIComponent(link.id)}` }, { replace: true });
                          }}
                        >
                          <UserRound className="mr-2 h-4 w-4" />
                          {isActive ? "Conversa aberta" : "Abrir conversa"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full"
                          disabled={Boolean(ownerActionBusy)}
                          onClick={() =>
                            void runOwnerAction(
                              `chat-${link.id}`,
                              () =>
                                setOwnerChatEnabled({
                                  linkId: link.id,
                                  enabled: !link.chatEnabled,
                                  actor: session.id,
                                }),
                              link.chatEnabled
                                ? "Chat desativado no banco oficial."
                                : "Chat ativado no banco oficial.",
                            )
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
          </MainContent>

          <SideContent>
            <SectionPanel
              title="Conversa com proprietário"
              description="Canal privado vinculado ao protocolo selecionado."
              contentClassName="space-y-4"
            >
              {!selectedOwnerLink ? (
                <div className="sig-dark-panel rounded-[8px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  Selecione um proprietário para visualizar as mensagens.
                </div>
              ) : (
                <>
                  <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-3">
                    <p className="text-sm text-slate-500">Protocolo</p>
                    <p className="text-base font-semibold text-slate-900">{selectedOwnerProcess ? formatOfficialProcessNumber(selectedOwnerProcess.protocol) : "Processo"}</p>
                    <p className="mt-1 text-sm text-slate-600">{selectedOwnerProfile?.fullName ?? "Proprietário vinculado"}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>{conversation.isLoading ? "Atualizando conversa..." : "Histórico privado · últimas 250 mensagens"}</span>
                    <Button type="button" variant="outline" size="sm"
                      className="rounded-full" onClick={() => void conversation.refresh()}>
                      Atualizar mensagens
                    </Button>
                  </div>
                  {conversation.error ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{conversation.error}</p> : null}
                  <div className="max-h-[540px] space-y-3 overflow-y-auto pr-1" aria-live="polite" aria-label="Histórico da conversa privada">
                    {conversation.messages.length === 0 ? (
                      <div className="sig-dark-panel rounded-[8px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                        Nenhuma mensagem enviada ainda.
                      </div>
                    ) : (
                      conversation.messages.map((message) => {
                        const mine = message.senderUserId === session.id;
                        return (
                          <div key={message.id} className={`min-w-0 max-w-[94%] rounded-[16px] border p-3.5 text-sm shadow-sm sm:max-w-[86%] ${mine ? "ml-auto border-sky-200 bg-sky-50 text-slate-900" : "mr-auto border-slate-200 bg-white text-slate-800"}`}>
                            <p className="text-xs font-semibold text-slate-600">{mine ? "Você" : "Proprietário"}</p>
                            <p className="mt-1.5 whitespace-pre-wrap break-words leading-6">{message.message}</p>
                            <p className="mt-2 text-right text-[11px] text-slate-500">
                              {formatOwnerConversationTime(message.createdAt)}
                              {mine ? (message.readAt ? " · Lida" : " · Enviada") : ""}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {selectedOwnerLink.chatEnabled ? (
                    <div className="space-y-3">
                      <Textarea
                        value={ownerMessageDraft}
                        onChange={(event) => setOwnerMessageDraft(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        placeholder="Escreva uma mensagem ao proprietário"
                        className="min-h-[90px] resize-y rounded-2xl"
                        aria-label="Mensagem privada ao proprietário"
                      />
                      <p className="text-right text-xs text-slate-500">{ownerMessageDraft.length}/4000 caracteres</p>
                      <Button
                        className="rounded-full bg-slate-950 hover:bg-slate-900"
                        disabled={Boolean(ownerActionBusy) || !ownerMessageDraft.trim()}
                        onClick={() => {
                          if (!selectedOwnerLink || !ownerMessageDraft.trim()) return;
                          const textToSend = ownerMessageDraft.trim();
                          const linkAtSend = selectedOwnerLink.id;
                          void (async () => {
                            const ok = await runOwnerAction(
                              `message-${selectedOwnerLink.id}`,
                              () =>
                                sendOwnerMessage({
                                  linkId: linkAtSend,
                                  projectId: selectedOwnerLink.projectId,
                                  ownerUserId: selectedOwnerLink.ownerUserId,
                                  professionalUserId: selectedOwnerLink.professionalUserId,
                                  senderUserId: session.id,
                                  message: textToSend,
                                }),
                              "Mensagem enviada e salva no banco oficial.",
                            );
                            if (ok) {
                              if (selectedOwnerLink?.id === linkAtSend) setOwnerMessageDraft("");
                              void conversation.refresh();
                            }
                          })();
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
                </>
              )}
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
