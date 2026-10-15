import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  FileBadge2,
  FileDown,
  PenLine,
  ShieldCheck,
  Signature,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONSTRUCTION_PERMIT_EVENT,
  createConstructionPermitDraft,
  getMunicipalDirectorCandidates,
  readLocalConstructionPermit,
  signConstructionPermitAsAnalyst,
  signConstructionPermitAsDirector,
  userCanSignPermitAsAnalyst,
  userCanSignPermitAsDirector,
  writeLocalConstructionPermit,
  type ConstructionPermitRecord,
} from "@/lib/constructionPermit";
import { openConstructionPermitPdf } from "@/lib/constructionPermitPdf";
import type { ProcessRecord, SessionUser, UserProfile } from "@/lib/platform";

type ConstructionPermitPanelProps = {
  process: ProcessRecord;
  session: SessionUser;
  sessionUsers: SessionUser[];
  municipalityId: string;
  municipalityName: string;
  secretariat?: string;
  directorate?: string;
  technicalProfile?: UserProfile;
  issPaymentConfirmed: boolean;
  issPaidAt?: string;
  allDocumentsApproved: boolean;
  externalView?: boolean;
};

function permitStatusLabel(record: ConstructionPermitRecord | null) {
  if (!record) return "Ainda não preparado";
  if (record.status === "emitido") return "Alvará emitido";
  if (record.status === "aguardando_diretor") return "Aguardando Diretor";
  return "Rascunho técnico";
}

