import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import {
  getOwnerLinksForOwner,
  getOwnerMessagesForLink,
  getOwnerRequestsForOwner,
  getProcessPaymentGuides,
  statusLabel,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type OwnerTab = "acompanhamentos" | "solicitacoes" | "mensagens" | "perfil";

export function OwnerPortalPage() {
  const { session } = usePlatformSession();
  const {
    processes,
    ownerLinks,
    ownerRequests,
    ownerMessages,
    createOwnerRequest,
    sendOwnerMessage,
    getUserProfile,
    getInstitutionSettings,
  } = usePlatformData();

  const [activeTab, setActiveTab] = useState<OwnerTab>("acompanhamentos");
  const [protocolSearch, setProtocolSearch] = useState("");
  const [documentValue, setDocumentValue] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requestError, setRequestError] = useState("");
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");

  const profile = getUserProfile(session.id, session.email);

  useEffect(() => {
    if (!documentValue && profile?.cpfCnpj) {
      setDocumentValue(profile.cpfCnpj);
    }
  }, [documentValue, profile?.cpfCnpj]);

  const normalizedSearch = protocolSearch.trim().toLowerCase();
  const searchResult = useMemo(() => {
    if (!normalizedSearch) return null;
    return (
      processes.find((process) => {
        const protocol = process.protocol.toLowerCase();
        const external = process.externalProtocol?.toLowerCase() ?? "";
        return protocol === normalizedSearch || external === normalizedSearch || protocol.includes(normalizedSearch);
      }) ?? null
    );
  }, [normalizedSearch, processes]);

  const ownerLinksForUser = useMemo(() => getOwnerLinksForOwner(session.id, ownerLinks), [ownerLinks, session.id]);
  const ownerRequestsForUser = useMemo(() => getOwnerRequestsForOwner(session.id, ownerRequests), [ownerRequests, session.id]);

  const selectedLink = ownerLinksForUser.find((link) => link.id === selectedLinkId) ?? ownerLinksForUser[0] ?? null;
  const selectedProcess = selectedLink ? processes.find((process) => process.id === selectedLink.projectId) : null;

  const messagesForSelected = selectedLink ? getOwnerMessagesForLink(selectedLink, ownerMessages) : [];
  const tenantSettings = selectedProcess ? getInstitutionSettings(selectedProcess.tenantId) : undefined;
  const paymentGuides = selectedProcess ? getProcessPaymentGuides(selectedProcess, tenantSettings) : [];

  const pendingRequestForSearch = searchResult
    ? ownerRequestsForUser.find((request) => request.projectId === searchResult.id && request.status === "pending")
    : null;
  const linkForSearch = searchResult ? ownerLinksForUser.find((link) => link.projectId === searchResult.id) : null;

  const tabs = [
    { value: "acompanhamentos", label: "Meus acompanhamentos", helper: "Projetos aprovados" },
    { value: "solicitacoes", label: "Solicitações enviadas", helper: "Pedidos em análise" },
    { value: "mensagens", label: "Mensagens", helper: "Conversa com o responsável" },
    { value: "perfil", label: "Meu perfil", helper: "Dados cadastrais" },
  ];

  const handleRequest = async () => {
    if (!searchResult) return;
    setRequestStatus("");
    setRequestError("");

    const response = await createOwnerRequest({
      processId: searchResult.id,
      ownerUserId: session.id,
      ownerDocument: documentValue || profile?.cpfCnpj || "",
      notes: requestNote,
    });

    if (response.error) {
      setRequestError(response.error);
      return;
    }

    setRequestStatus("Solicitação enviada. Aguarde a aprovação do profissional.");
    setRequestNote("");
  };

  const handleSendMessage = async () => {
    if (!selectedLink || !selectedProcess || !messageDraft.trim()) return;

    await sendOwnerMessage({
      projectId: selectedLink.projectId,
      ownerUserId: selectedLink.ownerUserId,
      professionalUserId: selectedLink.professionalUserId,
      senderUserId: session.id,
      message: messageDraft,
    });

    setMessageDraft("");
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

        <InternalTabs items={tabs} value={activeTab} onChange={(value) => setActiveTab(value as OwnerTab)} />

        {activeTab === "acompanhamentos" ? (
          <MainGrid className="mt-6">
            <MainContent className="xl:col-span-7">
              <SectionPanel title="Solicitar acompanhamento" description="Informe o protocolo e o CPF/CNPJ do proprietário para validar a solicitação.">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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

                {searchResult ? (
                  <div className="mt-5 rounded-[16px] border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-300">Protocolo</p>
                        <p className="text-lg font-semibold text-white">{searchResult.protocol}</p>
                        <p className="mt-1 text-sm text-slate-300">{searchResult.title}</p>
                        {searchResult.technicalLead ? (
                          <p className="mt-2 text-xs text-slate-400">Responsável técnico: {searchResult.technicalLead}</p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">Responsável técnico ainda não definido.</p>
                        )}
                      </div>
                      <Badge variant="outline" className="rounded-full text-slate-200">
                        {statusLabel(searchResult.status)}
                      </Badge>
                    </div>

                    {linkForSearch ? (
                      <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                        Acesso aprovado. O acompanhamento já está disponível em "Meus acompanhamentos".
                      </div>
                    ) : pendingRequestForSearch ? (
                      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                        Solicitação pendente. O profissional responsável fará a análise.
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button onClick={handleRequest} className="rounded-full bg-slate-950 hover:bg-slate-900">
                          Enviar solicitação
                        </Button>
                        <span className="text-xs text-slate-300">A aprovação é feita pelo profissional responsável.</span>
                      </div>
                    )}
                  </div>
                ) : normalizedSearch ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                    Nenhum protocolo encontrado. Verifique o número e tente novamente.
                  </div>
                ) : null}

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
                      if (!process) return null;
                      return (
                        <div key={link.id} className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm text-slate-300">Protocolo</p>
                              <p className="text-base font-semibold text-white">{process.protocol}</p>
                              <p className="mt-1 text-sm text-slate-300">{process.title}</p>
                            </div>
                            <Badge variant="outline" className="rounded-full text-slate-200">
                              {statusLabel(process.status)}
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
                          <p className="text-base font-semibold text-white">{process?.protocol ?? "Processo"}</p>
                          <p className="mt-1 text-sm text-slate-300">{process?.title ?? "Acompanhamento solicitado."}</p>
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
                {selectedLink && selectedProcess ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                      Este canal é exclusivo entre você e o profissional responsável. A Prefeitura não participa dessa conversa.
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Protocolo</p>
                      <p className="text-lg font-semibold text-white">{selectedProcess.protocol}</p>
                      <p className="mt-1 text-sm text-slate-300">{selectedProcess.title}</p>
                      <p className="mt-2 text-xs text-slate-400">Status atual: {statusLabel(selectedProcess.status)}</p>
                    </div>

                    <div className="space-y-3">
                      {messagesForSelected.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-300">
                          Nenhuma mensagem enviada ainda. Use o campo abaixo para iniciar o contato.
                        </div>
                      ) : (
                        messagesForSelected.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-2xl border border-white/10 p-4 text-sm ${
                              message.senderUserId === session.id ? "bg-white/10 text-white" : "bg-white/5 text-slate-200"
                            }`}
                          >
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                              {message.senderUserId === session.id ? "Você" : "Profissional responsável"}
                            </p>
                            <p className="mt-2 leading-6">{message.message}</p>
                            <p className="mt-2 text-xs text-slate-400">
                              {new Date(message.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    {selectedLink.chatEnabled ? (
                      <div className="space-y-3">
                        <Textarea
                          rows={3}
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          placeholder="Escreva uma mensagem clara e objetiva"
                          className="rounded-2xl"
                        />
                        <Button onClick={handleSendMessage} className="rounded-full bg-slate-950 hover:bg-slate-900">
                          Enviar mensagem
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                        A conversa foi desativada pelo profissional responsável. Você ainda pode acompanhar o andamento do protocolo. Você ainda pode acompanhar o andamento do protocolo.
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
                        Atualizado em {selectedProcess.updatedAt || selectedProcess.createdAt}
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


