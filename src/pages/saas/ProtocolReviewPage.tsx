import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileCheck2,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { ProtocolStepProgress } from "@/components/platform/ProtocolStepProgress";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  createRemoteExternalProcess,
  uploadFileToStorage,
} from "@/integrations/supabase/platform";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import {
  clearProtocolDraft,
  getProtocolFlowBasePath,
  readProtocolDraft,
  restoreUploadedFiles,
  saveProtocolDraft,
} from "@/lib/protocolDraft";

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function ProtocolReviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const { createProcess, getInstitutionSettings } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);
  const draft = useMemo(
    () => readProtocolDraft(session.id, effectiveScopeId, session.tenantId),
    [effectiveScopeId, session.id, session.tenantId],
  );
  const basePath = getProtocolFlowBasePath(location.pathname);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const documentEntries = useMemo(
    () =>
      Object.entries(draft?.files ?? {}).flatMap(([label, items]) =>
        items.map((item) => ({
          label,
          ...item,
        })),
      ),
    [draft?.files],
  );

  const requiredDocumentLabels = useMemo(
    () => [...new Set(documentEntries.map((item) => item.label))],
    [documentEntries],
  );

  const handleConfirm = async () => {
    if (!draft) {
      navigate(basePath, { replace: true });
      return;
    }

    if (!effectiveScopeId) {
      setStatus("O perfil atual não está vinculado a uma Prefeitura.");
      return;
    }

    setSubmitting(true);
    setStatus("");

    let restoredFiles = await restoreUploadedFiles(draft.files);
    let documents = Object.entries(restoredFiles).flatMap(([label, items]) =>
      items.map((file) => ({
        id: `doc-${crypto.randomUUID()}`,
        label,
        required: true,
        uploaded: true,
        signed: normalizeLabel(label).includes("projeto arquitetonico"),
        version: 1,
        source: "profissional" as const,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeLabel: file.sizeLabel,
        previewUrl: file.previewUrl,
      })),
    );

    let remoteSeed:
      | {
          processId: string;
          protocol: string;
          guideNumber: string;
          dueDate: string;
          amount: number;
          issuedAt: string;
          expiresAt: string;
        }
      | undefined;

    if (hasSupabaseEnv && supabase) {
      try {
        documents = await Promise.all(
          documents.map(async (document) => {
            const sourceFile = (restoredFiles[document.label] ?? []).find(
              (item) => item.fileName === document.fileName,
            )?.file;
            if (!sourceFile) return document;

            const uploaded = await uploadFileToStorage({
              bucket: "process-documents",
              tenantId: effectiveScopeId,
              userId: session.id,
              file: sourceFile,
              folder: "protocolos",
            });

            return {
              ...document,
              filePath: uploaded.path,
              previewUrl: uploaded.publicUrl,
            };
          }),
        );

        const remoteProcess = await createRemoteExternalProcess({
          tenantId: effectiveScopeId,
          createdBy: session.id,
          title: draft.form.titulo,
          type: draft.form.tipo,
          address: draft.form.endereco,
          ownerName: draft.form.proprietario,
          ownerDocument: draft.form.documento,
          technicalLead: draft.form.profissional,
          tags: [
            draft.form.uso || "sem classificacao",
            tenantSettings?.secretariaResponsavel || "urbanismo",
          ],
          notes: draft.form.observacoes,
          property: {
            registration: draft.form.matricula,
            iptu: draft.form.iptu,
            lot: draft.form.lote,
            block: draft.form.quadra,
            area: Number(draft.form.area || 0),
            usage: draft.form.uso,
            constructionStandard: draft.form.padraoConstrutivo,
          },
          documents,
          guidePrefix: tenantSettings?.guiaPrefixo || "DAM",
        });

        const issuedAt = new Date().toISOString();
        remoteSeed = {
          processId: remoteProcess.process_id,
          protocol: remoteProcess.protocol_number,
          guideNumber: remoteProcess.guide_number,
          dueDate: new Date(remoteProcess.due_date).toLocaleDateString("pt-BR"),
          amount: Number(remoteProcess.amount ?? 35.24),
          issuedAt,
          expiresAt: new Date(new Date(issuedAt).getTime() + 60 * 60 * 1000).toISOString(),
        };
      } catch (remoteError) {
        setStatus(
          remoteError instanceof Error
            ? remoteError.message
            : "Falha ao gravar o protocolo remoto. O sistema vai manter o fluxo local.",
        );
      }
    }

    const process = createProcess({
      tenantId: effectiveScopeId,
      createdBy: session.id,
      title: draft.form.titulo,
      type: draft.form.tipo,
      address: draft.form.endereco,
      ownerName: draft.form.proprietario,
      ownerDocument: draft.form.documento,
      technicalLead: draft.form.profissional,
      tags: [
        draft.form.uso || "sem classificacao",
        tenantSettings?.secretariaResponsavel || "urbanismo",
      ],
      notes: draft.form.observacoes,
      property: {
        registration: draft.form.matricula,
        iptu: draft.form.iptu,
        lot: draft.form.lote,
        block: draft.form.quadra,
        area: Number(draft.form.area || 0),
        usage: draft.form.uso,
        constructionStandard: draft.form.padraoConstrutivo,
      },
      documents,
      remote: remoteSeed,
    });

    clearProtocolDraft(session.id, effectiveScopeId, session.tenantId);
    setSubmitting(false);
    navigate(`/processos/${process.id}?aba=financeiro`);
  };

  if (!draft?.form.titulo) {
    navigate(basePath, { replace: true });
    return null;
  }

  return (
    <PortalFrame eyebrow="Novo protocolo" title="Revisão e confirmação final">
      <div className="space-y-6">
        <ProtocolStepProgress currentStep={3} />

        <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
          <Card className="rounded-[28px] border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Landmark className="h-5 w-5" />
                Resumo do protocolo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Pré-protocolo</p>
                <p className="mt-2 line-clamp-2 text-base font-semibold text-slate-950">
                  {draft.draftNumber}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Projeto</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold text-slate-950"
                  title={draft.form.titulo}
                >
                  {draft.form.titulo}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Tipo de obra</p>
                <p className="mt-2 line-clamp-2 text-base font-semibold text-slate-950">
                  {draft.form.tipo}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Padrão construtivo</p>
                <p className="mt-2 line-clamp-2 text-base font-semibold text-slate-950">
                  {draft.form.padraoConstrutivo || "Médio"}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Endereço</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold text-slate-950"
                  title={draft.form.endereco}
                >
                  {draft.form.endereco}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Responsável técnico</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold text-slate-950"
                  title={draft.form.profissional}
                >
                  {draft.form.profissional}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="sig-label">Proprietário</p>
                <p
                  className="mt-2 line-clamp-2 text-base font-semibold text-slate-950"
                  title={draft.form.proprietario}
                >
                  {draft.form.proprietario}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <FileCheck2 className="h-5 w-5" />
                Revisão dos documentos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredDocumentLabels.map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-base font-semibold text-slate-950" title={label}>
                      {label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-slate-600">
                      {(draft.files[label] ?? [])[0]?.fileName || "Arquivo não informado"}
                    </p>
                  </div>
                  <div className="shrink-0 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Enviado
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[15px] leading-6 text-slate-600">
                Ao confirmar, o sistema gera o protocolo, registra os documentos enviados e
                abre a etapa financeira inicial.
              </div>
            </CardContent>
          </Card>
        </div>

        {status ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-600 dark:text-amber-400">
            {status}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 md:flex-row md:items-center md:justify-between">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => navigate(`${basePath}/documentos`)}
          >
            Voltar
          </Button>
          <div className="flex flex-col gap-3 md:flex-row">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (!draft) return;
                saveProtocolDraft(session.id, effectiveScopeId, {
                  ...draft,
                  updatedAt: new Date().toISOString(),
                });
                setStatus("Rascunho salvo com sucesso.");
              }}
            >
              Salvar rascunho
            </Button>
            <Button
              type="button"
              className="rounded-full bg-slate-950 hover:bg-slate-900"
              disabled={submitting}
              onClick={() => void handleConfirm()}
            >
              {submitting ? "Confirmando protocolo..." : "Confirmar protocolo"}
            </Button>
          </div>
        </div>
      </div>
    </PortalFrame>
  );
}