export function ConstructionPermitPanel({
  process,
  session,
  sessionUsers,
  municipalityId,
  municipalityName,
  secretariat,
  directorate,
  technicalProfile,
  issPaymentConfirmed,
  issPaidAt,
  allDocumentsApproved,
  externalView = false,
}: ConstructionPermitPanelProps) {
  const [permit, setPermit] = useState<ConstructionPermitRecord | null>(() =>
    readLocalConstructionPermit(municipalityId, process.id),
  );
  const [status, setStatus] = useState("");
  const directors = useMemo(
    () => getMunicipalDirectorCandidates(sessionUsers, municipalityId),
    [municipalityId, sessionUsers],
  );
  const [selectedDirectorId, setSelectedDirectorId] = useState(
    directors[0]?.id || "",
  );

  useEffect(() => {
    if (!selectedDirectorId && directors[0]?.id) {
      setSelectedDirectorId(directors[0].id);
    }
  }, [directors, selectedDirectorId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          municipalityId?: string;
          processId?: string;
          record?: ConstructionPermitRecord;
        }>
      ).detail;
      if (
        detail?.municipalityId !== municipalityId ||
        detail?.processId !== process.id
      ) {
        return;
      }
      setPermit(
        detail.record ??
          readLocalConstructionPermit(municipalityId, process.id),
      );
    };
    window.addEventListener(CONSTRUCTION_PERMIT_EVENT, sync as EventListener);
    return () =>
      window.removeEventListener(
        CONSTRUCTION_PERMIT_EVENT,
        sync as EventListener,
      );
  }, [municipalityId, process.id]);

  const selectedDirector =
    directors.find((item) => item.id === selectedDirectorId) ?? directors[0];
  const canPrepare =
    issPaymentConfirmed &&
    allDocumentsApproved &&
    !externalView &&
    userCanSignPermitAsAnalyst(session, process);
  const canSignAnalyst =
    Boolean(permit) &&
    !permit?.analystSignature &&
    !externalView &&
    userCanSignPermitAsAnalyst(session, process);
  const canSignDirector =
    Boolean(permit?.analystSignature) &&
    !permit?.directorSignature &&
    !externalView &&
    userCanSignPermitAsDirector(session);
  const canPreview = Boolean(permit);
  const isIssued = permit?.status === "emitido";

  if (externalView && !isIssued) {
    return null;
  }

  const openPdf = () => {
    if (!permit) return;
    openConstructionPermitPdf({
      permit,
      process,
      municipalityName,
      secretariat,
      directorate,
      technicalProfile,
    });
  };

  const preparePermit = () => {
    if (!canPrepare) return;
    const draft =
      permit ?? createConstructionPermitDraft(process, municipalityId);
    writeLocalConstructionPermit(draft);
    setPermit(draft);
    setStatus(
      "Rascunho do Alvará de Construção preparado. Revise o PDF e faça as assinaturas municipais.",
    );
  };

  const signAsAnalyst = () => {
    if (!permit || !canSignAnalyst) return;
    const next = signConstructionPermitAsAnalyst(permit, session);
    setPermit(next);
    setStatus(
      "Assinatura técnica registrada. O Alvará agora aguarda a assinatura do Diretor responsável.",
    );
  };

  const signAsDirector = () => {
    if (!permit || !canSignDirector) return;
    const next = signConstructionPermitAsDirector(permit, session);
    setPermit(next);
    setStatus(
      "Assinatura da Diretoria registrada. O Alvará foi concluído e liberado como documento final.",
    );
  };

  return (
    <Card className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
      <CardHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,#071b2e_0%,#0b456a_58%,#0d6c9f_100%)] px-5 py-5 text-white dark:border-slate-700 [&_*]:!text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
              <FileBadge2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                Licenciamento da obra
              </p>
              <CardTitle className="mt-1 text-xl font-bold">
                Alvará de Construção
              </CardTitle>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-200">
                Documento final do licenciamento, preparado após a análise
                técnica e a compensação da Guia de ISSQN / Projeto.
              </p>
            </div>
          </div>

          <Badge className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-white shadow-sm">
            {permitStatusLabel(permit)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5 md:p-6">
        {externalView && permit ? (
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  {permit.permitNumber}
                </p>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                  Alvará assinado pela Análise Técnica e pela Diretoria
                  responsável.
                </p>
              </div>
              <Button
                type="button"
                onClick={openPdf}
                className="rounded-full bg-emerald-700 px-5 text-white hover:bg-emerald-800"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Visualizar Alvará em PDF
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div
                className={
                  issPaymentConfirmed
                    ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                    : "rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30"
                }
              >
                <div className="flex items-center gap-2">
                  {issPaymentConfirmed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  )}
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                    Financeiro
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                  {issPaymentConfirmed
                    ? "Pagamento compensado"
                    : "Pagamento ainda pendente"}
                </p>
                {issPaidAt ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(issPaidAt).toLocaleString("pt-BR")}
                  </p>
                ) : null}
              </div>

              <div
                className={
                  allDocumentsApproved
                    ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                    : "rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30"
                }
              >
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                    Análise documental
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                  {allDocumentsApproved
                    ? "Documentos aprovados"
                    : "Ainda existem documentos pendentes"}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-950/30">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                    Próxima etapa
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                  {isIssued
                    ? "Alvará concluído"
                    : permit?.analystSignature
                      ? "Assinatura do Diretor"
                      : "Preparar Alvará"}
                </p>
              </div>
            </div>

            {!permit ? (
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/40">
                <p className="font-semibold text-slate-950 dark:text-white">
                  O processo já retornou do Financeiro.
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Quando o ISSQN / Projeto estiver compensado e os documentos
                  aprovados, a Análise Urbanística prepara o Alvará de
                  Construção para assinatura técnica e assinatura da Diretoria.
                </p>
                <Button
                  type="button"
                  className="mt-4 rounded-full bg-sky-700 px-5 text-white hover:bg-sky-800"
                  disabled={!canPrepare}
                  onClick={preparePermit}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  Preparar Alvará de Construção
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          Número do alvará
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">
                          {permit.permitNumber}
                        </p>
                      </div>
                      <FileBadge2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      O PDF em rascunho recebe marca d’água “SEM VALIDADE”. Ela
                      só desaparece depois das duas assinaturas.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 rounded-full"
                      disabled={!canPreview}
                      onClick={openPdf}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Visualizar PDF
                    </Button>
                  </div>

                  <div className="rounded-[20px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/35">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Diretor responsável
                    </p>
                    {directors.length > 0 ? (
                      <Select
                        value={selectedDirectorId}
                        onValueChange={setSelectedDirectorId}
                      >
                        <SelectTrigger className="mt-2 h-11 bg-white dark:bg-slate-900">
                          <SelectValue placeholder="Selecionar Diretor" />
                        </SelectTrigger>
                        <SelectContent>
                          {directors.map((director) => (
                            <SelectItem key={director.id} value={director.id}>
                              {director.name} • {director.title || "Diretor"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                        Nenhum usuário com cargo de Diretor/Diretora de
                        Planejamento Urbano ou Obras está cadastrado nesta
                        Prefeitura. O sistema não cria assinatura fictícia.
                      </div>
                    )}
                    {selectedDirector ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Assinatura prevista: {selectedDirector.name} •{" "}
                        {selectedDirector.title || selectedDirector.profileLabel}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div
                    className={
                      permit.analystSignature
                        ? "rounded-[20px] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                        : "rounded-[20px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/35"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                        <UserCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          Assinatura da Análise Técnica
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {permit.analystSignature
                            ? `${permit.analystSignature.name} • ${new Date(
                                permit.analystSignature.signedAt,
                              ).toLocaleString("pt-BR")}`
                            : "Pendente"}
                        </p>
                      </div>
                    </div>
                    {!permit.analystSignature ? (
                      <Button
                        type="button"
                        className="mt-4 rounded-full bg-sky-700 px-5 text-white hover:bg-sky-800"
                        disabled={!canSignAnalyst}
                        onClick={signAsAnalyst}
                      >
                        <Signature className="mr-2 h-4 w-4" />
                        Assinar como Analista
                      </Button>
                    ) : null}
                  </div>

                  <div
                    className={
                      permit.directorSignature
                        ? "rounded-[20px] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                        : "rounded-[20px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/35"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          Assinatura da Diretoria
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {permit.directorSignature
                            ? `${permit.directorSignature.name} • ${new Date(
                                permit.directorSignature.signedAt,
                              ).toLocaleString("pt-BR")}`
                            : permit.analystSignature
                              ? "Aguardando Diretor"
                              : "Disponível após a assinatura técnica"}
                        </p>
                      </div>
                    </div>
                    {!permit.directorSignature && permit.analystSignature ? (
                      <Button
                        type="button"
                        className="mt-4 rounded-full bg-violet-700 px-5 text-white hover:bg-violet-800"
                        disabled={!canSignDirector}
                        onClick={signAsDirector}
                      >
                        <Signature className="mr-2 h-4 w-4" />
                        Assinar como Diretor
                      </Button>
                    ) : null}
                  </div>
                </div>

                {isIssued ? (
                  <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                          <p className="font-bold text-emerald-900 dark:text-emerald-200">
                            Alvará pronto para liberação
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                          As duas assinaturas foram registradas e o PDF final
                          está disponível no processo.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={openPdf}
                        className="rounded-full bg-emerald-700 px-5 text-white hover:bg-emerald-800"
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        Abrir PDF final
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {status ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200">
                {status}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
