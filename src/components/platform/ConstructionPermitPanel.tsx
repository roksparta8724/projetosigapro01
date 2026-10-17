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
  Loader2,
  PenLine,
  Plus,
  Printer,
  Send,
  Save,
  Trash2,
  ShieldCheck,
  Signature,
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
  CONSTRUCTION_PERMIT_EVENT,
  buildConstructionPermitFormData,
  createConstructionPermitDraft,
  applyConstructionPermitOfficialSignature,
  getMunicipalDirectorCandidates,
  readLocalConstructionPermit,
  userCanSignPermitAsAnalyst,
  userCanSignPermitAsDirector,
  userCanSignPermitAsSecretary,
  updateConstructionPermitFormData,
  writeLocalConstructionPermit,
  type ConstructionPermitFormData,
  type ConstructionPermitRecord,
} from "@/lib/constructionPermit";
import { openConstructionPermitPdf, reserveConstructionPermitPdfWindow } from "@/lib/constructionPermitPdf";
import {
  ArtifactSignatureError,
  getProcessArtifactSignatures,
  signProcessArtifactWithPassword,
} from "@/integrations/esign/artifactClient";
import {
  getOfficialConstructionPermit,
  markOfficialPermitForManualSignature,
  requestOfficialPermitDirectorSignature,
  saveOfficialConstructionPermitDraft,
} from "@/integrations/permits/constructionPermitClient";
import type { ProcessRecord, SessionUser, UserProfile } from "@/lib/platform";

type ConstructionPermitPanelProps = {
  process: ProcessRecord;
  session: SessionUser;
  sessionUsers: SessionUser[];
  municipalityId: string;
  municipalityName: string;
  municipalityLogoUrl?: string;
  municipalityAddress?: string;
  municipalityPhone?: string;
  municipalityEmail?: string;
  secretariat?: string;
  directorate?: string;
  technicalProfile?: UserProfile;
  issPaymentConfirmed: boolean;
  issPaidAt?: string;
  approvalPaymentRequired: boolean;
  approvalPaymentConfirmed: boolean;
  approvalPaidAt?: string;
  allDocumentsApproved: boolean;
  externalView?: boolean;
  organogramTrail?: Array<{ code: string; name: string }>;
};

function permitFormTitle(workType?: string | null) {
  const raw = String(workType || "");
  if (/regulariza/i.test(raw)) return "Alvará de Regularização";
  if (/demoli/i.test(raw)) return "Alvará de Demolição";
  if (/reforma/i.test(raw)) return "Alvará de Reforma";
  if (/amplia/i.test(raw)) return "Alvará de Ampliação";
  if (/terraplen|movimenta.*terra/i.test(raw)) return "Alvará de Terraplenagem";
  return "Alvará de Construção";
}

function permitStatusLabel(record: ConstructionPermitRecord | null) {
  if (!record) return "Ainda não preparado";
  const directorOfficial = Boolean(
    record.directorSignature?.official &&
    record.directorSignature?.verificationCode,
  );
  if (directorOfficial) return "Alvará emitido";
  if (record.signatureMode === "manual" || record.status === "assinatura_manual") {
    return "Preparado para assinatura";
  }
  if (
    record.signatureMode === "electronic" ||
    record.status === "aguardando_diretor" ||
    record.directorSignature
  ) {
    return "Aguardando assinatura da Diretoria";
  }
  return "Em preparação";
}

