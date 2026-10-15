import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardPenLine,
  Clock3,
  Eye,
  FileBadge2,
  FileDown,
  PenLine,
  Save,
  ShieldCheck,
  Signature,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONSTRUCTION_PERMIT_EVENT,
  buildConstructionPermitFormData,
  createConstructionPermitDraft,
  getMunicipalDirectorCandidates,
  readLocalConstructionPermit,
  signConstructionPermitAsAnalyst,
  signConstructionPermitAsDirector,
  userCanSignPermitAsAnalyst,
  userCanSignPermitAsDirector,
  updateConstructionPermitFormData,
  writeLocalConstructionPermit,
  type ConstructionPermitFormData,
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
  const [fillOpen, setFillOpen] = useState(false);
  const [formData, setFormData] = useState<ConstructionPermitFormData>(() => ({
    ...buildConstructionPermitFormData(process),
    ...(readLocalConstructionPermit(municipalityId, process.id)?.formData ?? {}),
    technicalRegistration:
      readLocalConstructionPermit(municipalityId, process.id)?.formData?.technicalRegistration ||
      technicalProfile?.registrationNumber ||
      "",
  }));
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
    setFormData({
      ...buildConstructionPermitFormData(process),
      ...(permit?.formData ?? {}),
      technicalRegistration:
        permit?.formData?.technicalRegistration ||
        technicalProfile?.registrationNumber ||
        "",
    });
  }, [
    permit?.updatedAt,
    process.id,
    process.address,
    process.ownerName,
    process.ownerDocument,
    process.technicalLead,
    process.property.area,
    process.property.block,
    process.property.constructionStandard,
    process.property.iptu,
    process.property.lot,
    process.property.registration,
    process.property.usage,
    process.property.workType,
    technicalProfile?.registrationNumber,
  ]);

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
  const canStartDraft =
    !externalView &&
    userCanSignPermitAsAnalyst(session, process);
  const permitReadyForSignature =
    issPaymentConfirmed && allDocumentsApproved;
  const canSignAnalyst =
    Boolean(permit) &&
    permitReadyForSignature &&
    !permit?.analystSignature &&
    canStartDraft;
  const canSignDirector =
    Boolean(permit?.analystSignature) &&
    !permit?.directorSignature &&
    !externalView &&
    userCanSignPermitAsDirector(session);
  const canPreview = Boolean(permit);
  const canEditForm =
    canStartDraft &&
    !permit?.analystSignature;
  const isIssued = permit?.status === "emitido";

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

  const openPermitForm = () => {
    if (!canEditForm && !canStartDraft) return;
    setFormData({
      ...buildConstructionPermitFormData(process),
      ...(permit?.formData ?? {}),
      technicalRegistration:
        permit?.formData?.technicalRegistration ||
        technicalProfile?.registrationNumber ||
        "",
    });
    setStatus("");
    setFillOpen(true);
  };

  const savePermitForm = (openPreviewAfterSave = false) => {
    if (!canEditForm && !canStartDraft) return;

    const area = Number(String(formData.areaM2).replace(",", "."));
    if (!formData.ownerName.trim()) {
      setStatus("Informe o proprietário/titular do Alvará.");
      return;
    }
    if (!formData.technicalLead.trim()) {
      setStatus("Informe o responsável técnico.");
      return;
    }
    if (!formData.propertyAddress.trim()) {
      setStatus("Informe o endereço do imóvel.");
      return;
    }
    if (!Number.isFinite(area) || area <= 0) {
      setStatus("Informe uma área licenciada válida.");
      return;
    }
    if (!formData.usage.trim() || !formData.workType.trim()) {
      setStatus("Informe o uso da edificação e a natureza da obra.");
      return;
    }

    const base =
      permit ??
      createConstructionPermitDraft(process, municipalityId, {
        ...formData,
        technicalRegistration:
          formData.technicalRegistration ||
          technicalProfile?.registrationNumber ||
          "",
      });

    if (!permit) {
      writeLocalConstructionPermit(base);
    }

    const next = updateConstructionPermitFormData(base, {
      ...formData,
      technicalRegistration:
        formData.technicalRegistration ||
        technicalProfile?.registrationNumber ||
        "",
    });

    setPermit(next);
    setFillOpen(false);
    setStatus(
      "Preenchimento do Alvará salvo em rascunho. Revise a prévia antes das assinaturas.",
    );

    if (openPreviewAfterSave) {
      openConstructionPermitPdf({
        permit: next,
        process,
        municipalityName,
        secretariat,
        directorate,
        technicalProfile,
      });
    }
  };

  const preparePermit = () => {
    openPermitForm();
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
    <Card data-construction-permit-panel="true" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
      <CardHeader data-force-card-contrast="dark" className="border-b border-slate-200 bg-[linear-gradient(135deg,#071b2e_0%,#0b456a_58%,#0d6c9f_100%)] px-5 py-5 text-white dark:border-slate-700 [&_*]:!text-white">
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

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-white shadow-sm">
              {permitStatusLabel(permit)}
            </Badge>
            {!externalView && (canStartDraft || canEditForm) ? (
              <Button
                type="button"
                onClick={openPermitForm}
                className="h-9 rounded-full border border-white/20 bg-white px-4 text-[12px] font-bold !text-slate-950 shadow-sm hover:bg-sky-50"
              >
                <ClipboardPenLine className="mr-2 h-4 w-4 text-sky-700" />
                Preencher Alvará
              </Button>
            ) : null}
            {permit ? (
              <Button
                type="button"
                onClick={openPdf}
                className="h-9 rounded-full border border-white/20 bg-sky-500 px-4 text-[12px] font-bold !text-white shadow-sm hover:bg-sky-400"
              >
                <Eye className="mr-2 h-4 w-4" />
                Visualizar Alvará
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent data-workspace-surface="adaptive" className="space-y-5 p-5 md:p-6">
        {externalView ? (
          permit && isIssued ? (
            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    {permit.permitNumber}
                  </p>
                  <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                    Alvará assinado pela Análise Técnica e pela Diretoria responsável.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={openPdf}
                  className="rounded-full bg-emerald-700 px-5 text-white hover:bg-emerald-800"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Abrir Alvará em PDF
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5 dark:border-sky-500/30 dark:bg-sky-950/30">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">
                    Alvará em preparação pela Prefeitura
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    O pagamento da etapa anterior foi concluído e o processo está na fase de preparação do Alvará de Construção. O preenchimento e as assinaturas são internos; o PDF final aparecerá aqui assim que for emitido.
                  </p>
                </div>
              </div>
            </div>
          )
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
              <div data-permit-prep="true" className="rounded-[22px] border border-slate-200 bg-[linear-gradient(145deg,#f8fbff_0%,#eef6fb_100%)] p-5 dark:border-slate-700 dark:bg-[linear-gradient(145deg,#0d2032_0%,#10283d_100%)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">
                      O Alvará pode ser preparado antecipadamente em rascunho.
                    </p>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      O analista já pode conferir e preencher todos os dados do documento. A assinatura técnica e a emissão final permanecem bloqueadas até o pagamento do ISSQN / Projeto estar compensado e a análise documental estar concluída.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="h-11 shrink-0 rounded-xl bg-[linear-gradient(135deg,#075985_0%,#0f78b8_100%)] px-5 font-bold !text-white shadow-[0_10px_24px_rgba(14,116,181,0.22)] hover:brightness-105 [&_*]:!text-white"
                    disabled={!canStartDraft}
                    onClick={preparePermit}
                  >
                    <PenLine className="mr-2 h-4 w-4" />
                    Abrir e preencher Alvará
                  </Button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className={issPaymentConfirmed
                    ? "rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-500/30 dark:bg-slate-950/45"
                    : "rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-500/30 dark:bg-slate-950/45"}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Pré-requisito financeiro</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                      {issPaymentConfirmed ? "ISSQN / Projeto compensado" : "Aguardando compensação do ISSQN / Projeto"}
                    </p>
                  </div>
                  <div className={allDocumentsApproved
                    ? "rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-500/30 dark:bg-slate-950/45"
                    : "rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-500/30 dark:bg-slate-950/45"}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Pré-requisito técnico</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                      {allDocumentsApproved ? "Análise documental concluída" : "Aguardando conclusão da análise documental"}
                    </p>
                  </div>
                </div>
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
                    <div className="mt-4 flex flex-wrap gap-2">
                      {canEditForm ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          onClick={openPermitForm}
                        >
                          <ClipboardPenLine className="mr-2 h-4 w-4" />
                          Editar preenchimento
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={!canPreview}
                        onClick={openPdf}
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        Visualizar guia do Alvará
                      </Button>
                    </div>
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

            <Dialog open={fillOpen} onOpenChange={setFillOpen}>
              <DialogContent className="z-[95] max-h-[92vh] w-[min(1180px,calc(100vw-32px))] max-w-none overflow-hidden rounded-[28px] border-slate-200 bg-white p-0 shadow-[0_32px_100px_rgba(15,23,42,0.34)] dark:border-slate-700 dark:bg-slate-950">
                <DialogHeader data-force-card-contrast="dark" className="border-b border-slate-200 bg-[linear-gradient(135deg,#071b2e_0%,#0b456a_58%,#0d6c9f_100%)] px-6 py-5 pr-14 text-left dark:border-slate-700">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                      <ClipboardPenLine className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                        Preenchimento oficial
                      </p>
                      <DialogTitle className="mt-1 text-xl font-bold !text-white">
                        Alvará de Construção
                      </DialogTitle>
                      <DialogDescription className="mt-1 max-w-3xl !text-slate-200">
                        O formulário abre sobre o processo, já preenchido com os dados existentes. Revise, ajuste o necessário e salve o rascunho antes das assinaturas.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="max-h-[calc(92vh-170px)] overflow-y-auto bg-slate-50/70 px-6 py-5 dark:bg-slate-900/70">
                  <div className="grid gap-5">
                    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            Identificação
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                            Processo e número do Alvará
                          </p>
                        </div>
                        <Badge className="rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                          {permit?.permitNumber || createConstructionPermitDraft(process, municipalityId).permitNumber}
                        </Badge>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Processo</label>
                          <Input value={process.protocol} readOnly className="h-11 rounded-xl bg-slate-50 dark:bg-slate-900" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Objeto do licenciamento</label>
                          <Input
                            value={formData.licenseObject}
                            onChange={(event) => setFormData((current) => ({ ...current, licenseObject: event.target.value }))}
                            className="h-11 rounded-xl"
                            placeholder="Ex.: Construção residencial unifamiliar"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Titular e responsável técnico
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Proprietário / titular</label>
                          <Input value={formData.ownerName} onChange={(event) => setFormData((current) => ({ ...current, ownerName: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">CPF / CNPJ</label>
                          <Input value={formData.ownerDocument} onChange={(event) => setFormData((current) => ({ ...current, ownerDocument: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Responsável técnico</label>
                          <Input value={formData.technicalLead} onChange={(event) => setFormData((current) => ({ ...current, technicalLead: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">CREA / CAU / CFT</label>
                          <Input value={formData.technicalRegistration} onChange={(event) => setFormData((current) => ({ ...current, technicalRegistration: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Imóvel e obra
                      </p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="md:col-span-2 xl:col-span-4">
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Endereço do imóvel</label>
                          <Input value={formData.propertyAddress} onChange={(event) => setFormData((current) => ({ ...current, propertyAddress: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Inscrição imobiliária / IPTU</label>
                          <Input value={formData.propertyRegistration} onChange={(event) => setFormData((current) => ({ ...current, propertyRegistration: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Lote</label>
                          <Input value={formData.lot} onChange={(event) => setFormData((current) => ({ ...current, lot: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Quadra</label>
                          <Input value={formData.block} onChange={(event) => setFormData((current) => ({ ...current, block: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Área licenciada (m²)</label>
                          <Input value={formData.areaM2} onChange={(event) => setFormData((current) => ({ ...current, areaM2: event.target.value }))} className="h-11 rounded-xl" inputMode="decimal" />
                        </div>
                        <div className="xl:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Natureza da obra</label>
                          <Input value={formData.workType} onChange={(event) => setFormData((current) => ({ ...current, workType: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Uso da edificação</label>
                          <Input value={formData.usage} onChange={(event) => setFormData((current) => ({ ...current, usage: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Padrão construtivo</label>
                          <Input value={formData.constructionStandard} onChange={(event) => setFormData((current) => ({ ...current, constructionStandard: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Condições / observações complementares
                      </label>
                      <Textarea
                        value={formData.complementaryConditions}
                        onChange={(event) => setFormData((current) => ({ ...current, complementaryConditions: event.target.value }))}
                        className="min-h-[120px] resize-y rounded-xl"
                        placeholder="Registre somente condições específicas que devam constar no Alvará."
                      />
                    </section>
                  </div>
                </div>

                <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-950">
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => setFillOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => savePermitForm(false)}>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar rascunho
                  </Button>
                  <Button type="button" className="rounded-full bg-sky-700 px-5 text-white hover:bg-sky-800" onClick={() => savePermitForm(true)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Salvar e visualizar Alvará
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
