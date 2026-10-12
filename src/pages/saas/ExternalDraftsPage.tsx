import { Clock3, FilePenLine, FilePlus2, FolderKanban, Paperclip } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageContainer } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { listProtocolDrafts } from "@/lib/protocolDraft";

export function ExternalDraftsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const activeTab = getExternalTabByPath(location.pathname);
  const drafts = listProtocolDrafts(session.id, effectiveScopeId, session.tenantId);

  return (
    <PortalFrame eyebrow="Acesso do profissional" title="Controle de processos">
      <PageContainer>
        <PageIntro
          eyebrow="Controle de processos"
          title="Rascunhos"
          description="Projetos ainda não protocolados ficam separados dos processos oficiais. Retome somente quando quiser continuar a abertura."
          icon={FilePenLine}
          actions={
            <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
              <Link to="/externo/protocolar">
                <FilePlus2 className="mr-2 h-4 w-4" />
                Novo protocolo
              </Link>
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

        <div className="flex flex-wrap gap-2 rounded-[18px] border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <Button asChild variant="ghost" className="rounded-xl">
            <Link to="/externo/controle">
              <FolderKanban className="mr-2 h-4 w-4" />
              Processos protocolados
            </Link>
          </Button>
          <Button asChild data-control-subnav-active="true" className="rounded-xl bg-slate-950 !text-white hover:bg-slate-900 [&_*]:!text-white">
            <Link to="/externo/controle/rascunhos">
              <FilePenLine className="mr-2 h-4 w-4" />
              Rascunhos
            </Link>
          </Button>
        </div>

        <SectionPanel
          title="Projetos salvos para continuar depois"
          description="Rascunhos não entram no fluxo da Prefeitura até você concluir e protocolar."
          contentClassName="space-y-4"
        >
          {drafts.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <FilePenLine className="h-5 w-5" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
                Nenhum rascunho salvo
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Inicie um novo protocolo e use “Salvar rascunho” quando quiser continuar em outro momento.
              </p>
              <Button asChild className="mt-5 rounded-full bg-slate-950 hover:bg-slate-900">
                <Link to="/externo/protocolar">Criar novo protocolo</Link>
              </Button>
            </div>
          ) : (
            drafts.map((draft) => {
              const fileCount = Object.values(draft.files).reduce(
                (total, items) => total + items.length,
                0,
              );

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
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            Rascunho
                          </p>
                          <p className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">
                            {draft.form.titulo?.trim() || "Projeto sem título"}
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
                      <Button asChild className="w-full rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">
                        <Link to={`/externo/protocolar?rascunho=${encodeURIComponent(draft.draftNumber)}`}>
                          Continuar rascunho
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </SectionPanel>
      </PageContainer>
    </PortalFrame>
  );
}