export function ConstructionPermitPanel({
  process,
  session,
  sessionUsers,
  municipalityId,
  municipalityName,
  municipalityLogoUrl,
  municipalityAddress,
  municipalityPhone,
  municipalityEmail,
  secretariat,
  directorate,
  technicalProfile,
  issPaymentConfirmed,
  issPaidAt,
  approvalPaymentRequired,
  approvalPaymentConfirmed,
  approvalPaidAt,
  allDocumentsApproved,
  externalView = false,
  organogramTrail = [],
}: ConstructionPermitPanelProps) {
  const [permit, setPermit] = useState<ConstructionPermitRecord | null>(() =>
    readLocalConstructionPermit(municipalityId, process.id),
  );
  const [status, setStatus] = useState("");
  const [signatureDialog, setSignatureDialog] = useState<"director" | "secretary" | null>(null);
  const [signaturePassword, setSignaturePassword] = useState("");
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState<"save" | "request" | "manual" | null>(null);
  const [signatureError, setSignatureError] = useState("");
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
  useEffect(() => {
    let active = true;

    void getOfficialConstructionPermit(process.id)
      .then((official) => {
        if (!active || !official) return;

        const local = readLocalConstructionPermit(municipalityId, process.id);
        const merged: ConstructionPermitRecord = {
          ...official,
          directorSignature: local?.directorSignature,
          secretarySignature: local?.secretarySignature,
          issuedAt: local?.issuedAt,
        };

        writeLocalConstructionPermit(merged);
        setPermit(merged);
      })
      .catch((error) => {
        if (!active) return;
        console.error("[SIGAPRO][Alvará] Falha ao carregar o registro oficial.", error);
      });

    return () => {
      active = false;
    };
  }, [municipalityId, process.id]);

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

  useEffect(() => {
    if (!permit) return;
    let active = true;

    void getProcessArtifactSignatures(process.id, "construction-permit")
      .then((snapshot) => {
        if (!active || !snapshot.block) return;

        let next = permit;
        const director = snapshot.signers.find((item) => item.slot === "diretoria");
        const secretary = snapshot.signers.find((item) => item.slot === "secretaria");

        if (director && !next.directorSignature?.official) {
          next = applyConstructionPermitOfficialSignature(next, "diretoria", {
            profileId: director.profile_id || "",
            name: director.name || "Diretor(a)",
            role: director.title || director.role || "Diretor(a)",
            signedAt: director.signed_at || snapshot.block.completed_at || new Date().toISOString(),
            verificationCode: snapshot.block.verification_code,
            evidenceHash: snapshot.block.artifact_hash,
            registration: director.registration ?? null,
            authMethod: director.auth_method || "password_reauth",
            official: true,
          });
        }

        if (secretary && !next.secretarySignature?.official) {
          next = applyConstructionPermitOfficialSignature(next, "secretaria", {
            profileId: secretary.profile_id || "",
            name: secretary.name || "Secretário(a)",
            role: secretary.title || secretary.role || "Secretário(a)",
            signedAt: secretary.signed_at || snapshot.block.completed_at || new Date().toISOString(),
            verificationCode: snapshot.block.verification_code,
            evidenceHash: snapshot.block.artifact_hash,
            registration: secretary.registration ?? null,
            authMethod: secretary.auth_method || "password_reauth",
            official: true,
          });
        }

        if (next !== permit) setPermit(next);
      })
      .catch((error) => {
        console.error("[SIGAPRO][Alvará] Falha ao carregar assinaturas oficiais.", error);
      });

    return () => {
      active = false;
    };
  }, [
    permit?.directorSignature?.official,
    permit?.secretarySignature?.official,
    permit?.updatedAt,
    process.id,
  ]);

  const canStartDraft =
    !externalView &&
    userCanSignPermitAsAnalyst(session, process);
  const financialPrerequisitesConfirmed =
    issPaymentConfirmed &&
    (!approvalPaymentRequired || approvalPaymentConfirmed);
  const permitReadyForSignature =
    financialPrerequisitesConfirmed && allDocumentsApproved;
  const directorOfficial = Boolean(
    permit?.directorSignature?.official &&
    permit?.directorSignature?.verificationCode,
  );
  const secretaryOfficial = Boolean(
    permit?.secretarySignature?.official &&
    permit?.secretarySignature?.verificationCode,
  );
  const directorRequestPending =
    permit?.status === "aguardando_diretor" &&
    permit?.signatureMode === "electronic";
  const manualSignatureSelected =
    permit?.status === "assinatura_manual" ||
    permit?.signatureMode === "manual";
  const canSignDirector =
    Boolean(permit) &&
    permitReadyForSignature &&
    directorRequestPending &&
    !directorOfficial &&
    !externalView &&
    userCanSignPermitAsDirector(session);
  const canSignSecretary =
    directorOfficial &&
    !secretaryOfficial &&
    !externalView &&
    userCanSignPermitAsSecretary(session);
  const canPreview = Boolean(
    permit &&
    (directorOfficial || manualSignatureSelected),
  );
  const canEditForm =
    canStartDraft &&
    !directorOfficial;
  const isIssued = directorOfficial;
  const isRegularizationForm = /regulariza/i.test(formData.workType || "");
  const regularizationAreas = formData.regularizationAreas ?? [];
  const regularizationAreaTotal = regularizationAreas.reduce((total, item) => {
    const parsed = Number(String(item.areaM2 || "").replace(",", "."));
    return Number.isFinite(parsed) ? total + parsed : total;
  }, 0);

  const updateRegularizationArea = (
    index: number,
    field: "description" | "areaM2",
    value: string,
  ) => {
    setFormData((current) => {
      const rows = [...(current.regularizationAreas ?? [])];
      const currentRow = rows[index] ?? {
        id: `area-${Date.now()}-${index}`,
        description: "",
        areaM2: "",
      };
      rows[index] = { ...currentRow, [field]: value };
      return { ...current, regularizationAreas: rows };
    });
  };

  const addRegularizationArea = () => {
    setFormData((current) => ({
      ...current,
      regularizationAreas: [
        ...(current.regularizationAreas ?? []),
        {
          id: `area-${Date.now()}-${(current.regularizationAreas ?? []).length}`,
          description: "",
          areaM2: "",
        },
      ],
    }));
  };

  const removeRegularizationArea = (index: number) => {
    setFormData((current) => ({
      ...current,
      regularizationAreas: (current.regularizationAreas ?? []).filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    }));
  };

  const openPdf = async (
    record: ConstructionPermitRecord | null = permit,
    manualSignature = manualSignatureSelected,
    reservedWindow?: Window | null,
  ) => {
    if (!record) return;
    try {
      await openConstructionPermitPdf(
        {
          permit: record,
          process,
          municipalityName,
          municipalityLogoUrl,
          municipalityAddress,
          municipalityPhone,
          municipalityEmail,
          secretariat,
          directorate,
          technicalProfile,
          manualSignature,
        },
        reservedWindow,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o PDF oficial do Alvará.",
      );
    }
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

  const buildDraftFromForm = (): ConstructionPermitRecord | null => {
    if (!canEditForm && !canStartDraft) return null;

    const enteredArea = Number(String(formData.areaM2).replace(",", "."));
    const effectiveArea =
      isRegularizationForm && regularizationAreaTotal > 0
        ? regularizationAreaTotal
        : enteredArea;
    if (!formData.ownerName.trim()) {
      setStatus("Informe o proprietário/titular do Alvará.");
      return null;
    }
    if (!formData.technicalLead.trim()) {
      setStatus("Informe o responsável técnico.");
      return null;
    }
    if (!formData.propertyAddress.trim()) {
      setStatus("Informe o endereço do imóvel.");
      return null;
    }
    if (!Number.isFinite(effectiveArea) || effectiveArea <= 0) {
      setStatus(
        isRegularizationForm
          ? "Informe a área total ou detalhe as áreas a regularizar."
          : "Informe uma área licenciada válida.",
      );
      return null;
    }
    if (!formData.usage.trim() || !formData.workType.trim()) {
      setStatus("Informe o uso da edificação e a natureza da obra.");
      return null;
    }

    if (isRegularizationForm) {
      if (!String(formData.propertyRegistryNumber || "").trim()) {
        setStatus("Informe a matrícula do imóvel para o Alvará de Regularização.");
        return null;
      }
      if (!String(formData.technicalResponsibilityNumber || "").trim()) {
        setStatus("Informe o número da ART, RRT ou TRT do responsável técnico.");
        return null;
      }
      const validRegularizationAreas = regularizationAreas.filter((item) => {
        const parsed = Number(String(item.areaM2 || "").replace(",", "."));
        return item.description.trim() && Number.isFinite(parsed) && parsed > 0;
      });
      if (validRegularizationAreas.length === 0) {
        setStatus("Inclua ao menos uma edificação/área a regularizar.");
        return null;
      }
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

    const next = updateConstructionPermitFormData(base, {
      ...formData,
      areaM2:
        isRegularizationForm && regularizationAreaTotal > 0
          ? regularizationAreaTotal.toFixed(2).replace(".", ",")
          : formData.areaM2,
      technicalRegistration:
        formData.technicalRegistration ||
        technicalProfile?.registrationNumber ||
        "",
    });

    return next;
  };

  const savePermitForm = async (
    closeAfterSave = true,
    manageBusy = true,
  ): Promise<ConstructionPermitRecord | null> => {
    const localDraft = buildDraftFromForm();
    if (!localDraft) return null;

    if (manageBusy) setWorkflowBusy("save");
    try {
      const official = await saveOfficialConstructionPermitDraft({
        processId: process.id,
        permitNumber: localDraft.permitNumber,
        formData:
          localDraft.formData ?? buildConstructionPermitFormData(process),
      });

      const next: ConstructionPermitRecord = {
        ...localDraft,
        ...official,
        formData: official.formData ?? localDraft.formData,
        directorSignature: localDraft.directorSignature,
        secretarySignature: localDraft.secretarySignature,
        issuedAt: localDraft.issuedAt,
      };

      writeLocalConstructionPermit(next);
      setPermit(next);
      if (closeAfterSave) setFillOpen(false);
      setStatus(
        "Alvará salvo no banco oficial. Escolha assinatura eletrônica da Diretoria ou PDF para assinatura manual.",
      );
      return next;
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o Alvará no banco oficial.",
      );
      return null;
    } finally {
      if (manageBusy) setWorkflowBusy(null);
    }
  };

  const requestDirectorSignature = async () => {
    if (directors.length === 0) {
      setStatus(
        "Não existe um perfil interno ativo identificado como Diretor(a) da área de Urbanismo/Obras. Cadastre ou ajuste o cargo no organograma antes de solicitar a assinatura eletrônica.",
      );
      return;
    }

    if (!permitReadyForSignature) {
      setStatus(
        "Conclua a análise documental e confirme a compensação de todas as guias financeiras exigidas antes de solicitar a assinatura da Diretoria.",
      );
      return;
    }

    setWorkflowBusy("request");
    try {
      const saved = await savePermitForm(false, false);
      if (!saved) return;

      const official = await requestOfficialPermitDirectorSignature(process.id);
      const next: ConstructionPermitRecord = {
        ...saved,
        ...official,
        formData: official.formData ?? saved.formData,
        directorSignature: saved.directorSignature,
        secretarySignature: saved.secretarySignature,
      };

      writeLocalConstructionPermit(next);
      setPermit(next);
      setFillOpen(false);
      setStatus(
        "Solicitação enviada à Diretoria. O Diretor pode abrir este processo e assinar eletronicamente com a própria senha.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível encaminhar o Alvará para a Diretoria.",
      );
    } finally {
      setWorkflowBusy(null);
    }
  };

  const generateManualSignaturePdf = async () => {
    if (!permitReadyForSignature) {
      setStatus(
        "Conclua a análise documental e confirme a compensação de todas as guias financeiras exigidas antes de gerar o Alvará para assinatura manual.",
      );
      return;
    }

    // Reserva a guia no clique do usuário ANTES das operações assíncronas.
    // Assim o navegador não bloqueia a abertura quando o banco terminar de salvar.
    const previewRecord =
      permit ??
      createConstructionPermitDraft(process, municipalityId, {
        ...formData,
        technicalRegistration:
          formData.technicalRegistration ||
          technicalProfile?.registrationNumber ||
          "",
      });
    const reservedPdfWindow = reserveConstructionPermitPdfWindow({
      permit: previewRecord,
      process,
    });

    if (!reservedPdfWindow) {
      setStatus(
        "O navegador bloqueou a abertura do PDF. Libere pop-ups para o SIGAPRO e tente novamente.",
      );
      return;
    }

    setWorkflowBusy("manual");
    try {
      const saved = await savePermitForm(false, false);
      if (!saved) return;

      const official = await markOfficialPermitForManualSignature(process.id);
      const next: ConstructionPermitRecord = {
        ...saved,
        ...official,
        formData: official.formData ?? saved.formData,
        directorSignature: saved.directorSignature,
        secretarySignature: saved.secretarySignature,
      };

      writeLocalConstructionPermit(next);
      setPermit(next);
      setFillOpen(false);
      // Sucesso de preparação não deve piscar uma mensagem antes de trocar para
      // o visualizador nativo. Somente erros permanecem visíveis na tela.
      setStatus("");
      await openPdf(next, true, reservedPdfWindow);
    } catch (error) {
      if (!reservedPdfWindow.closed) reservedPdfWindow.close();
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível preparar o PDF para assinatura manual.",
      );
    } finally {
      setWorkflowBusy(null);
    }
  };

  const preparePermit = () => {
    openPermitForm();
  };

  const buildPermitSignaturePayload = (record: ConstructionPermitRecord) => ({
    schema: "sigapro.construction-permit.v1",
    processId: process.id,
    protocol: process.protocol,
    municipalityId,
    permitNumber: record.permitNumber,
    formData: record.formData ?? buildConstructionPermitFormData(process),
  });

  const openSignatureConfirmation = (kind: "director" | "secretary") => {
    if (!permit) return;

    if (kind === "director") {
      if (!canSignDirector) {
        setStatus("Somente o Diretor responsável pode assinar o Alvará depois da conclusão das etapas obrigatórias.");
        return;
      }
    } else if (!canSignSecretary) {
      setStatus("A assinatura da Secretaria é opcional e só pode ser registrada por um perfil de Secretário(a) após a Diretoria.");
      return;
    }

    setSignaturePassword("");
    setSignatureError("");
    setSignatureDialog(kind);
  };

  const confirmElectronicSignature = async () => {
    if (!permit || !signatureDialog || !signaturePassword) {
      setSignatureError("Informe sua senha de acesso.");
      return;
    }

    const slot: "diretoria" | "secretaria" =
      signatureDialog === "director" ? "diretoria" : "secretaria";

    setSignatureBusy(true);
    setSignatureError("");

    try {
      await signProcessArtifactWithPassword({
        processId: process.id,
        artifactType: "construction_permit",
        artifactKey: "construction-permit",
        signerSlot: slot,
        password: signaturePassword,
        payload: buildPermitSignaturePayload(permit),
      });

      const snapshot = await getProcessArtifactSignatures(
        process.id,
        "construction-permit",
      );
      const signer = snapshot.signers.find((item) => item.slot === slot);

      if (!snapshot.block || !signer) {
        throw new ArtifactSignatureError(
          "A assinatura foi enviada, mas ainda não pôde ser confirmada no banco oficial.",
          { stage: "verification", code: "PERMIT_SIGNATURE_READBACK_FAILED" },
        );
      }

      const signature = {
        profileId: signer.profile_id || session.id,
        name: signer.name || session.name,
        role:
          signer.title ||
          signer.role ||
          (signatureDialog === "director" ? "Diretor(a)" : "Secretário(a)"),
        signedAt:
          signer.signed_at ||
          snapshot.block.completed_at ||
          new Date().toISOString(),
        verificationCode: snapshot.block.verification_code,
        evidenceHash: snapshot.block.artifact_hash,
        registration: signer.registration ?? null,
        authMethod: signer.auth_method || "password_reauth",
        official: true,
      };

      const next = applyConstructionPermitOfficialSignature(
        permit,
        slot,
        signature,
      );
      setPermit(next);
      setSignatureDialog(null);
      setSignaturePassword("");
      setStatus(
        signatureDialog === "director"
          ? "Assinatura eletrônica da Diretoria concluída. O Alvará foi emitido e o PDF oficial já está disponível."
          : "Assinatura eletrônica da Secretaria registrada. Ela passará a aparecer automaticamente no Alvará.",
      );
    } catch (error) {
      setSignaturePassword("");
      setSignatureError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a assinatura eletrônica.",
      );
    } finally {
      setSignatureBusy(false);
    }
  };

  const signAsDirector = () => openSignatureConfirmation("director");
  const signAsSecretary = () => openSignatureConfirmation("secretary");

  return (
    <Card data-construction-permit-panel="true" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
      <CardHeader
        data-force-card-contrast="dark"
        data-premium-process-dark-header="permit"
        data-permit-dark-header="true"
        data-premium-inverse-surface="true"
        className="sig-process-dark-surface-v9 border-b border-white/10 bg-[linear-gradient(135deg,#06192b_0%,#0a4166_52%,#0879a8_100%)] px-5 py-5 text-white shadow-[0_14px_34px_rgba(3,38,65,0.18)] dark:border-slate-700"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div data-permit-header-icon="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-sky-400/15 !text-white shadow-inner">
              <FileBadge2 className="h-6 w-6 !text-white" />
            </div>
            <div data-permit-header-copy="true">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] !text-sky-100">
                Licenciamento da obra
              </p>
              <CardTitle className="mt-1 text-xl font-bold !text-white">
                Alvará de Construção
              </CardTitle>
              <p className="mt-1 max-w-3xl text-sm leading-6 !text-slate-200">
                Documento final do licenciamento, preparado após a análise
                técnica e a compensação das etapas financeiras exigidas para o Alvará.
              </p>

              {organogramTrail.length > 0 ? (
                <div data-dark-organogram-trail="true" className="mt-3 flex flex-wrap items-center gap-2">
                  {organogramTrail.map((unit, index) => (
                    <div key={`permit-org-${unit.code}-${unit.name}`} className="flex items-center gap-2">
                      {index > 0 ? <span className="!text-sky-200/80">›</span> : null}
                      <span
                        data-dark-organogram-code="true"
                        className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-[0.10em] !text-white shadow-sm backdrop-blur-sm"
                        title={unit.name}
                      >
                        <span className="!text-white">{unit.code}</span>
                        <span className="hidden font-semibold tracking-normal !text-sky-100 sm:inline">
                          {unit.name}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge data-permit-header-status="true" className="w-fit rounded-full border border-sky-200/35 bg-[#083a59] px-3 py-1.5 !text-white shadow-[0_8px_18px_rgba(2,34,57,0.24)]">
              {permitStatusLabel(permit)}
            </Badge>
            {!externalView && (canStartDraft || canEditForm) ? (
              <Button
                type="button"
                onClick={openPermitForm}
                data-premium-dark-action="true"
                className="h-9 rounded-full border border-sky-300/40 bg-[#0b5e93] px-4 text-[12px] font-bold !text-white shadow-[0_8px_18px_rgba(2,132,199,0.22)] hover:bg-[#0d6fa9]"
              >
                <ClipboardPenLine className="mr-2 h-4 w-4 !text-white" />
                Preencher Alvará
              </Button>
            ) : null}
            {canPreview ? (
              <Button
                type="button"
                onClick={() => openPdf(permit, manualSignatureSelected)}
                data-premium-dark-action="true"
                className="h-9 rounded-full border border-cyan-200/40 bg-[#0e7490] px-4 text-[12px] font-bold !text-white shadow-[0_8px_18px_rgba(8,145,178,0.22)] hover:bg-[#0891b2]"
              >
                <Eye className="mr-2 h-4 w-4" />
                {directorOfficial ? "Abrir PDF oficial" : "Abrir PDF para assinatura"}
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
                    Alvará assinado eletronicamente pela Diretoria responsável.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => openPdf()}
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
                    As etapas anteriores do licenciamento estão em conferência pela Prefeitura. O preenchimento e as assinaturas do Alvará são internos; o PDF final aparecerá aqui assim que for emitido.
                  </p>
                </div>
              </div>
            </div>
          )
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                  !approvalPaymentRequired || approvalPaymentConfirmed
                    ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                    : "rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30"
                }
              >
                <div className="flex items-center gap-2">
                  {!approvalPaymentRequired || approvalPaymentConfirmed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  )}
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                    Aprovação / Alvará
                  </p>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                  {!approvalPaymentRequired
                    ? "Cobrança não exigida"
                    : approvalPaymentConfirmed
                      ? "Pagamento compensado"
                      : "Pagamento ainda pendente"}
                </p>
                {approvalPaymentRequired && approvalPaidAt ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(approvalPaidAt).toLocaleString("pt-BR")}
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
                    : permit
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
                      O analista já pode conferir e preencher todos os dados do documento. A assinatura da Diretoria e a emissão final permanecem bloqueadas até a análise documental estar concluída e todas as guias exigidas para o Alvará estarem compensadas.
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

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className={issPaymentConfirmed
                    ? "rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-500/30 dark:bg-slate-950/45"
                    : "rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-500/30 dark:bg-slate-950/45"}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">ISSQN / Projeto</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                      {issPaymentConfirmed ? "Pagamento compensado" : "Aguardando compensação"}
                    </p>
                  </div>
                  <div className={!approvalPaymentRequired || approvalPaymentConfirmed
                    ? "rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-500/30 dark:bg-slate-950/45"
                    : "rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-500/30 dark:bg-slate-950/45"}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Aprovação / Alvará</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                      {!approvalPaymentRequired
                        ? "Cobrança não exigida"
                        : approvalPaymentConfirmed
                          ? "Pagamento compensado"
                          : "Aguardando emissão ou compensação"}
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
                <div className={secretaryOfficial ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
                  <div
                    className={
                      directorOfficial
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
                            : manualSignatureSelected
                              ? "PDF preparado para assinatura"
                              : directorRequestPending
                                ? "Solicitação eletrônica enviada à Diretoria"
                                : permitReadyForSignature
                                  ? "Escolha assinatura eletrônica ou assinatura manual"
                                  : "Disponível após a conclusão das etapas obrigatórias"}
                        </p>
                        {permit.directorSignature?.verificationCode ? (
                          <p className="mt-1 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            Código: {permit.directorSignature.verificationCode}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {!directorOfficial &&
                    directorRequestPending &&
                    userCanSignPermitAsDirector(session) ? (
                      <Button
                        type="button"
                        className="mt-4 rounded-full bg-violet-700 px-5 text-white hover:bg-violet-800"
                        disabled={!canSignDirector}
                        onClick={signAsDirector}
                      >
                        <Signature className="mr-2 h-4 w-4" />
                        Assinar eletronicamente como Diretor
                      </Button>
                    ) : null}

                    {manualSignatureSelected && !directorOfficial ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 rounded-full border-sky-300 text-sky-800 dark:border-sky-500/40 dark:text-sky-200"
                        onClick={() => openPdf(permit, true)}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Abrir PDF do Alvará
                      </Button>
                    ) : null}

                    {canSignSecretary ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 rounded-full border-sky-300 text-sky-800 dark:border-sky-500/40 dark:text-sky-200"
                        onClick={signAsSecretary}
                      >
                        <Signature className="mr-2 h-4 w-4" />
                        Assinar também como Secretário
                      </Button>
                    ) : null}
                  </div>

                  {secretaryOfficial ? (
                    <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                          <BadgeCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">
                            Assinatura da Secretaria
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {permit.secretarySignature?.name} • {new Date(
                              permit.secretarySignature?.signedAt,
                            ).toLocaleString("pt-BR")}
                          </p>
                          {permit.secretarySignature?.verificationCode ? (
                            <p className="mt-1 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Código: {permit.secretarySignature?.verificationCode}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {canStartDraft &&
                permitReadyForSignature &&
                !directorOfficial &&
                !directorRequestPending &&
                !manualSignatureSelected ? (
                  <div className="rounded-[20px] border border-sky-200 bg-[linear-gradient(145deg,#f8fbff_0%,#eef8ff_100%)] p-5 shadow-sm dark:border-sky-500/30 dark:bg-[linear-gradient(145deg,#0d2032_0%,#10283d_100%)]">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                          Assinatura do Alvará
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                          Escolha como a Diretoria vai assinar
                        </p>
                        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                          Envie para assinatura eletrônica com senha ou gere o PDF para o Diretor assinar manualmente.
                        </p>
                        {directors.length === 0 ? (
                          <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Assinatura eletrônica indisponível: nenhum perfil ativo está cadastrado como Diretor(a) de Urbanismo/Obras. A opção de assinatura manual continua disponível.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-violet-300 bg-violet-50 px-5 font-bold text-violet-800 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200"
                          disabled={Boolean(workflowBusy)}
                          onClick={() => void requestDirectorSignature()}
                        >
                          {workflowBusy === "request" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Enviar ao Diretor para assinar eletronicamente
                        </Button>
                        <Button
                          type="button"
                          className="rounded-full bg-sky-700 px-5 font-bold text-white hover:bg-sky-800"
                          disabled={Boolean(workflowBusy)}
                          onClick={() => void generateManualSignaturePdf()}
                        >
                          {workflowBusy === "manual" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Printer className="mr-2 h-4 w-4" />
                          )}
                          Gerar PDF do Alvará
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {directorRequestPending && canStartDraft && !directorOfficial ? (
                  <div className="rounded-[20px] border border-violet-200 bg-violet-50 px-5 py-4 dark:border-violet-500/30 dark:bg-violet-950/25">
                    <div className="flex items-center gap-3">
                      <Send className="h-5 w-5 text-violet-700 dark:text-violet-300" />
                      <div>
                        <p className="text-sm font-bold text-violet-950 dark:text-violet-100">
                          Solicitação enviada à Diretoria
                        </p>
                        <p className="mt-1 text-xs text-violet-800 dark:text-violet-200">
                          O Diretor pode abrir este processo e assinar eletronicamente com a própria senha.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

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
                          A assinatura obrigatória da Diretoria foi registrada e o PDF oficial está disponível no processo.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => openPdf()}
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
                        {permitFormTitle(formData.workType || process.property.workType || process.type)}
                      </DialogTitle>
                      <DialogDescription className="mt-1 max-w-3xl !text-slate-200">
                        Revise os dados e escolha a forma de assinatura da Diretoria: enviar para assinatura eletrônica com senha ou gerar o PDF para assinatura manual. A assinatura do Secretário é opcional e só aparece no Alvará quando ele realmente assinar eletronicamente.
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
                        <div className="md:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Endereço do proprietário / titular</label>
                          <Input value={formData.ownerAddress || ""} onChange={(event) => setFormData((current) => ({ ...current, ownerAddress: event.target.value }))} className="h-11 rounded-xl" placeholder="Endereço completo do titular, quando diferente do imóvel" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Responsável técnico</label>
                          <Input value={formData.technicalLead} onChange={(event) => setFormData((current) => ({ ...current, technicalLead: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">CREA / CAU / CFT</label>
                          <Input value={formData.technicalRegistration} onChange={(event) => setFormData((current) => ({ ...current, technicalRegistration: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Documento de responsabilidade</label>
                          <Input value={formData.technicalResponsibilityType || ""} onChange={(event) => setFormData((current) => ({ ...current, technicalResponsibilityType: event.target.value }))} className="h-11 rounded-xl" placeholder="ART, RRT ou TRT" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nº ART / RRT / TRT</label>
                          <Input value={formData.technicalResponsibilityNumber || ""} onChange={(event) => setFormData((current) => ({ ...current, technicalResponsibilityNumber: event.target.value }))} className="h-11 rounded-xl" />
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
                        <div className="xl:col-span-2">
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Bairro</label>
                          <Input value={formData.neighborhood || ""} onChange={(event) => setFormData((current) => ({ ...current, neighborhood: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Cidade</label>
                          <Input value={formData.city || ""} onChange={(event) => setFormData((current) => ({ ...current, city: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">CEP</label>
                          <Input value={formData.postalCode || ""} onChange={(event) => setFormData((current) => ({ ...current, postalCode: event.target.value }))} className="h-11 rounded-xl" />
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
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Área licenciada / total (m²)</label>
                          <Input value={formData.areaM2} onChange={(event) => setFormData((current) => ({ ...current, areaM2: event.target.value }))} className="h-11 rounded-xl" inputMode="decimal" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Matrícula do imóvel</label>
                          <Input value={formData.propertyRegistryNumber || ""} onChange={(event) => setFormData((current) => ({ ...current, propertyRegistryNumber: event.target.value }))} className="h-11 rounded-xl" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Cartório / C.R.I.</label>
                          <Input value={formData.propertyRegistryOffice || ""} onChange={(event) => setFormData((current) => ({ ...current, propertyRegistryOffice: event.target.value }))} className="h-11 rounded-xl" placeholder="Ex.: 2º C.R.I. de Jundiaí" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Área do terreno (m²)</label>
                          <Input value={formData.landAreaM2 || ""} onChange={(event) => setFormData((current) => ({ ...current, landAreaM2: event.target.value }))} className="h-11 rounded-xl" inputMode="decimal" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Testada (m)</label>
                          <Input value={formData.frontageM || ""} onChange={(event) => setFormData((current) => ({ ...current, frontageM: event.target.value }))} className="h-11 rounded-xl" inputMode="decimal" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nº de habitações</label>
                          <Input value={formData.housingUnits || ""} onChange={(event) => setFormData((current) => ({ ...current, housingUnits: event.target.value }))} className="h-11 rounded-xl" inputMode="numeric" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nº de pavimentos</label>
                          <Input value={formData.floors || ""} onChange={(event) => setFormData((current) => ({ ...current, floors: event.target.value }))} className="h-11 rounded-xl" inputMode="numeric" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nº de banheiros</label>
                          <Input value={formData.bathrooms || ""} onChange={(event) => setFormData((current) => ({ ...current, bathrooms: event.target.value }))} className="h-11 rounded-xl" inputMode="numeric" />
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


                    {isRegularizationForm ? (
                      <section className="rounded-[22px] border border-sky-200 bg-gradient-to-br from-white to-sky-50/60 p-5 shadow-sm dark:border-sky-700/50 dark:from-slate-950 dark:to-sky-950/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                              Edificação - regularização
                            </p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              Detalhe as áreas que compõem o total a regularizar. Esses itens serão impressos no Alvará oficial.
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="rounded-full border-sky-300 bg-white" onClick={addRegularizationArea}>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar área
                          </Button>
                        </div>

                        <div className="mt-4 space-y-2">
                          {regularizationAreas.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-sky-200 bg-white/80 px-4 py-4 text-xs text-slate-500 dark:border-sky-800 dark:bg-slate-950/60 dark:text-slate-400">
                              Nenhuma área detalhada. Inclua residência, garagem, varanda coberta, área gourmet, circulação coberta ou outra edificação pertinente.
                            </div>
                          ) : (
                            regularizationAreas.map((item, index) => (
                              <div key={item.id || index} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px_44px] dark:border-slate-700 dark:bg-slate-950">
                                <Input
                                  value={item.description}
                                  onChange={(event) => updateRegularizationArea(index, "description", event.target.value)}
                                  className="h-10 rounded-lg"
                                  placeholder="Descrição da edificação / área"
                                />
                                <Input
                                  value={item.areaM2}
                                  onChange={(event) => updateRegularizationArea(index, "areaM2", event.target.value)}
                                  className="h-10 rounded-lg"
                                  placeholder="Área (m²)"
                                  inputMode="decimal"
                                />
                                <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-lg" onClick={() => removeRegularizationArea(index)} aria-label="Remover área">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Badge className="rounded-full bg-sky-900 px-4 py-1.5 text-white">
                            Total detalhado: {regularizationAreaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²
                          </Badge>
                        </div>
                      </section>
                    ) : null}

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

                <DialogFooter className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/98 px-6 py-4 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-950/98">
                  <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={Boolean(workflowBusy)}
                        onClick={() => setFillOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={Boolean(workflowBusy)}
                        onClick={() => void savePermitForm(true)}
                      >
                        {workflowBusy === "save" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar rascunho
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-violet-300 bg-violet-50 px-5 font-bold text-violet-800 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-950/30 dark:text-violet-200"
                        disabled={!permitReadyForSignature || directors.length === 0 || Boolean(workflowBusy)}
                        onClick={() => void requestDirectorSignature()}
                      >
                        {workflowBusy === "request" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Enviar ao Diretor para assinar eletronicamente
                      </Button>

                      <Button
                        type="button"
                        className="rounded-full bg-sky-700 px-5 font-bold text-white hover:bg-sky-800"
                        disabled={!permitReadyForSignature || Boolean(workflowBusy)}
                        onClick={() => void generateManualSignaturePdf()}
                      >
                        {workflowBusy === "manual" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Printer className="mr-2 h-4 w-4" />
                        )}
                        Gerar PDF do Alvará
                      </Button>
                    </div>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={Boolean(signatureDialog)}
              onOpenChange={(open) => {
                if (signatureBusy) return;
                if (!open) {
                  setSignatureDialog(null);
                  setSignaturePassword("");
                  setSignatureError("");
                }
              }}
            >
              <DialogContent className="z-[100] max-w-lg overflow-hidden rounded-[26px] border-slate-200 bg-white p-0 shadow-[0_30px_90px_rgba(15,23,42,0.30)] dark:border-slate-700 dark:bg-slate-950">
                <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,#071b2e_0%,#0b456a_58%,#0d6c9f_100%)] px-6 py-5 text-left dark:border-slate-700">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
                      <Signature className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] !text-sky-100">
                        Assinatura eletrônica
                      </p>
                      <DialogTitle className="mt-1 text-lg font-bold !text-white">
                        {signatureDialog === "director"
                          ? "Assinatura da Diretoria"
                          : "Assinatura da Secretaria"}
                      </DialogTitle>
                      <DialogDescription className="mt-1 !text-slate-200">
                        Confirme com sua senha de acesso. O SIGAPRO registrará a identidade, data, código de verificação e SHA-256 da versão assinada.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4 px-6 py-5">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      Senha de acesso
                    </label>
                    <Input
                      type="password"
                      value={signaturePassword}
                      onChange={(event) => setSignaturePassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && signaturePassword && !signatureBusy) {
                          void confirmElectronicSignature();
                        }
                      }}
                      autoComplete="current-password"
                      className="mt-2 h-11 rounded-xl"
                      placeholder="Digite sua senha"
                      disabled={signatureBusy}
                    />
                  </div>

                  {signatureError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">
                      {signatureError}
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={signatureBusy}
                    onClick={() => {
                      setSignatureDialog(null);
                      setSignaturePassword("");
                      setSignatureError("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-sky-700 px-5 font-bold text-white hover:bg-sky-800"
                    disabled={signatureBusy || !signaturePassword}
                    onClick={() => void confirmElectronicSignature()}
                  >
                    <Signature className="mr-2 h-4 w-4" />
                    {signatureBusy ? "Validando e assinando..." : "Confirmar com minha senha"}
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
