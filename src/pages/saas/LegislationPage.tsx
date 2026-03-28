import { BookOpenText, ExternalLink, Landmark, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/platform/EmptyState";
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
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type LegislationView = "visao-geral" | "plano-diretor" | "uso-solo" | "leis-complementares" | "referencias";

type LawItem = {
  title: string;
  detail: string;
  fileName?: string;
  fileUrl?: string;
};

export function LegislationPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const { getInstitutionSettings } = usePlatformData();
  const [view, setView] = useState<LegislationView>("visao-geral");
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;

  const settings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);

  const items = useMemo<LawItem[]>(
    () => [
      {
        title: "Plano Diretor",
        detail: settings?.resumoPlanoDiretor || "Documento ainda não cadastrado.",
        fileName: settings?.planoDiretorArquivoNome,
        fileUrl: settings?.planoDiretorArquivoUrl,
      },
      {
        title: "Uso e ocupação do solo",
        detail: settings?.resumoUsoSolo || "Documento ainda não cadastrado.",
        fileName: settings?.usoSoloArquivoNome,
        fileUrl: settings?.usoSoloArquivoUrl,
      },
      {
        title: "Leis complementares",
        detail: settings?.leisComplementares || "Documento ainda não cadastrado.",
        fileName: settings?.leisArquivoNome,
        fileUrl: settings?.leisArquivoUrl,
      },
    ],
    [settings],
  );

  const availableCount = items.filter((item) => item.fileUrl).length;
  const missingCount = items.length - availableCount;
  const officialReference = settings?.secretariaResponsavel || "Secretaria responsável não informada";

  const tabs = [
    { value: "visao-geral", label: "Visão geral", helper: "Base institucional" },
    { value: "plano-diretor", label: "Plano Diretor", helper: "Diretrizes centrais" },
    { value: "uso-solo", label: "Uso do solo", helper: "Parâmetros urbanísticos" },
    { value: "leis-complementares", label: "Leis complementares", helper: "Normas auxiliares" },
    { value: "referencias", label: "Referências", helper: "Consulta interna" },
  ] as const;

  const selectedItem =
    view === "plano-diretor"
      ? items[0]
      : view === "uso-solo"
        ? items[1]
        : view === "leis-complementares"
          ? items[2]
          : null;

  const renderDocumentPanel = (item: LawItem) => (
    <PageMainGrid>
      <PageMainContent>
        <TableContainer
          title={item.title}
          description="Documento institucional organizado para consulta, sem excesso de ornamentação."
          icon={ScrollText}
        >
          <div className="space-y-5">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-5">
              <p className="sig-label">Resumo institucional</p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{item.detail}</p>
            </div>

            {item.fileUrl ? (
              <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.fileName || item.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">Visualização oficial</p>
                  </div>
                  <a
                    href={item.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700"
                  >
                    Abrir original
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <iframe src={item.fileUrl} title={item.title} className="h-[640px] w-full bg-white" />
              </div>
            ) : (
              <EmptyState
                title="Documento não disponível"
                description="Cadastre o arquivo correspondente para disponibilizar a consulta oficial nesta aba."
                icon={Landmark}
              />
            )}
          </div>
        </TableContainer>
      </PageMainContent>

      <PageSideContent>
        <SectionCard
          title="Contexto municipal"
          description="Leitura curta da base normativa atualmente publicada."
          icon={BookOpenText}
        >
          <div className="space-y-3">
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
              <p className="sig-label">Secretaria responsável</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{officialReference}</p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
              <p className="sig-label">Arquivo associado</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{item.fileName || "Sem anexo oficial"}</p>
            </div>
          </div>
        </SectionCard>
      </PageSideContent>
    </PageMainGrid>
  );

  return (
    <PortalFrame eyebrow="Legislação urbanística" title="Base legal municipal">
      <PageShell>
        <PageHeader
          eyebrow="Consulta institucional"
          title="Plano Diretor, uso do solo e referências legais"
          description="Estruture a legislação em áreas claras de consulta para protocolo, análise e coordenação institucional."
          icon={Landmark}
        />

        <PageStatsRow>
          <SummaryCard
            title="Documentos ativos"
            value={String(availableCount)}
            helper="Arquivos oficiais disponíveis"
            icon={BookOpenText}
            tone="blue"
          />
          <SummaryCard
            title="Pendências"
            value={String(missingCount)}
            helper="Itens ainda sem anexo"
            icon={ScrollText}
            tone="amber"
          />
          <SummaryCard
            title="Referência oficial"
            value={officialReference ? "1" : "0"}
            helper="Secretaria responsável identificada"
            icon={Landmark}
            tone="emerald"
          />
          <SummaryCard
            title="Áreas legais"
            value={String(items.length)}
            helper="Blocos de consulta organizados"
            icon={BookOpenText}
            tone="default"
          />
        </PageStatsRow>

        <InternalTabs
          items={tabs as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={view}
          onChange={(value) => setView(value as LegislationView)}
        />

        {view === "visao-geral" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableContainer
                title="Base municipal organizada"
                description="Os principais conjuntos normativos foram separados para reduzir ruído e facilitar consulta técnica."
                icon={Landmark}
              >
                <div className="grid gap-4 xl:grid-cols-3">
                  {items.map((item) => (
                    <div key={item.title} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-base font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.detail}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                          {item.fileName || "Sem arquivo oficial"}
                        </p>
                        {item.fileUrl ? (
                          <a
                            href={item.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </TableContainer>
            </PageMainContent>

            <PageSideContent>
              <QuickActionsCard
                title="Ações rápidas"
                description="Acessos diretos para leitura ou apoio administrativo."
                actions={[
                  { id: "pd", label: "Abrir Plano Diretor", icon: BookOpenText, href: items[0].fileUrl || "#" },
                  { id: "uso", label: "Abrir uso do solo", icon: ScrollText, href: items[1].fileUrl || "#" },
                  { id: "leis", label: "Abrir leis complementares", icon: Landmark, href: items[2].fileUrl || "#" },
                ].filter((item) => item.href !== "#")}
              />

              <SectionCard
                title="Diretriz do módulo"
                description="Leitura rápida para quem precisa entender o papel desta área."
                icon={Landmark}
              >
                <div className="space-y-3">
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <p className="sig-label">Objetivo</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Concentrar base legal, reduzir busca paralela e dar contexto claro às análises técnicas.
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <p className="sig-label">Fonte institucional</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{officialReference}</p>
                  </div>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {selectedItem ? renderDocumentPanel(selectedItem) : null}

        {view === "referencias" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableContainer
                title="Referências internas"
                description="Contexto resumido do ambiente legal e da gestão documental."
                icon={BookOpenText}
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-base font-semibold text-slate-950">Secretaria responsável</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{officialReference}</p>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-base font-semibold text-slate-950">Política de publicação</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Sempre que um anexo oficial for atualizado, esta área deve refletir a referência publicada para consulta técnica e institucional.
                    </p>
                  </div>
                </div>
              </TableContainer>
            </PageMainContent>

            <PageSideContent>
              <SectionCard
                title="Cobertura documental"
                description="Resumo do que está pronto para consulta."
                icon={ScrollText}
              >
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.title} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.fileUrl ? "Disponível" : "Pendente de anexo"}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
