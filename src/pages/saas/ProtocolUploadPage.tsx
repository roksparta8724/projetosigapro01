import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, FileStack, FolderKanban, ScrollText, UploadCloud } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { ProtocolStepProgress } from "@/components/platform/ProtocolStepProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { getChecklistTemplate } from "@/lib/platform";
import {
  getProtocolFlowBasePath,
  readProtocolDraft,
  restoreUploadedFiles,
  saveProtocolDraft,
  toStoredUploadedFiles,
} from "@/lib/protocolDraft";

interface UploadDocumentItem {
  label: string;
  description: string;
  category: "obrigatorios" | "tecnicos" | "complementares";
  required: boolean;
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function describeDocument(label: string): Omit<UploadDocumentItem, "label" | "required"> {
  const normalized = normalizeLabel(label);

  if (normalized.includes("art") || normalized.includes("rrt") || normalized.includes("projeto arquitetonico") || normalized.includes("memorial") || normalized.includes("levantamento")) {
    return {
      category: "tecnicos",
      description: "Documento técnico principal para análise do projeto.",
    };
  }

  if (normalized.includes("procuracao") || normalized.includes("licenc") || normalized.includes("anu") || normalized.includes("complementar")) {
    return {
      category: "complementares",
      description: "Documento complementar usado quando exigido pelo processo.",
    };
  }

  return {
    category: "obrigatorios",
      description: "Documento obrigatório para validar a identificação e o cadastro do protocolo.",
  };
}

const groupMeta = {
  obrigatorios: { title: "Documentos obrigatórios", icon: ScrollText },
  tecnicos: { title: "Documentos técnicos", icon: FileStack },
  complementares: { title: "Documentos complementares", icon: FolderKanban },
} as const;

export function ProtocolUploadPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { scopeId } = useMunicipality();
  const basePath = getProtocolFlowBasePath(location.pathname);
  const [status, setStatus] = useState("");
  const [files, setFiles] = useState<Record<string, UploadedFileItem[]>>({});

  const draft = useMemo(() => readProtocolDraft(session.id, scopeId, session.tenantId), [scopeId, session.id, session.tenantId]);
  const checklistTemplate = useMemo(
    () => getChecklistTemplate(draft?.form.tipo || "", scopeId),
    [draft?.form.tipo, scopeId],
  );

  const documentItems = useMemo<UploadDocumentItem[]>(() => {
    const labels =
      checklistTemplate?.items.map((item) => ({
        label: item.label,
        required: item.required,
      })) ?? [
        { label: "RG ou CNH do proprietário", required: true },
        { label: "CPF do proprietário", required: true },
        { label: "RG ou CNH do responsável técnico", required: true },
        { label: "CPF do responsável técnico", required: true },
        { label: "IPTU", required: true },
        { label: "Matrícula do imóvel", required: true },
        { label: "Procuracao", required: false },
        { label: "ART ou RRT", required: true },
        { label: "Projeto arquitetônico", required: true },
        { label: "Memorial descritivo", required: true },
        { label: "Levantamento planialtimetrico", required: true },
        { label: "Licenças complementares", required: false },
      ];

    return labels.map((item) => ({
      label: item.label,
      required: item.required,
      ...describeDocument(item.label),
    }));
  }, [checklistTemplate]);

  useEffect(() => {
    if (!draft?.form.titulo) {
      navigate(basePath, { replace: true });
      return;
    }

    void (async () => {
      const restored = await restoreUploadedFiles(draft.files);
      setFiles(restored);
    })();
  }, [basePath, draft, navigate]);

  const groupedDocuments = useMemo(
    () =>
      documentItems.reduce<Record<UploadDocumentItem["category"], UploadDocumentItem[]>>(
        (acc, item) => {
          acc[item.category].push(item);
          return acc;
        },
        { obrigatorios: [], tecnicos: [], complementares: [] },
      ),
    [documentItems],
  );

  const getFileStatus = (item: UploadDocumentItem) => {
    const count = files[item.label]?.length ?? 0;
    if (count > 0) return "enviado";
    if (item.required) return "pendente";
    return "nao_enviado";
  };

  const missingRequired = documentItems.filter((item) => item.required && (files[item.label]?.length ?? 0) === 0);

  const persistDraft = () => {
    if (!draft) return;
    saveProtocolDraft(session.id, scopeId, {
      ...draft,
      files: toStoredUploadedFiles(files),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAdvance = () => {
    setStatus("");
    if (missingRequired.length > 0) {
      setStatus("Ainda faltam documentos obrigatórios. Envie todos os itens marcados como pendentes para continuar.");
      return;
    }
    persistDraft();
    navigate(`${basePath}/revisao`);
  };

  return (
    <PortalFrame eyebrow="Novo protocolo" title="Upload de documentos do processo">
      <div className="space-y-6">
        <ProtocolStepProgress currentStep={2} />

        <Card className="rounded-[28px] border-slate-200">
          <CardContent className="grid gap-4 p-6 md:grid-cols-4">
            <div>
              <p className="sig-label">Pre-protocolo</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{draft?.draftNumber || "Não informado"}</p>
            </div>
            <div>
              <p className="sig-label">Projeto</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{draft?.form.titulo || "Não informado"}</p>
            </div>
            <div>
              <p className="sig-label">Tipo de obra</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{draft?.form.tipo || "Não informado"}</p>
            </div>
            <div>
              <p className="sig-label">Responsável técnico</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{draft?.form.profissional || "Não informado"}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {(Object.keys(groupedDocuments) as Array<keyof typeof groupedDocuments>).map((groupKey) => {
            const group = groupedDocuments[groupKey];
            const meta = groupMeta[groupKey];

            return (
              <Card key={groupKey} className="rounded-[28px] border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <meta.icon className="h-5 w-5" />
                    {meta.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {group.map((item) => {
                    const itemStatus = getFileStatus(item);

                    return (
                      <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {itemStatus === "enviado" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : itemStatus === "pendente" ? (
                                <AlertCircle className="h-4 w-4 text-amber-600" />
                              ) : (
                                <CircleDashed className="h-4 w-4 text-slate-400" />
                              )}
                              <p className="text-base font-semibold text-slate-950">{item.label}</p>
                            </div>
                            <p className="mt-2 text-[15px] leading-6 text-slate-600">{item.description}</p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                              itemStatus === "enviado"
                                ? "bg-emerald-50 text-emerald-700"
                                : itemStatus === "pendente"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                              {itemStatus === "enviado" ? "Enviado" : itemStatus === "pendente" ? "Pendente" : "Não enviado"}
                          </span>
                        </div>

                        <FileDropZone
                          title={item.label}
                          description="Arraste um PDF ou uma imagem. Você pode substituir ou remover antes da confirmação final."
                          accept=".pdf,image/*"
                          multiple={false}
                          allowPreview
                          files={files[item.label] ?? []}
                          onFilesSelected={(selected) => setFiles((current) => ({ ...current, [item.label]: selected }))}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {status ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{status}</div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 md:flex-row md:items-center md:justify-between">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(basePath)}>
            Voltar
          </Button>
          <div className="flex flex-col gap-3 md:flex-row">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                persistDraft();
                setStatus("Rascunho de upload salvo com sucesso.");
              }}
            >
              Salvar rascunho
            </Button>
            <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" onClick={handleAdvance}>
              Avançar
            </Button>
          </div>
        </div>
      </div>
    </PortalFrame>
  );
}
