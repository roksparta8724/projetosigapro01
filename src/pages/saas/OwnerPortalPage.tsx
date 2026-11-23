import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import {
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getOwnerLinksForOwner,
  getOwnerMessagesForLink,
  getOwnerRequestsForOwner,
  getExternallyVisibleProcessPaymentGuides,
  statusLabel,
  type ProcessStatus,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useOwnerAccessInbox } from "@/hooks/useOwnerAccessInbox";
import { useOwnerPrivateConversation } from "@/hooks/useOwnerPrivateConversation";
import { formatOwnerConversationTime } from "@/lib/ownerConversationDisplay";

type OwnerTab = "acompanhamentos" | "solicitacoes" | "mensagens" | "perfil";

export function OwnerPortalPage() {
  const { session } = usePlatformSession();
  const location = useLocation();
  const {
    processes,
    ownerLinks,
    ownerRequests,
    ownerMessages,
    createOwnerRequestByProtocol,
    sendOwnerMessage,
    getUserProfile,
    getInstitutionSettings,
  } = usePlatformData();

  const [activeTab, setActiveTab] = useState<OwnerTab>(() => {
    const requested = new URLSearchParams(location.search).get("aba");
    return requested === "mensagens" || requested === "solicitacoes" ? requested : "acompanhamentos";
  });
  const [protocolSearch, setProtocolSearch] = useState("");
  const [documentValue, setDocumentValue] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestProcessSummary, setRequestProcessSummary] = useState<{
    protocol: string;
    title: string;
    status: ProcessStatus;
  } | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(() => new URLSearchParams(location.search).get("conversa"));
  const [messageDraft, setMessageDraft] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get("aba");
    if (requestedTab === "mensagens" || requestedTab === "solicitacoes") setActiveTab(requestedTab);
    const requestedConversation = params.get("conversa");
    if (requestedConversation) setSelectedLinkId(requestedConversation);
  }, [location.search]);

  const profile = getUserProfile(session.id, session.email);

  useEffect(() => {
    if (!documentValue && profile?.cpfCnpj) {
      setDocumentValue(profile.cpfCnpj);
    }
  }, [documentValue, profile?.cpfCnpj]);

  const inbox = useOwnerAccessInbox(session.id, ownerRequests, ownerLinks);
  const ownerLinksForUser = useMemo(() => getOwnerLinksForOwner(session.id, inbox.links), [inbox.links, session.id]);
  const ownerRequestsForUser = useMemo(() => getOwnerRequestsForOwner(session.id, inbox.requests), [inbox.requests, session.id]);

  const selectedLink = ownerLinksForUser.find((link) => link.id === selectedLinkId) ?? ownerLinksForUser[0] ?? null;
  const selectedProcess = selectedLink ? processes.find((process) => process.id === selectedLink.projectId) : null;

  const messagesForSelected = selectedLink ? getOwnerMessagesForLink(selectedLink, ownerMessages) : [];
  const conversation = useOwnerPrivateConversation({
    link: selectedLink,
    initialMessages: messagesForSelected,
    actorProfileId: session.id,
    active: activeTab === "mensagens" && Boolean(selectedLink),
  });
  useEffect(() => { setMessageStatus(""); setMessageDraft(""); }, [selectedLink?.id]);
  const tenantSettings = selectedProcess ? getInstitutionSettings(selectedProcess.tenantId) : undefined;
  const paymentGuides = selectedProcess ? getExternallyVisibleProcessPaymentGuides(selectedProcess, tenantSettings) : [];

  const tabs = [
    { value: "acompanhamentos", label: "Meus acompanhamentos", helper: "Projetos aprovados" },
    { value: "solicitacoes", label: "Solicitações enviadas", helper: "Pedidos em análise" },
    { value: "mensagens", label: "Mensagens", helper: "Conversa com o responsável" },
    { value: "perfil", label: "Meu perfil", helper: "Dados cadastrais" },
  ];

  const handleRequest = async () => {
    if (sendingRequest) return;
    setSendingRequest(true);
    setRequestStatus("");
    setRequestError("");
    setRequestProcessSummary(null);

    const response = await createOwnerRequestByProtocol({
      protocol: protocolSearch,
      ownerDocument: documentValue || profile?.cpfCnpj || "",
      notes: requestNote,
    });
    setSendingRequest(false);

    if (response.error) {
      setRequestError(response.error);
      return;
    }

    if (response.process) {
      setRequestProcessSummary({
        protocol: response.process.protocol,
        title: response.process.title,
        status: response.process.status as ProcessStatus,
      });
    }

    setRequestStatus(
      response.request?.status === "approved"
        ? "Acesso já aprovado para este protocolo."
        : "Solicitação registrada no banco oficial. Aguarde a aprovação do profissional.",
    );
    setRequestNote("");
    void inbox.refresh();
  };

  const handleSendMessage = async () => {
    if (!selectedLink || !messageDraft.trim() || sendingMessage) return;

    setSendingMessage(true);
    setMessageStatus("");
    try {
      const saved = await sendOwnerMessage({
        linkId: selectedLink.id,
        projectId: selectedLink.projectId,
        ownerUserId: selectedLink.ownerUserId,
        professionalUserId: selectedLink.professionalUserId,
        senderUserId: session.id,
        message: messageDraft,
      });

      if (!saved) {
        setMessageStatus("A mensagem não foi enviada. Verifique se o chat está ativo para este acompanhamento.");
        return;
      }

      setMessageDraft("");
      setMessageStatus("Mensagem enviada e salva no banco oficial.");
      await conversation.refresh();
    } catch (error) {
      setMessageStatus(
        error instanceof Error
          ? `Não foi possível enviar a mensagem: ${error.message}`
          : "Não foi possível enviar a mensagem no banco oficial.",
      );
    } finally {
      setSendingMessage(false);
    }
  };

  return (
    <PortalFrame eyebrow="Acesso do proprietário" title="Acompanhamento do seu projeto, com segurança e transparência">
      <PageContainer>
        <PageIntro
          eyebrow="Portal do proprietário"
          title="Acompanhe seu processo com segurança"
          description="Solicite acesso ao protocolo e acompanhe o andamento após aprovação do profissional responsável."
          icon={ShieldCheck}
        />

        {messageStatus ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            messageStatus.startsWith("Mensagem enviada")
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}>
            {messageStatus}
          </div>
        ) : null}

        {inbox.error ? (
          <p role="alert" className="rounded-xl border border-amber-200/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Não foi possível sincronizar seus acompanhamentos: {inbox.error}
          </p>
        ) : null}
        <InternalTabs items={tabs} value={activeTab} onChange={(value) => setActiveTab(value as OwnerTab)} />

        {activeTab === "acompanhamentos" ? (
          <MainGrid className="mt-6">
            <MainContent className="xl:col-span-7">
              <SectionPanel title="Solicitar acompanhamento" description="Informe o protocolo e o CPF/CNPJ do proprietário para validar a solicitação.">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="sig-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                      <Input
                        value={protocolSearch}
                        onChange={(event) => setProtocolSearch(event.target.value)}
                        placeholder="Digite o número do protocolo"
                        className="h-11 rounded-2xl pl-9"
                      />
                    </div>
                    <Input
                      value={documentValue}
                      onChange={(event) => setDocumentValue(event.target.value)}
                      placeholder="CPF ou CNPJ do proprietário"
                      className="h-11 rounded-2xl"
                    />
                    <p className="text-xs text-slate-400">
                      Dica: se não souber o protocolo, solicite ao profissional responsável.
                    </p>
                    <Textarea
                      rows={3}
                      maxLength={1000}
                      value={requestNote}
                      onChange={(event) => setRequestNote(event.target.value)}
                      placeholder="Mensagem opcional ao profissional (ex.: identificação do imóvel)"
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="rounded-[18px] border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    <p className="font-semibold text-white">Como funciona</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200/80">1. Envie a solicitação com o número do protocolo.</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200/80">2. O profissional responsável aprova ou recusa o acesso.</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200/80">
                      3. Após aprovação, você acompanha o andamento e pode conversar com o profissional.
                    </p>
                    <p className="mt-3 text-xs text-slate-300">Observação: não há contato direto com a Prefeitura.</p>
                  </div>
                </div>

                <div className="mt-5 rounded-[16px] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-sm font-semibold text-white">Validação segura do protocolo</p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        O sistema valida o número do protocolo junto com o CPF/CNPJ do proprietário diretamente no banco oficial.
                        Nenhum dado do processo é exposto antes dessa conferência.
                      </p>
                    </div>
                    <Button
                      onClick={() => void handleRequest()}
                      disabled={sendingRequest || !protocolSearch.trim() || !(documentValue || profile?.cpfCnpj || "").trim()}
                      className="rounded-full bg-slate-950 hover:bg-slate-900"
                    >
                      {sendingRequest ? "Validando protocolo..." : "Validar e enviar solicitação"}
                    </Button>
                  </div>

                  {requestProcessSummary ? (
                    <div className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/80">Protocolo validado</p>
                        <p className="mt-1 text-lg font-semibold text-white">{formatOfficialProcessNumber(requestProcessSummary.protocol)}</p>
                        <p className="mt-1 text-sm text-emerald-100/90">{formatOfficialProcessTitle({
                          title: requestProcessSummary.title,
                          type: /^AUDIT(?:\s|\b|-)/i.test(requestProcessSummary.title) ? "licenciamento" : undefined,
                        })}</p>
                      </div>
                      <Badge variant="outline" className="rounded-full text-emerald-100">
                        {statusLabel(requestProcessSummary.status)}
                      </Badge>
                    </div>
                  ) : null}
                </div>

                {requestError ? (
                  <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                    {requestError}
                  </div>
                ) : null}

                {requestStatus ? (
                  <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                    {requestStatus}
                  </div>
                ) : null}
              </SectionPanel>
            </MainContent>

            <div className="space-y-6 xl:col-span-5">
              <SectionPanel title="Meus acompanhamentos" description="Protocolos com acesso aprovado pelo profissional.">
                <div className="space-y-4">
                  {ownerLinksForUser.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                      Nenhum acompanhamento aprovado ainda. Envie uma solicitação pelo protocolo.
                    </div>
                  ) : (
                    ownerLinksForUser.map((link) => {
                      const process = processes.find((item) => item.id === link.projectId);
                      return (
                        <div key={link.id} className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm text-slate-300">Protocolo</p>
                              <p className="text-base font-semibold text-white">{process ? formatOfficialProcessNumber(process.protocol) : "Acompanhamento vinculado"}</p>
                              <p className="mt-1 text-sm text-slate-300">{process ? formatOfficialProcessTitle({ title: process.title, type: process.type }) : "Os detalhes do protocolo serão exibidos quando disponíveis."}</p>
                            </div>
                            <Badge variant="outline" className="rounded-full text-slate-200">
                              {process ? statusLabel(process.status) : "Vínculo aprovado"}
                            </Badge>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button
                              variant="outline"
                              className="rounded-full"
                              onClick={() => {
                                setSelectedLinkId(link.id);
                                setActiveTab("mensagens");
                              }}
                            >
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Conversar com o profissional
                            </Button>
                            {!link.chatEnabled ? (
                              <span className="text-xs text-slate-400">Conversa desativada pelo profissional.</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </SectionPanel>
            </div>
          </MainGrid>
        ) : null}

        {activeTab === "solicitacoes" ? (
          <SectionPanel title="Solicitações enviadas" description="Acompanhe o status dos seus pedidos de acesso.">
            <div className="space-y-4">
              {ownerRequestsForUser.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                  Você ainda não enviou solicitações.
                </div>
              ) : (
                ownerRequestsForUser.map((request) => {
                  const process = processes.find((item) => item.id === request.projectId);
                  return (
                    <div key={request.id} className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-300">Protocolo</p>
                          <p className="text-base font-semibold text-white">{process ? formatOfficialProcessNumber(process.protocol) : "Processo"}</p>
                          <p className="mt-1 text-sm text-slate-300">{process ? formatOfficialProcessTitle({ title: process.title, type: process.type }) : "Acompanhamento solicitado."}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full text-slate-200">
                          {request.status === "approved"
                            ? "Aprovado"
                            : request.status === "rejected"
                              ? "Recusado"
                              : "Pendente"}
                        </Badge>
                      </div>
                      {request.notes ? <p className="mt-3 text-sm text-slate-300">Mensagem: {request.notes}</p> : null}
                    </div>
                  );
                })
              )}
            </div>
          </SectionPanel>
        ) : null}

        {activeTab === "mensagens" ? (
          <MainGrid className="mt-6">
            <MainContent className="xl:col-span-7">
              <SectionPanel
                title="Conversa com o responsável técnico"
                description="Mensagens visíveis apenas para você e o profissional responsável."
              >
                {selectedLink ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                      Este canal é exclusivo entre você e o profissional responsável. A Prefeitura não participa dessa conversa.
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Protocolo</p>
                      <p className="text-lg font-semibold text-white">{selectedProcess ? formatOfficialProcessNumber(selectedProcess.protocol) : "Acompanhamento vinculado"}</p>
                      <p className="mt-1 text-sm text-slate-300">{selectedProcess ? formatOfficialProcessTitle({ title: selectedProcess.title, type: selectedProcess.type }) : "Histórico privado liberado para este proprietário."}</p>
                      {selectedProcess ? <p className="mt-2 text-xs text-slate-400">Status atual: {statusLabel(selectedProcess.status)}</p> : null}
                    </div>

                    {ownerLinksForUser.length > 1 ? (
                      <div className="flex flex-wrap gap-2" aria-label="Escolher acompanhamento para conversar">
                        {ownerLinksForUser.map((link) => {
                          const process = processes.find((item) => item.id === link.projectId);
                          return (
                            <Button key={link.id} type="button" size="sm"
                              variant={link.id === selectedLink.id ? "default" : "outline"}
                              className="max-w-full rounded-full"
                              onClick={() => setSelectedLinkId(link.id)}>
                              <span className="max-w-[210px] truncate">{process ? formatOfficialProcessNumber(process.protocol) : "Acompanhamento"}</span>
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                      <span>{conversation.isLoading ? "Sincronizando conversa..." : "Mensagens privadas · atualizadas automaticamente"}</span>
                      <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void conversation.refresh()}>
                        Atualizar
                      </Button>
                    </div>
                    {conversation.error ? <p role="alert" className="rounded-xl border border-amber-200/50 bg-amber-500/10 p-3 text-xs text-amber-100">{conversation.error}</p> : null}
                    <div className="max-h-[540px] space-y-3 overflow-y-auto pr-1" aria-live="polite" aria-label="Histórico da conversa privada">
                      {conversation.messages.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                          Nenhuma mensagem enviada ainda. Use o campo abaixo para iniciar o contato.
                        </div>
                      ) : (
                        conversation.messages.map((message) => {
                          const mine = message.senderUserId === session.id;
                          return (
                            <div
                              key={message.id}
                              className={`min-w-0 max-w-[96%] rounded-[16px] border p-3.5 text-sm sm:max-w-[88%] ${mine ? "ml-auto border-sky-400/30 bg-sky-500/15 text-white" : "mr-auto border-white/15 bg-white/[0.07] text-slate-100"}`}>
                              <p className="text-xs font-semibold text-slate-300">{mine ? "Você" : "Profissional responsável"}</p>
                              <p className="mt-2 whitespace-pre-wrap break-words leading-6">{message.message}</p>
                              <p className="mt-2 text-right text-[11px] text-slate-400">
                                {formatOwnerConversationTime(message.createdAt)}
                                {mine ? (message.readAt ? " · Lida" : " · Enviada") : ""}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {selectedLink.chatEnabled ? (
                      <div className="space-y-3">
                        <Textarea
                          rows={3}
                          maxLength={4000}
                          aria-label="Mensagem privada ao profissional"
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          placeholder="Escreva uma mensagem clara e objetiva"
                          className="rounded-2xl"
                        />
                        <p className="text-right text-xs text-slate-400">{messageDraft.length}/4000 caracteres</p>
                        <Button disabled={sendingMessage || !messageDraft.trim()} onClick={handleSendMessage} className="rounded-full bg-slate-950 hover:bg-slate-900">
                          {sendingMessage ? "Enviando..." : "Enviar mensagem"}
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                        A conversa foi desativada pelo profissional responsável. Você ainda pode acompanhar o andamento do protocolo.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                    Selecione um acompanhamento para visualizar as mensagens.
                  </div>
                )}
              </SectionPanel>
            </MainContent>

            <div className="space-y-6 xl:col-span-5">
              <SectionPanel title="Resumo do projeto" description="Informações essenciais do acompanhamento aprovado.">
                {selectedProcess ? (
                  <div className="space-y-4">
                    <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Etapa atual</p>
                      <p className="text-base font-semibold text-white">{statusLabel(selectedProcess.status)}</p>
                      <p className="mt-2 text-xs text-slate-400">
                        Atualizado em {selectedProcess.auditTrail[0]?.at || selectedProcess.timeline[0]?.at || "sem registro"}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Financeiro</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {paymentGuides.some((guide) => guide.status !== "compensada")
                          ? "Há guias pendentes para este protocolo."
                          : "Nenhuma guia pendente no momento."}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Profissional responsável</p>
                      <p className="mt-1 text-base font-semibold text-white">{selectedProcess.technicalLead}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                    Sem projeto selecionado.
                  </div>
                )}
              </SectionPanel>
            </div>
          </MainGrid>
        ) : null}

        {activeTab === "perfil" ? (
          <SectionPanel title="Meu perfil" description="Confira os dados usados no seu cadastro.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Nome</p>
                <p className="mt-2 text-base font-semibold text-white">{profile?.fullName || session.name}</p>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">E-mail</p>
                <p className="mt-2 text-base font-semibold text-white">{profile?.email || session.email}</p>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">CPF/CNPJ</p>
                <p className="mt-2 text-base font-semibold text-white">{profile?.cpfCnpj || "Não informado"}</p>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefone</p>
                <p className="mt-2 text-base font-semibold text-white">{profile?.phone || "Não informado"}</p>
              </div>
              <div className="rounded-[16px] border border-white/10 bg-white/5 p-4 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <User className="h-4 w-4" />
                  Observações
                </div>
                <p className="mt-2 text-sm text-slate-300">{profile?.bio || "Sem observações adicionais."}</p>
              </div>
            </div>
          </SectionPanel>
        ) : null}
      </PageContainer>
    </PortalFrame>
  );
}


