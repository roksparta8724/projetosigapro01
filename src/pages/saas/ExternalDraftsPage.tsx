import { Building2, Clock3, CreditCard, FilePenLine, FilePlus2, FolderKanban, Paperclip } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageContainer } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { inferProtocolDraftEntryMode, listProtocolDrafts } from "@/lib/protocolDraft";
import { formatCurrency, getVisibleProcessesByScope } from "@/lib/platform";

function reservedOfficialProtocol(preProtocol: string) {
  const normalized = String(preProtocol || "").trim();
  return normalized.startsWith("PRE-") ? normalized.slice(4) : normalized;
}

export function ExternalDraftsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const {
    processes: allProcesses,
    loading: platformLoading,
    dataError,
    refreshRemoteStore,
  } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const activeTab = getExternalTabByPath(location.pathname);
  const drafts = listProtocolDrafts(session.id, effectiveScopeId, session.tenantId);
  const visibleRecords = getVisibleProcessesByScope(
    session,
    effectiveScopeId,
    allProcesses,
  );
  const provisionalProcesses = visibleRecords.filter(
    (process) => process.isOfficial === false,
  );
  const inProgressCount = drafts.length + provisionalProcesses.length;

  return (
    <PortalFrame eyebrow="Acesso do profissional" title="Controle de processos">
      <PageContainer>
        <PageIntro
          eyebrow="Controle de processos"
          title="Rascunhos"
          description="Aqui ficam os rascunhos e os pré-protocolos já enviados que ainda aguardam pagamento. Habite-se e Projeto continuam em fluxos próprios, usando a mesma sequência municipal de protocolo."
          icon={FilePenLine}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild data-draft-dark-action="true" className="rounded-full bg-slate-950 !text-white hover:bg-slate-900 [&_*]:!text-white">
                <Link to="/externo/protocolar">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Novo projeto
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/externo/habite-se">
                  <Building2 className="mr-2 h-4 w-4" />
                  Solicitar Habite-se
                </Link>
              </Button>
            </div>
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

        <div className="flex flex-wrap gap-2 rounded-[18px] border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <Button asChild variant="ghost" className="rounded-xl">
            <Link to="/externo/controle">
              <FolderKanban className="mr-2 h-4 w-4" />
              Processos protocolados
            </Link>
          </Button>
          <Button asChild data-control-subnav-active="true" className="rounded-xl bg-slate-950 !text-white hover:bg-slate-900 [&_*]:!text-white">
            <Link to="/externo/controle/em-andamento">
              <FilePenLine className="mr-2 h-4 w-4" />
              Em andamento
              {inProgressCount > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 text-[10px] font-black !text-slate-950">
                  {inProgressCount}
                </span>
              ) : null}
            </Link>
          </Button>
        </div>

        {dataError ? (
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            Não foi possível atualizar os pré-protocolos agora.
            <Button
              type="button"
              variant="ghost"
              className="ml-2 h-8 rounded-full px-3 text-xs font-bold"
              onClick={() => void refreshRemoteStore()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {platformLoading && provisionalProcesses.length === 0 && drafts.length === 0 ? (
          <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            Atualizando seus processos em andamento...
          </div>
        ) : null}

        <SectionPanel
          title="Processos em andamento"
          description="Continue exatamente de onde parou. Rascunhos podem ser retomados; pré-protocolos enviados permanecem aqui até a compensação da guia inicial."
          contentClassName="space-y-4"
        >
          {inProgressCount === 0 ? (
            <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <FilePenLine className="h-5 w-5" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
                Nenhum processo em andamento
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Quando você salvar um protocolo antes de concluir, ele aparecerá aqui para continuar depois sem perder os dados.
              </p>
              <Button asChild data-draft-dark-action="true" className="mt-5 rounded-full bg-slate-950 !text-white hover:bg-slate-900 [&_*]:!text-white">
                <Link to="/externo/protocolar">Criar novo protocolo</Link>
              </Button>
            </div>
          ) : (
            <>
              {provisionalProcesses.map((process) => {
                const preProtocol = process.preProtocol || process.protocol;
                const reservedProtocol = reservedOfficialProtocol(preProtocol);
                const isHabiteSe = String(process.type || "")
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLocaleLowerCase("pt-BR")
                  .includes("habite");
                const paymentRoute = `/externo/pagamentos?preprotocolo=${encodeURIComponent(
                  preProtocol,
                )}`;

                return (
                  <article
                    key={`preprotocol-${process.id}`}
                    data-external-in-progress-preprotocol="true"
                    className="overflow-hidden rounded-[22px] border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-sky-500/25 dark:bg-[linear-gradient(180deg,#10263a_0%,#0b1c2b_100%)]"
                  >
                    <div className="grid gap-0 lg:grid-cols-[1.35fr_0.8fr_0.9fr_auto] lg:items-stretch">
                      <div className="min-w-0 p-5 lg:border-r lg:border-sky-100 dark:lg:border-sky-500/20">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
                            {isHabiteSe ? (
                              <Building2 className="h-5 w-5" />
                            ) : (
                              <FilePenLine className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
                                Aguardando pagamento
                              </span>
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200">
                                {isHabiteSe ? "Habite-se" : process.type}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-lg font-bold text-slate-950 dark:text-white">
                              {process.title}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                              Pré-protocolo {preProtocol}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              Sequência municipal reservada: <strong className="text-slate-700 dark:text-slate-200">{reservedProtocol}</strong>.
                              Após a compensação, este mesmo número será oficializado, sem gerar outra sequência.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-sky-100 p-5 dark:border-sky-500/20 lg:border-r lg:border-t-0">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                          <Paperclip className="h-4 w-4" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">Documentos</span>
                        </div>
                        <p className="mt-3 text-xl font-bold text-slate-950 dark:text-white">
                          {process.documents.length}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          arquivo(s) enviados
                        </p>
                      </div>

                      <div className="border-t border-sky-100 p-5 dark:border-sky-500/20 lg:border-r lg:border-t-0">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                          <CreditCard className="h-4 w-4" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">Guia inicial</span>
                        </div>
                        <p className="mt-3 text-base font-bold text-slate-950 dark:text-white">
                          {process.payment.guideNumber || "Guia emitida"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {formatCurrency(process.payment.amount)}
                        </p>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Pagamento pendente
                        </p>
                      </div>

                      <div className="flex items-center border-t border-sky-100 p-5 dark:border-sky-500/20 lg:border-t-0">
                        <Button asChild className="w-full rounded-full bg-sky-700 px-5 font-bold !text-white shadow-[0_10px_24px_rgba(3,105,161,0.22)] hover:bg-sky-800 [&_*]:!text-white">
                          <Link to={paymentRoute}>Pagar e continuar</Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {drafts.map((draft) => {
              const fileCount = Object.values(draft.files).reduce(
                (total, items) => total + items.length,
                0,
              );
              const entryMode = inferProtocolDraftEntryMode(draft);
              const isHabiteSeDraft = entryMode === "habite-se";
              const resumeRoute = isHabiteSeDraft ? "/externo/habite-se" : "/externo/protocolar";
              const draftTitle =
                draft.form.titulo?.trim() ||
                (isHabiteSeDraft
                  ? `Habite-se - ${draft.form.endereco?.trim() || "imóvel não informado"}`
                  : "Projeto sem título");

              return (
                <article
                  key={draft.draftNumber}
                  className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="grid gap-0 lg:grid-cols-[1.35fr_0.8fr_0.8fr_auto] lg:items-stretch">
                    <div className="min-w-0 p-5 lg:border-r lg:border-slate-200 dark:lg:border-slate-700">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
                          <FilePenLine className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                              Rascunho
                            </p>
                            <span
                              className={
                                isHabiteSeDraft
                                  ? "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-800"
                                  : "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-700"
                              }
                            >
                              {isHabiteSeDraft ? "Habite-se independente" : "Projeto"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">
                            {draftTitle}
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {draft.draftNumber}
                          </p>
                          {draft.form.endereco?.trim() ? (
                            <p className="mt-2 truncate text-sm text-slate-500 dark:text-slate-400" title={draft.form.endereco}>
                              {draft.form.endereco}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 p-5 dark:border-slate-700 lg:border-r lg:border-t-0">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                        <Paperclip className="h-4 w-4" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">Documentos</span>
                      </div>
                      <p className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{fileCount}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">arquivo(s) vinculados</p>
                    </div>

                    <div className="border-t border-slate-200 p-5 dark:border-slate-700 lg:border-r lg:border-t-0">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                        <Clock3 className="h-4 w-4" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.13em]">Atualizado</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                        {new Date(draft.updatedAt).toLocaleDateString("pt-BR")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(draft.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div className="flex items-center border-t border-slate-200 p-5 dark:border-slate-700 lg:border-t-0">
                      <Button asChild data-draft-dark-action="true" className="w-full rounded-full bg-slate-950 px-5 !text-white hover:bg-slate-900 [&_*]:!text-white">
                        <Link to={`${resumeRoute}?rascunho=${encodeURIComponent(draft.draftNumber)}`}>
                          {isHabiteSeDraft ? "Continuar Habite-se" : "Continuar projeto"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
              })}
            </>
          )}
        </SectionPanel>
      </PageContainer>
    </PortalFrame>
  );
}
