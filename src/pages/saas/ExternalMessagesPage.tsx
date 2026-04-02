import { useMemo, useState } from "react";
import { MessageSquare, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer, SideContent } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { getOwnerLinksForProfessional, getOwnerMessagesForLink, getOwnerRequestsForProfessional } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function ExternalMessagesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const {
    processes,
    ownerRequests,
    ownerLinks,
    ownerMessages,
    respondOwnerRequest,
    setOwnerChatEnabled,
    sendOwnerMessage,
    getUserProfile,
  } = usePlatformData();

  const activeTab = getExternalTabByPath(location.pathname);
  const ownerRequestsForProfessional = useMemo(
    () => getOwnerRequestsForProfessional(session.id, ownerRequests),
    [ownerRequests, session.id],
  );
  const ownerLinksForProfessional = useMemo(
    () => getOwnerLinksForProfessional(session.id, ownerLinks),
    [ownerLinks, session.id],
  );
  const [selectedOwnerLinkId, setSelectedOwnerLinkId] = useState<string | null>(ownerLinksForProfessional[0]?.id ?? null);
  const [ownerMessageDraft, setOwnerMessageDraft] = useState("");

  const selectedOwnerLink =
    ownerLinksForProfessional.find((link) => link.id === selectedOwnerLinkId) ?? ownerLinksForProfessional[0] ?? null;
  const selectedOwnerMessages = selectedOwnerLink ? getOwnerMessagesForLink(selectedOwnerLink, ownerMessages) : [];
  const selectedOwnerProcess = selectedOwnerLink
    ? processes.find((process) => process.id === selectedOwnerLink.projectId)
    : null;
  const selectedOwnerProfile = selectedOwnerLink ? getUserProfile(selectedOwnerLink.ownerUserId) : null;

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

        <InternalTabs
          items={externalTabs.map(({ value, label, helper }) => ({ value, label, helper }))}
          value={activeTab.value}
          onChange={(value) => {
            const target = externalTabs.find((tab) => tab.value === value);
            if (target) navigate(target.route);
          }}
        />

        <MainGrid>
          <MainContent>
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
                  const isActive = link.id === selectedOwnerLinkId;
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
                          variant={isActive ? "default" : "outline"}
                          className="rounded-full"
                          onClick={() => setSelectedOwnerLinkId(link.id)}
                        >
                          <UserRound className="mr-2 h-4 w-4" />
                          {isActive ? "Conversa aberta" : "Abrir conversa"}
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
                    <p className="text-base font-semibold text-slate-900">{selectedOwnerProcess?.protocol ?? "Processo"}</p>
                    <p className="mt-1 text-sm text-slate-600">{selectedOwnerProfile?.fullName ?? "Proprietário"}</p>
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
                </>
              )}
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
