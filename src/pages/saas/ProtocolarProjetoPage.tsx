import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  FilePlus2,
  FileStack,
  Landmark,
  Link2,
  Loader2,
  LogOut,
  Sparkles,
  ShieldCheck,
  UploadCloud,
  UserSquare2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { PageHero } from "@/components/platform/PageHero";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import {
  createRemoteExternalProcessV2,
  getRemoteExternalPreprotocolDraft,
  registerRemoteExternalAccount,
} from "@/integrations/backend/platform";
import { deleteFileFromStorage, uploadFileToStorage } from "@/integrations/r2/storage";
import { hasBackendEnv } from "@/integrations/backend/databaseClient";
import { getOfficialConstructionPermit } from "@/integrations/permits/constructionPermitClient";
import {
  formatOfficialProcessNumber,
  getChecklistTemplate,
  isOccupancyPermitProcessType,
  matchesOperationalScope,
  processTypeCatalog,
  workTypeCatalog,
} from "@/lib/platform";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import {
  createDraftNumber,
  defaultProtocolDraftForm,
  clearProtocolDraft,
  inferProtocolDraftEntryMode,
  readProtocolDraft,
  restoreUploadedFiles,
  saveProtocolDraft,
  toStoredUploadedFiles,
  type ProtocolDraftEntryMode,
  type ProtocolDraftForm,
} from "@/lib/protocolDraft";

interface UploadDocumentItem {
  label: string;
  description: string;
  category: "pessoais" | "imovel" | "tecnicos" | "complementares";
  required: boolean;
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getFilesForDocumentLabel(
  fileMap: Record<string, UploadedFileItem[]>,
  label: string,
) {
  const normalized = normalizeLabel(label);
  return (
    Object.entries(fileMap).find(
      ([key]) => normalizeLabel(key) === normalized,
    )?.[1] ?? []
  );
}

function replaceFilesForDocumentLabel(
  fileMap: Record<string, UploadedFileItem[]>,
  label: string,
  items: UploadedFileItem[],
) {
  const normalized = normalizeLabel(label);
  const next = Object.fromEntries(
    Object.entries(fileMap).filter(
      ([key]) => normalizeLabel(key) !== normalized,
    ),
  ) as Record<string, UploadedFileItem[]>;

  if (items.length > 0) next[label] = items;
  return next;
}

function describeDocument(label: string): Omit<UploadDocumentItem, "label" | "required"> {
  const normalized = normalizeLabel(label);

  if (normalized.includes("proprietario") || normalized.includes("responsavel tecnico")) {
    return {
      category: "pessoais",
      description: "Documento de identificação das partes envolvidas no protocolo.",
    };
  }

  if (normalized.includes("iptu") || normalized.includes("matricula") || normalized.includes("imovel")) {
    return {
      category: "imovel",
      description: "Documento de vinculação do projeto ao imóvel e ao cadastro municipal.",
    };
  }

  if (
    normalized.includes("art") ||
    normalized.includes("rrt") ||
    normalized.includes("projeto arquitetonico") ||
    normalized.includes("memorial") ||
    normalized.includes("levantamento")
  ) {
    return {
      category: "tecnicos",
      description: "Documento técnico principal para análise urbanística e edilícia.",
    };
  }

  return {
    category: "complementares",
    description: "Documento complementar ou anuência adicional vinculada ao processo.",
  };
}

const groupMeta = {
  pessoais: { title: "Documentos pessoais", icon: UserSquare2 },
  imovel: { title: "Documentos do imóvel", icon: Landmark },
  tecnicos: { title: "Documentos técnicos", icon: FileStack },
  complementares: { title: "Documentos complementares", icon: ShieldCheck },
} as const;

const buildingTypeCatalog = [
  "Casa térrea",
  "Sobrado",
  "Edifício residencial",
  "Edifício comercial",
  "Edifício misto",
  "Condomínio residencial",
  "Galpão",
  "Industrial",
  "Institucional",
  "Outro",
] as const;

function SoftInfoCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "amber";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "amber"
          ? "border-amber-200/40 bg-amber-50 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-100"
          : "border-slate-200/80 bg-slate-50 dark:border-white/12 dark:bg-white/[0.04]"
      }`}
    >
      <p className="sig-label">{label}</p>
      <p className="mt-2 text-[15px] font-medium leading-6 text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

export type ProtocolEntryMode = "projeto" | "habite-se";

export function ProtocolarProjetoPage({
  mode = "projeto",
}: {
  mode?: ProtocolEntryMode;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHabiteSeMode = mode === "habite-se";
  const draftEntryMode: ProtocolDraftEntryMode = isHabiteSeMode
    ? "habite-se"
    : "projeto";
  const draftStorageFolder = isHabiteSeMode ? "habite-se" : "protocolos";
  const { session } = usePlatformSession();
  const planEntitlements = usePlanEntitlements();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const { refreshRemoteStore, getInstitutionSettings, getUserProfile, appendProcessDocuments, processes } = usePlatformData();

  const profile = getUserProfile(session.id);
  const profileFullName = profile?.fullName ?? "";
  const profileRegistrationNumber = profile?.registrationNumber ?? "";
  const profilePhone = profile?.phone ?? "";
  const profileEmail = profile?.email ?? "";
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);
  const scopedProcesses = useMemo(
    () => processes.filter((process) => matchesOperationalScope(effectiveScopeId, process)),
    [effectiveScopeId, processes],
  );
  const activeProcessCount = useMemo(
    () =>
      scopedProcesses.filter(
        (process) => process.isOfficial !== false && process.status !== "arquivado",
      ).length,
    [scopedProcesses],
  );
  const habiteSeSourceProcesses = useMemo(
    () =>
      scopedProcesses
        .filter((process) => {
          if (process.isOfficial === false || process.status === "arquivado") return false;
          if (isOccupancyPermitProcessType(process.type)) return false;
          const email = String(session.email || "").toLocaleLowerCase("pt-BR");
          return (
            process.createdByProfileId === session.id ||
            process.professionalProfileId === session.id ||
            process.createdBy === session.id ||
            process.professionalUserId === session.id ||
            String(process.createdByEmail || "").toLocaleLowerCase("pt-BR") === email ||
            String(process.professionalEmail || "").toLocaleLowerCase("pt-BR") === email
          );
        })
        .sort((a, b) => String(b.officializedAt || "").localeCompare(String(a.officializedAt || ""))),
    [scopedProcesses, session.email, session.id],
  );
  const knownStorageBytes = useMemo(
    () =>
      scopedProcesses.reduce(
        (total, process) =>
          total +
          process.documents.reduce(
            (documentTotal, document) => documentTotal + Number(document.fileSizeBytes || 0),
            0,
          ),
        0,
      ),
    [scopedProcesses],
  );

  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [files, setFiles] = useState<Record<string, UploadedFileItem[]>>({});
  const filesRef = useRef<Record<string, UploadedFileItem[]>>({});
  const uploadBusyRef = useRef(false);
  const [uploadingLabels, setUploadingLabels] = useState<Record<string, boolean>>({});
  const hasPendingDocumentUpload = Object.values(uploadingLabels).some(Boolean);
  const replaceFiles = (next: Record<string, UploadedFileItem[]>) => {
    filesRef.current = next;
    setFiles(next);
  };
  const [draftNumber, setDraftNumber] = useState(() =>
    createDraftNumber(draftEntryMode),
  );
  const [form, setForm] = useState<ProtocolDraftForm>({
    ...defaultProtocolDraftForm,
    tipo: isHabiteSeMode ? "Habite-se" : defaultProtocolDraftForm.tipo,
    tipoObra: isHabiteSeMode ? "Conclusão da obra" : defaultProtocolDraftForm.tipoObra,
    padraoConstrutivo: isHabiteSeMode ? "" : defaultProtocolDraftForm.padraoConstrutivo,
    profissional: profileFullName || session.name,
    profissionalDocumento: profile?.cpfCnpj || "",
    tipoProfissional: profile?.professionalType || "",
    empresaProfissional: profile?.companyName || "",
    registro: profileRegistrationNumber,
    telefone: profilePhone,
    email: profileEmail || session.email,
  });
  const searchParams = new URLSearchParams(location.search);
  const resumeDraftNumber = searchParams.get("rascunho");
  const remotePreProtocolNumber = searchParams.get("preprotocolo");
  const isResumingDraft = Boolean(resumeDraftNumber || remotePreProtocolNumber);
  const remoteHydratedRef = useRef("");
  const [remoteDraftLoading, setRemoteDraftLoading] = useState(false);
  const [sourceProcessId, setSourceProcessId] = useState("");
  const [sourceProcessLoading, setSourceProcessLoading] = useState(false);
  const [sourcePermitLabel, setSourcePermitLabel] = useState("");
  const remoteDraftActionRef = useRef<"save" | "payment">("payment");

  useEffect(() => {
    let cancelled = false;

    // Não inicializa o fluxo antes de o escopo municipal existir. Assim o
    // usuário nunca seleciona arquivos em um contexto que será reiniciado
    // alguns instantes depois quando a Prefeitura terminar de carregar.
    if (!effectiveScopeId) {
      return () => {
        cancelled = true;
      };
    }

    if (
      remotePreProtocolNumber &&
      remoteHydratedRef.current !== remotePreProtocolNumber
    ) {
      remoteHydratedRef.current = remotePreProtocolNumber;
      setRemoteDraftLoading(true);
      setStatus("Carregando o rascunho vinculado à guia inicial...");

      void getRemoteExternalPreprotocolDraft(remotePreProtocolNumber)
        .then((remoteDraft) => {
          if (cancelled) return;

          const payload = remoteDraft.payload ?? {};
          const remoteType = String(payload.type || "");
          const remoteMode: ProtocolDraftEntryMode =
            isOccupancyPermitProcessType(remoteType) ? "habite-se" : "projeto";

          if (remoteMode !== draftEntryMode) {
            const correctRoute =
              remoteMode === "habite-se"
                ? "/externo/habite-se"
                : "/externo/protocolar";
            navigate(
              `${correctRoute}?preprotocolo=${encodeURIComponent(
                remoteDraft.preProtocolNumber,
              )}`,
              { replace: true },
            );
            return;
          }

          const storedForm =
            payload.draftForm && typeof payload.draftForm === "object"
              ? (payload.draftForm as Partial<ProtocolDraftForm>)
              : {};

          setDraftNumber(remoteDraft.preProtocolNumber);
          setForm({
            ...defaultProtocolDraftForm,
            ...storedForm,
            tipo: isHabiteSeMode
              ? (storedForm.modalidadeHabiteSe === "parcial"
                  ? "Carta de Habite-se Parcial"
                  : "Habite-se")
              : String(storedForm.tipo || payload.type || ""),
            tipoObra: isHabiteSeMode
              ? "Conclusão da obra"
              : String(storedForm.tipoObra || payload.workType || ""),
            padraoConstrutivo: isHabiteSeMode
              ? ""
              : String(
                  storedForm.padraoConstrutivo ||
                    payload.constructionStandard ||
                    "",
                ),
            titulo: String(storedForm.titulo || payload.title || ""),
            endereco: String(storedForm.endereco || payload.address || ""),
            iptu: String(storedForm.iptu || payload.iptu || ""),
            matricula: String(
              storedForm.matricula || payload.registration || "",
            ),
            lote: String(storedForm.lote || payload.lot || ""),
            quadra: String(storedForm.quadra || payload.block || ""),
            area: String(storedForm.area || payload.area || ""),
            uso: String(storedForm.uso || payload.usage || ""),
            tipoEdificacao: String(
              storedForm.tipoEdificacao || payload.buildingType || "",
            ),
            proprietario: String(
              storedForm.proprietario || payload.ownerName || "",
            ),
            documento: String(
              storedForm.documento || payload.ownerDocument || "",
            ),
            proprietarioRg: String(
              storedForm.proprietarioRg ||
                payload.ownerIdentityDocument ||
                "",
            ),
            proprietarioTelefone: String(
              storedForm.proprietarioTelefone || payload.ownerPhone || "",
            ),
            proprietarioEmail: String(
              storedForm.proprietarioEmail || payload.ownerEmail || "",
            ),
            profissional: String(
              storedForm.profissional ||
                payload.technicalLead ||
                profileFullName ||
                session.name,
            ),
            profissionalDocumento: String(
              storedForm.profissionalDocumento ||
                payload.professionalDocument ||
                profile?.cpfCnpj ||
                "",
            ),
            tipoProfissional: String(
              storedForm.tipoProfissional ||
                payload.professionalType ||
                profile?.professionalType ||
                "",
            ),
            empresaProfissional: String(
              storedForm.empresaProfissional ||
                payload.professionalCompany ||
                profile?.companyName ||
                "",
            ),
            registro: String(
              storedForm.registro ||
                payload.professionalRegistration ||
                profileRegistrationNumber ||
                "",
            ),
            telefone: String(
              storedForm.telefone ||
                payload.professionalPhone ||
                profilePhone ||
                "",
            ),
            email: String(
              storedForm.email ||
                payload.professionalEmail ||
                profileEmail ||
                session.email,
            ),
          });

          const payloadDocuments = Array.isArray(payload.documents)
            ? payload.documents
            : [];
          const storedFiles = payloadDocuments.reduce<
            Record<string, Array<{
              id: string;
              fileName: string;
              mimeType: string;
              sizeLabel: string;
              storagePath?: string;
              fileSizeBytes?: number;
            }>>
          >((acc, rawDocument, index) => {
            const document = rawDocument as Record<string, unknown>;
            const label = String(document.label || "Documento");
            const fileName = String(document.fileName || label);
            const item = {
              id: String(document.id || `remote-${index}`),
              fileName,
              mimeType: String(
                document.mimeType || "application/octet-stream",
              ),
              sizeLabel: String(document.sizeLabel || "arquivo salvo"),
              storagePath: document.filePath
                ? String(document.filePath)
                : undefined,
              fileSizeBytes: Number(document.fileSizeBytes || 0) || undefined,
            };
            (acc[label] ||= []).push(item);
            return acc;
          }, {});

          const shell = storedFiles as Parameters<
            typeof restoreUploadedFiles
          >[0];
          replaceFiles(shell as Record<string, UploadedFileItem[]>);
          void restoreUploadedFiles(shell).then((restored) => {
            if (!cancelled) replaceFiles(restored);
          });

          setStatus(
            `Rascunho carregado. A guia ${remoteDraft.guide.number || "inicial"} continua pendente; você pode ajustar os dados antes do pagamento.`,
          );
        })
        .catch((error) => {
          if (cancelled) return;
          remoteHydratedRef.current = "";
          setStatus(
            error instanceof Error
              ? error.message
              : "Não foi possível abrir o rascunho do pré-protocolo.",
          );
        })
        .finally(() => {
          if (!cancelled) setRemoteDraftLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    const requestedDraft = resumeDraftNumber
      ? readProtocolDraft(
          session.id,
          effectiveScopeId,
          session.tenantId,
          resumeDraftNumber,
        )
      : null;

    if (requestedDraft) {
      const requestedMode = inferProtocolDraftEntryMode(requestedDraft);
      if (requestedMode !== draftEntryMode) {
        const correctRoute =
          requestedMode === "habite-se"
            ? "/externo/habite-se"
            : "/externo/protocolar";
        navigate(
          `${correctRoute}?rascunho=${encodeURIComponent(requestedDraft.draftNumber)}`,
          { replace: true },
        );
        return () => {
          cancelled = true;
        };
      }
    }

    const draft = requestedDraft
      ? readProtocolDraft(
          session.id,
          effectiveScopeId,
          session.tenantId,
          resumeDraftNumber,
          draftEntryMode,
        )
      : null;

    if (draft) {
      setDraftNumber(draft.draftNumber);
      setStatus("");
      setForm({
        ...defaultProtocolDraftForm,
        ...draft.form,
        tipo: isHabiteSeMode
          ? (draft.form.modalidadeHabiteSe === "parcial" ? "Carta de Habite-se Parcial" : "Habite-se")
          : draft.form.tipo,
        tipoObra: isHabiteSeMode ? "Conclusão da obra" : draft.form.tipoObra,
        padraoConstrutivo: isHabiteSeMode ? "" : draft.form.padraoConstrutivo,
        modalidadeHabiteSe: draft.form.modalidadeHabiteSe || "integral",
        profissional: draft.form.profissional || profileFullName || session.name,
        profissionalDocumento: draft.form.profissionalDocumento || profile?.cpfCnpj || "",
        tipoProfissional: draft.form.tipoProfissional || profile?.professionalType || "",
        empresaProfissional: draft.form.empresaProfissional || profile?.companyName || "",
        registro: draft.form.registro || profileRegistrationNumber,
        telefone: draft.form.telefone || profilePhone,
        email: draft.form.email || profileEmail || session.email,
      });

      // Renderiza primeiro a estrutura já persistida, sem esperar URLs
      // assinadas. Depois só atualiza o src do preview dentro de uma área de
      // altura fixa. Isso evita o bloco inteiro aparecer de uma vez e empurrar
      // a página quando um rascunho é reaberto.
      const restoredShell = Object.fromEntries(
        Object.entries(draft.files).map(([label, items]) => [
          label,
          items.map((item) => ({ ...item } as UploadedFileItem)),
        ]),
      ) as Record<string, UploadedFileItem[]>;
      replaceFiles(restoredShell);

      void restoreUploadedFiles(draft.files).then((restored) => {
        if (!cancelled) replaceFiles(restored);
      });
      return () => {
        cancelled = true;
      };
    }

    // /externo/protocolar é sempre uma nova abertura. Rascunhos só são
    // carregados quando o profissional escolhe "Continuar rascunho".
    setDraftNumber(createDraftNumber(draftEntryMode));
    replaceFiles({});
    setForm({
      ...defaultProtocolDraftForm,
      tipo: isHabiteSeMode ? "Habite-se" : defaultProtocolDraftForm.tipo,
      tipoObra: isHabiteSeMode ? "Conclusão da obra" : defaultProtocolDraftForm.tipoObra,
      padraoConstrutivo: isHabiteSeMode ? "" : defaultProtocolDraftForm.padraoConstrutivo,
      profissional: profileFullName || session.name,
      registro: profileRegistrationNumber,
      telefone: profilePhone,
      email: profileEmail || session.email,
    });
    setStatus(
      resumeDraftNumber
        ? "O rascunho selecionado não foi encontrado. Uma nova abertura foi iniciada."
        : "",
    );

    return () => {
      cancelled = true;
    };
  }, [
    effectiveScopeId,
    remotePreProtocolNumber,
    resumeDraftNumber,
    session.id,
    session.tenantId,
    isHabiteSeMode,
    draftEntryMode,
    navigate,
  ]);

  // Dados do perfil podem chegar depois do primeiro paint. Preenche apenas
  // campos vazios; nunca reinicializa anexos nem o rascunho já em edição.
  useEffect(() => {
    setForm((current) => ({
      ...current,
      profissional: current.profissional || profileFullName || session.name,
      profissionalDocumento: current.profissionalDocumento || profile?.cpfCnpj || "",
      tipoProfissional: current.tipoProfissional || profile?.professionalType || "",
      empresaProfissional: current.empresaProfissional || profile?.companyName || "",
      registro: current.registro || profileRegistrationNumber,
      telefone: current.telefone || profilePhone,
      email: current.email || profileEmail || session.email,
    }));
  }, [
    profile?.companyName,
    profile?.cpfCnpj,
    profile?.professionalType,
    profileEmail,
    profileFullName,
    profilePhone,
    profileRegistrationNumber,
    session.email,
    session.name,
  ]);

  const effectiveProcessType = isHabiteSeMode
    ? (form.modalidadeHabiteSe === "parcial" ? "Carta de Habite-se Parcial" : "Habite-se")
    : form.tipo;

  const standardProcessTypes = useMemo(
    () => processTypeCatalog.filter((type) => !isOccupancyPermitProcessType(type)),
    [],
  );

  const checklistTemplate = useMemo(
    () => getChecklistTemplate(effectiveProcessType, effectiveScopeId),
    [effectiveProcessType, effectiveScopeId],
  );

  const documentItems = useMemo<UploadDocumentItem[]>(
    () =>
      checklistTemplate?.items.map((item) => ({
        label: item.label,
        required: item.required,
        ...describeDocument(item.label),
      })) ?? [
        { label: "RG e CPF ou CNH do Proprietário", required: true, ...describeDocument("RG e CPF ou CNH do Proprietário") },
        { label: "RG e CPF ou CNH do Responsável Técnico", required: true, ...describeDocument("RG e CPF ou CNH do Responsável Técnico") },
        { label: "IPTU", required: true, ...describeDocument("IPTU") },
        { label: "Matrícula do Imóvel", required: true, ...describeDocument("Matrícula do Imóvel") },
        { label: "Procuração, quando houver", required: false, ...describeDocument("Procuração, quando houver") },
        { label: "ART ou RRT", required: true, ...describeDocument("ART ou RRT") },
        { label: "Projeto Arquitetônico", required: true, ...describeDocument("Projeto Arquitetônico") },
        { label: "Memorial Descritivo", required: true, ...describeDocument("Memorial Descritivo") },
        { label: "Levantamento Planialtimétrico", required: true, ...describeDocument("Levantamento Planialtimétrico") },
        {
          label: "Documentos Ambientais e Anuências Complementares",
          required: false,
          ...describeDocument("Documentos Ambientais e Anuências Complementares"),
        },
      ],
    [checklistTemplate],
  );

  const groupedDocuments = useMemo(
    () =>
      documentItems.reduce<Record<UploadDocumentItem["category"], UploadDocumentItem[]>>(
        (acc, item) => {
          acc[item.category].push(item);
          return acc;
        },
        { pessoais: [], imovel: [], tecnicos: [], complementares: [] },
      ),
    [documentItems],
  );

  const uploadedDocumentCount = useMemo(
    () => Object.values(files).reduce((sum, current) => sum + current.length, 0),
    [files],
  );

  const requiredDocuments = useMemo(
    () => documentItems.filter((item) => item.required),
    [documentItems],
  );

  const missingRequired = useMemo(
    () =>
      requiredDocuments.filter(
        (item) => getFilesForDocumentLabel(files, item.label).length === 0,
      ),
    [files, requiredDocuments],
  );

  const isExternalFlow = location.pathname.startsWith("/externo");
  const activeTab = getExternalTabByPath(location.pathname);

  const protocolSummary = useMemo(
    () =>
      isHabiteSeMode
        ? [
            { label: "Pré-protocolo", value: draftNumber },
            { label: "Serviço", value: effectiveProcessType },
            { label: "Processo de aprovação", value: form.processoAprovacao || "Não informado" },
            { label: "Alvará de origem", value: form.numeroAlvara || "Não informado" },
            { label: "Responsável técnico", value: form.profissional || "Não preenchido" },
            { label: "Proprietário", value: form.proprietario || "Não preenchido" },
            { label: "Imóvel", value: form.endereco || "Não preenchido" },
          ]
        : [
            { label: "Pré-protocolo", value: draftNumber },
            { label: "Projeto", value: form.titulo || "Não preenchido" },
            { label: "Tipo de processo", value: form.tipo || "Não preenchido" },
            { label: "Natureza da obra", value: form.tipoObra || "Não preenchido" },
            { label: "Tipo da edificação", value: form.tipoEdificacao || "Não preenchido" },
            { label: "Responsável técnico", value: form.profissional || "Não preenchido" },
            { label: "Proprietário", value: form.proprietario || "Não preenchido" },
            { label: "Imóvel", value: form.endereco || "Não preenchido" },
          ],
    [
      draftNumber,
      effectiveProcessType,
      form.endereco,
      form.numeroAlvara,
      form.processoAprovacao,
      form.profissional,
      form.proprietario,
      form.tipoEdificacao,
      form.tipoObra,
      form.titulo,
      form.tipo,
      isHabiteSeMode,
    ],
  );

  const statusCards = useMemo(
    () => [
      { label: "Obrigatórios enviados", value: `${requiredDocuments.length - missingRequired.length}/${requiredDocuments.length}` },
      { label: "Total anexado", value: String(uploadedDocumentCount) },
      { label: "Pendências", value: String(missingRequired.length) },
    ],
    [missingRequired.length, requiredDocuments.length, uploadedDocumentCount],
  );

  const setField = (field: keyof ProtocolDraftForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const findFilesForLabel = (label: string) =>
    getFilesForDocumentLabel(files, label);

  const linkHabiteSeSourceProcess = async (processId: string) => {
    setSourceProcessId(processId);
    setSourcePermitLabel("");
    if (!processId) return;

    const source = habiteSeSourceProcesses.find((process) => process.id === processId);
    if (!source) {
      setStatus("O processo selecionado não está disponível para este perfil.");
      return;
    }

    setSourceProcessLoading(true);
    setStatus("Conferindo o Alvará oficial do processo selecionado...");
    try {
      const permit = await getOfficialConstructionPermit(source.id);
      if (!permit || permit.status !== "emitido" || !permit.permitNumber) {
        throw new Error("Este processo ainda não possui Alvará oficial emitido e assinado.");
      }

      const permitData = permit.formData;
      setForm((current) => ({
        ...current,
        processoAprovacao: formatOfficialProcessNumber(source.protocol),
        numeroAlvara: permit.permitNumber,
        titulo: current.titulo || `Habite-se - ${source.title}`,
        endereco: permitData?.propertyAddress || source.address || current.endereco,
        iptu:
          permitData?.propertyRegistration ||
          source.property.iptu ||
          current.iptu,
        matricula:
          permitData?.propertyRegistryNumber ||
          source.property.registration ||
          current.matricula,
        lote: permitData?.lot || source.property.lot || current.lote,
        quadra: permitData?.block || source.property.block || current.quadra,
        area: permitData?.areaM2 || String(source.property.area || current.area || ""),
        uso: permitData?.usage || source.property.usage || current.uso,
        tipoEdificacao: source.property.buildingType || current.tipoEdificacao,
        tipoObra: "Conclusão da obra",
        padraoConstrutivo: "",
        proprietario: permitData?.ownerName || source.ownerName || current.proprietario,
        documento: permitData?.ownerDocument || source.ownerDocument || current.documento,
        proprietarioRg: source.ownerIdentityDocument || current.proprietarioRg,
        proprietarioTelefone: source.ownerPhone || current.proprietarioTelefone,
        proprietarioEmail: source.ownerEmail || current.proprietarioEmail,
        profissional: permitData?.technicalLead || source.technicalLead || current.profissional,
        registro: permitData?.technicalRegistration || current.registro,
      }));
      setSourcePermitLabel(`${formatOfficialProcessNumber(source.protocol)} • ${permit.permitNumber}`);
      setStatus(
        `Processo vinculado com sucesso. O Alvará ${permit.permitNumber} e os dados oficiais do imóvel foram preenchidos automaticamente.`,
      );
    } catch (error) {
      setSourceProcessId("");
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o Alvará do processo selecionado.",
      );
    } finally {
      setSourceProcessLoading(false);
    }
  };

  const persistDraft = async () => {
    if (!effectiveScopeId) {
      throw new Error("O perfil atual não está vinculado a uma Prefeitura.");
    }
    if (uploadBusyRef.current) {
      throw new Error("Aguarde o arquivo atual terminar de ser salvo antes de salvar o rascunho.");
    }

    const snapshot = filesRef.current;
    const persistedEntries = await Promise.all(
      Object.entries(snapshot).map(async ([label, items]) => {
        const persistedItems = await Promise.all(
          items.map(async (item) => {
            if (item.storagePath) return item;

            if (!item.file) {
              throw new Error(
                `O arquivo "${item.fileName}" pertence a um rascunho antigo e precisa ser selecionado uma única vez para migrar ao armazenamento permanente.`,
              );
            }

            const uploaded = await uploadFileToStorage({
              bucket: "process-documents",
              tenantId: effectiveScopeId,
              userId: session.id,
              file: item.file,
              folder: draftStorageFolder,
            });

            return {
              ...item,
              storagePath: uploaded.path,
              fileSizeBytes: item.file.size,
              // Mantém o preview local já carregado. Trocar o src pelo URL remoto
              // logo após o upload fazia imagem/iframe recarregar e o card "piscar".
              previewUrl: item.previewUrl || uploaded.publicUrl,
            };
          }),
        );

        return [label, persistedItems] as const;
      }),
    );

    const persistedFiles = Object.fromEntries(persistedEntries) as Record<string, UploadedFileItem[]>;
    const saved = saveProtocolDraft(session.id, effectiveScopeId, {
      draftNumber,
      entryMode: draftEntryMode,
      form,
      files: toStoredUploadedFiles(persistedFiles),
      updatedAt: new Date().toISOString(),
    });

    if (!saved) {
      throw new Error("Não foi possível registrar o rascunho neste navegador.");
    }

    replaceFiles(persistedFiles);
    return persistedFiles;
  };

  const handleDocumentFilesSelected = async (label: string, selected: UploadedFileItem[]) => {
    const currentFiles = filesRef.current;
    const previous = getFilesForDocumentLabel(currentFiles, label);

    // Em uma abertura nova não há persistência remota imediata. A alteração é
    // síncrona e sempre parte do estado mais atual para não perder outro anexo.
    if (!isResumingDraft) {
      replaceFiles(replaceFilesForDocumentLabel(filesRef.current, label, selected));
      setStatus("");
      return;
    }

    // Um único upload por vez no rascunho evita conclusões fora de ordem
    // sobrescrevendo o estado de outro documento.
    if (uploadBusyRef.current) {
      setStatus("Aguarde o documento atual terminar de ser salvo antes de enviar outro arquivo.");
      return;
    }

    uploadBusyRef.current = true;
    setUploadingLabels((current) => ({ ...current, [label]: true }));
    const newlyUploadedPaths: string[] = [];

    // Na substituição mostramos o arquivo novo imediatamente, mas mantemos o
    // preview local e a mesma geometria. Na exclusão mantemos o card antigo
    // até a confirmação para evitar sumir e reaparecer em caso de falha.
    if (selected.length > 0) {
      replaceFiles(replaceFilesForDocumentLabel(filesRef.current, label, selected));
    }

    try {
      if (!effectiveScopeId) {
        throw new Error("O perfil atual não está vinculado a uma Prefeitura.");
      }

      if (selected.length > 0) {
        setStatus(`Salvando "${selected[0].fileName}" no rascunho...`);
      } else {
        setStatus(`Removendo "${previous[0]?.fileName || label}" do rascunho...`);
      }

      const persistedSelected = await Promise.all(
        selected.map(async (item) => {
          if (item.storagePath) return item;

          if (!item.file) {
            throw new Error(`O arquivo "${item.fileName}" precisa ser selecionado novamente.`);
          }

          const uploaded = await uploadFileToStorage({
            bucket: "process-documents",
            tenantId: effectiveScopeId,
            userId: session.id,
            file: item.file,
            folder: draftStorageFolder,
          });
          newlyUploadedPaths.push(uploaded.path);

          return {
            ...item,
            storagePath: uploaded.path,
            fileSizeBytes: item.file.size,
            // Não troca o preview já renderizado por outro URL durante a
            // persistência: isso eliminou reload visual e mudança de altura.
            previewUrl: item.previewUrl || uploaded.publicUrl,
          };
        }),
      );

      // Sempre mescla com o estado mais recente. Nunca usa a closure antiga de
      // "files", que podia apagar um upload concluído em outro card.
      const persistedFiles = replaceFilesForDocumentLabel(
        filesRef.current,
        label,
        persistedSelected,
      );
      const saved = remotePreProtocolNumber
        ? true
        : saveProtocolDraft(session.id, effectiveScopeId, {
            draftNumber,
            entryMode: draftEntryMode,
            form,
            files: toStoredUploadedFiles(persistedFiles),
            updatedAt: new Date().toISOString(),
          });

      if (!saved) {
        throw new Error("Não foi possível atualizar o rascunho neste navegador.");
      }

      const retainedPaths = new Set(
        persistedSelected.map((item) => item.storagePath).filter(Boolean) as string[],
      );
      const removedStoredFiles = previous.filter(
        (item) => item.storagePath && !retainedPaths.has(item.storagePath),
      );

      replaceFiles(persistedFiles);

      // Em um pré-protocolo remoto o banco ainda aponta para o arquivo anterior
      // até o usuário confirmar "Salvar alterações". Mantemos esse objeto no R2
      // até a gravação oficial para nunca deixar o rascunho com referência quebrada.
      if (!remotePreProtocolNumber) {
        await Promise.allSettled(
          removedStoredFiles.map((removed) =>
            deleteFileFromStorage({
              bucket: "process-documents",
              objectKey: removed.storagePath!,
            }),
          ),
        );
      }

      if (remotePreProtocolNumber) {
        setStatus(
          persistedSelected.length > 0
            ? `Documento "${persistedSelected[0].fileName}" preparado. Clique em "Salvar alterações do rascunho" para atualizar o pré-protocolo.`
            : `Documento removido da edição. Clique em "Salvar alterações do rascunho" para confirmar.`,
        );
      } else if (persistedSelected.length > 0) {
        setStatus(
          previous.length > 0
            ? `Documento substituído com sucesso por "${persistedSelected[0].fileName}". O rascunho já foi atualizado.`
            : `Documento "${persistedSelected[0].fileName}" anexado e salvo no rascunho.`,
        );
      } else {
        setStatus("Documento excluído do rascunho com sucesso.");
      }
    } catch (error) {
      // Rollback visual em uma única troca estável. O arquivo anterior não é
      // removido do R2 antes de o novo estado estar confirmado.
      replaceFiles(
        replaceFilesForDocumentLabel(filesRef.current, label, previous),
      );

      await Promise.allSettled(
        newlyUploadedPaths.map((objectKey) =>
          deleteFileFromStorage({
            bucket: "process-documents",
            objectKey,
          }),
        ),
      );

      const message =
        error instanceof Error ? error.message : "Não foi possível atualizar o documento.";
      setStatus(`Não foi possível substituir/excluir o documento: ${message}. O arquivo anterior foi mantido.`);
    } finally {
      uploadBusyRef.current = false;
      setUploadingLabels((current) => {
        const next = { ...current };
        delete next[label];
        return next;
      });
    }
  };

  const handleSaveDraft = async () => {
    if (savingDraft || submitting) return;
    if (uploadBusyRef.current) {
      setStatus("Aguarde o documento atual terminar de ser salvo antes de salvar o rascunho.");
      return;
    }

    setSavingDraft(true);
    setStatus("Salvando rascunho e preservando os documentos...");
    try {
      const persisted = await persistDraft();
      const persistedCount = Object.values(persisted).reduce(
        (total, items) => total + items.filter((item) => Boolean(item.storagePath)).length,
        0,
      );
      setStatus(
        persistedCount > 0
          ? `Rascunho salvo com sucesso. ${persistedCount} documento(s) ficaram preservados.`
          : "Rascunho salvo com sucesso.",
      );
      // Mantém o profissional no formulário após salvar. Ele decide quando
      // deseja sair ou prosseguir para a emissão da guia.
      if (!resumeDraftNumber) {
        const baseRoute = isHabiteSeMode ? "/externo/habite-se" : "/externo/protocolar";
        navigate(
          `${baseRoute}?rascunho=${encodeURIComponent(draftNumber)}`,
          { replace: true },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar o rascunho completo.";
      saveProtocolDraft(session.id, effectiveScopeId, {
        draftNumber,
        entryMode: draftEntryMode,
        form,
        files: toStoredUploadedFiles(filesRef.current),
        updatedAt: new Date().toISOString(),
      });
      setStatus(`O rascunho dos dados foi mantido, mas os documentos ainda não ficaram preservados: ${message}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const remoteDraftAction = remotePreProtocolNumber
      ? remoteDraftActionRef.current
      : "payment";

    if (uploadBusyRef.current) {
      setStatus(
        isHabiteSeMode
          ? "Aguarde o documento atual terminar de ser salvo antes de protocolar o Habite-se."
          : "Aguarde o documento atual terminar de ser salvo antes de protocolar o projeto.",
      );
      return;
    }

    if (
      planEntitlements.maxProcesses != null &&
      activeProcessCount >= planEntitlements.maxProcesses
    ) {
      setStatus(
        `Limite do plano atingido: ${activeProcessCount}/${planEntitlements.maxProcesses} processos ativos. Solicite upgrade antes de abrir outro protocolo.`,
      );
      return;
    }

    const pendingUploadBytes = Object.values(filesRef.current)
      .flat()
      .reduce((total, item) => total + Number(item.file?.size || 0), 0);
    if (planEntitlements.maxStorageGb != null) {
      const maxStorageBytes = planEntitlements.maxStorageGb * 1024 * 1024 * 1024;
      if (knownStorageBytes + pendingUploadBytes > maxStorageBytes) {
        setStatus(
          `O envio ultrapassa o limite de armazenamento do plano (${planEntitlements.maxStorageGb} GB). Remova arquivos ou solicite upgrade.`,
        );
        return;
      }
    }
    setStatus("");

    if (!effectiveScopeId) {
      setStatus("O perfil atual não está vinculado a uma Prefeitura.");
      return;
    }

    if (
      !remotePreProtocolNumber &&
      (
        !form.profissional.trim() ||
        !form.profissionalDocumento.trim() ||
        !form.email.trim() ||
        !form.proprietario.trim() ||
        !form.documento.trim()
      )
    ) {
      setStatus("Preencha os dados do profissional responsável e do proprietário antes de continuar.");
      return;
    }

    if (
      !remotePreProtocolNumber &&
      tenantSettings?.registroProfissionalObrigatorio &&
      !form.registro.trim()
    ) {
      setStatus("Informe o registro profissional exigido pela Prefeitura.");
      return;
    }

    if (!isHabiteSeMode && isOccupancyPermitProcessType(form.tipo)) {
      setStatus(
        "Habite-se é um protocolo independente. Use a opção Solicitar Habite-se para abrir esse serviço corretamente.",
      );
      return;
    }

    if (isHabiteSeMode && !remotePreProtocolNumber) {
      if (
        !form.processoAprovacao.trim() ||
        !form.numeroAlvara.trim() ||
        !form.endereco.trim() ||
        !form.iptu.trim() ||
        !form.matricula.trim() ||
        !(Number(String(form.area).replace(",", ".")) > 0)
      ) {
        setStatus(
          "Para o Habite-se, informe o processo de aprovação anterior, o número do Alvará, o imóvel e a área efetivamente concluída.",
        );
        return;
      }
    } else if (
      !isHabiteSeMode &&
      !remotePreProtocolNumber &&
      (!form.titulo || !form.tipo || !form.tipoObra || !form.endereco || !form.iptu || !form.matricula)
    ) {
      setStatus("Preencha os dados obrigatórios do projeto, incluindo a natureza da obra e os dados do imóvel.");
      return;
    }

    if (!remotePreProtocolNumber && missingRequired.length > 0) {
      setStatus(`Faltam documentos obrigatórios: ${missingRequired.map((item) => item.label).join(", ")}.`);
      return;
    }

    const detachedUploads = documentItems.filter((item) => {
      const selected = findFilesForLabel(item.label);
      return selected.length > 0 && selected.some((file) => !file.file && !file.storagePath);
    });

    if (session.role === "profissional_externo" && !remotePreProtocolNumber) {
      try {
        await registerRemoteExternalAccount({
          tenantId: effectiveScopeId,
          fullName: form.profissional.trim(),
          email: form.email.trim(),
          cpfCnpj: form.profissionalDocumento.trim(),
          phone: form.telefone.trim(),
          professionalType: form.tipoProfissional.trim(),
          registrationNumber: form.registro.trim(),
          companyName: form.empresaProfissional.trim(),
          title: form.tipoProfissional.trim() || session.title || "Profissional externo",
          bio: profile?.bio || "",
        });
      } catch (accessError) {
        const message =
          accessError instanceof Error
            ? accessError.message
            : "Não foi possível validar o vínculo profissional com a Prefeitura.";
        setStatus(`Não foi possível validar seu acesso para protocolar: ${message}`);
        return;
      }
    }

    if (detachedUploads.length > 0) {
      setStatus(
        `Alguns anexos pertencem a um rascunho antigo e ainda não estão no armazenamento permanente: ${detachedUploads.map((item) => item.label).join(", ")}. Selecione esses arquivos uma única vez e salve o rascunho novamente.`,
      );
      return;
    }

    let documents = documentItems.flatMap((item) =>
      findFilesForLabel(item.label).map((file) => ({
        id: `doc-${crypto.randomUUID()}`,
        label: item.label,
        required: item.required,
        uploaded: true,
        signed: normalizeLabel(item.label).includes("projeto arquitetonico"),
        version: 1,
        source: "profissional" as const,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeLabel: file.sizeLabel,
        fileSizeBytes: file.file?.size ?? file.fileSizeBytes,
        filePath: file.storagePath,
        previewUrl: file.storagePath ? undefined : file.previewUrl,
      })),
    );

    setSubmitting(true);
    const uploadedObjectKeys: string[] = [];

    let remoteSeed:
      | {
          processId: string;
          protocol: string;
          preProtocol: string;
          guideNumber: string;
          dueDate: string;
          amount: number;
          issuedAt: string;
          expiresAt: string;
        }
      | undefined;

    if (hasBackendEnv) {
      try {
        documents = await Promise.all(
          documents.map(async (document) => {
            if (document.filePath) return document;

            const originalFile = findFilesForLabel(document.label).find(
              (item) => item.fileName === document.fileName && item.file,
            )?.file;

            if (!originalFile) return document;

            const uploaded = await uploadFileToStorage({
              bucket: "process-documents",
              tenantId: effectiveScopeId,
              userId: session.id,
              file: originalFile,
              folder: draftStorageFolder,
            });

            uploadedObjectKeys.push(uploaded.path);
            return {
              ...document,
              filePath: uploaded.path,
              fileSizeBytes: originalFile.size,
              previewUrl: uploaded.publicUrl,
            };
          }),
        );

        const documentsWithoutStorage = documents.filter((document) => !document.filePath);
        if (documentsWithoutStorage.length > 0) {
          throw new Error(
            `Falha ao persistir no armazenamento: ${documentsWithoutStorage.map((document) => document.label).join(", ")}.`,
          );
        }

        const remoteProcess = await createRemoteExternalProcessV2({
          tenantId: effectiveScopeId,
          createdBy: session.id,
          title: isHabiteSeMode
            ? (form.titulo.trim() || `${effectiveProcessType} - ${form.endereco.trim()}`)
            : form.titulo,
          type: effectiveProcessType,
          address: form.endereco,
          ownerName: form.proprietario,
          ownerDocument: form.documento,
          ownerIdentityDocument: form.proprietarioRg,
          ownerPhone: form.proprietarioTelefone,
          ownerEmail: form.proprietarioEmail,
          technicalLead: form.profissional,
          professionalDocument: form.profissionalDocumento,
          professionalRegistration: form.registro,
          professionalType: form.tipoProfissional,
          professionalPhone: form.telefone,
          professionalEmail: form.email,
          professionalCompany: form.empresaProfissional,
          tags: isHabiteSeMode
            ? ["habite-se", form.modalidadeHabiteSe, form.uso || "sem classificacao", tenantSettings?.secretariaResponsavel || "urbanismo"]
            : [form.uso || "sem classificacao", tenantSettings?.secretariaResponsavel || "urbanismo"],
          notes: isHabiteSeMode
            ? [
                "PROCESSO DE HABITE-SE INDEPENDENTE",
                `Processo de aprovação de origem: ${form.processoAprovacao.trim()}`,
                `Alvará de origem: ${form.numeroAlvara.trim()}`,
                `Modalidade: ${form.modalidadeHabiteSe === "parcial" ? "Habite-se parcial" : "Habite-se integral"}`,
                form.dataConclusaoObra.trim() ? `Conclusão informada: ${form.dataConclusaoObra.trim()}` : "",
                form.observacoes.trim(),
              ].filter(Boolean).join(" | ")
            : form.observacoes,
          property: {
            registration: form.matricula,
            iptu: form.iptu,
            lot: form.lote,
            block: form.quadra,
            area: Number(form.area || 0),
            usage: form.uso,
            buildingType: form.tipoEdificacao,
            workType: isHabiteSeMode ? "Conclusão da obra" : form.tipoObra,
            constructionStandard: isHabiteSeMode ? "" : form.padraoConstrutivo,
          },
          documents,
          guidePrefix: tenantSettings?.guiaPrefixo || "DAM",
          protocolPrefix: tenantSettings?.protocoloPrefixo || "PM",
          requestedProtocolNumber: remotePreProtocolNumber || null,
          draftForm: form as unknown as Record<string, unknown>,
          remote: {
            processId: "",
            protocol: "",
            guideNumber: "",
            amount: tenantSettings?.taxaProtocolo ?? 35.24,
            dueDate: "",
          },
        });

        if (documents.length > 0 && !remoteProcess.draft_updated) {
          const syncResult = await appendProcessDocuments(
            remoteProcess.process_id,
            documents,
            session.name,
          );

          if (Number(syncResult.synced || 0) !== documents.length) {
            throw new Error(
              `O pré-protocolo foi criado, mas apenas ${syncResult.synced || 0} de ${documents.length} documento(s) foram confirmados no banco oficial.`,
            );
          }
        }

        const issuedAt =
          remoteProcess.guide_created_at ||
          (remotePreProtocolNumber
            ? undefined
            : new Date().toISOString());

        remoteSeed = {
          processId: remoteProcess.process_id,
          protocol: remoteProcess.protocol_number,
          preProtocol:
            remoteProcess.pre_protocol_number || remoteProcess.protocol_number,
          guideNumber: remoteProcess.guide_number,
          dueDate: new Date(remoteProcess.due_date).toLocaleDateString("pt-BR"),
          amount: Number(remoteProcess.amount ?? 35.24),
          issuedAt: issuedAt || "",
          expiresAt: "",
        };
      } catch (remoteError) {
        const message =
          remoteError instanceof Error
            ? remoteError.message
            : "Não foi possível gravar o pré-protocolo no banco oficial.";
        console.error("[ProtocolarProjeto] Falha na persistência remota", remoteError);

        if (uploadedObjectKeys.length > 0) {
          console.warn("[ProtocolarProjeto] Uploads preservados no R2 para recuperação segura.", {
            count: uploadedObjectKeys.length,
          });
        }

        setStatus(
          uploadedObjectKeys.length > 0
            ? `Não foi possível concluir o pré-protocolo: ${message}. Os arquivos enviados foram preservados no armazenamento e poderão ser recuperados sem novo upload.`
            : `Não foi possível concluir o pré-protocolo: ${message}`,
        );
        setSubmitting(false);
        return;
      }
    } else {
      setStatus("O banco oficial está indisponível. O pré-protocolo não foi criado para evitar divergência de dados.");
      setSubmitting(false);
      return;
    }

    if (!remoteSeed) {
      setStatus("O pré-protocolo não recebeu confirmação do banco oficial. Nenhuma guia foi emitida.");
      setSubmitting(false);
      return;
    }

    if (resumeDraftNumber) {
      clearProtocolDraft(session.id, effectiveScopeId, session.tenantId, draftNumber);
    }

    try {
      await refreshRemoteStore();
    } catch (refreshError) {
      console.warn("[ProtocolarProjeto] Pré-protocolo criado, mas a atualização imediata da tela falhou.", refreshError);
    } finally {
      setSubmitting(false);
    }

    if (remotePreProtocolNumber && remoteDraftAction === "save") {
      remoteDraftActionRef.current = "payment";
      setStatus(
        `Rascunho salvo com sucesso. A guia ${remoteSeed.guideNumber || "inicial"} permanece vinculada e você pode continuar editando ou prosseguir para o pagamento quando estiver pronto.`,
      );
      return;
    }

    remoteDraftActionRef.current = "payment";
    navigate(
      `/externo/pagamentos?preprotocolo=${encodeURIComponent(remoteSeed.preProtocol)}`,
      { replace: true },
    );
  };

  return (
    <PortalFrame
      eyebrow={isHabiteSeMode ? "Novo protocolo independente" : "Novo protocolo"}
      title={
        remotePreProtocolNumber
          ? (isHabiteSeMode ? "Editar rascunho do Habite-se" : "Editar rascunho do projeto")
          : (isHabiteSeMode ? "Solicitar Habite-se" : "Protocolar projeto")
      }
    >
      <PageShell>
        <form className="sig-page-shell space-y-5" onSubmit={handleSubmit}>
          <PageHero
            eyebrow={
              remotePreProtocolNumber
                ? "Pré-protocolo com guia pendente"
                : (isHabiteSeMode ? "Abertura de Habite-se" : "Abertura de novo protocolo")
            }
            title={
              isHabiteSeMode
                ? (remotePreProtocolNumber
                    ? "Revise o Habite-se antes do pagamento da guia inicial"
                    : "Abra o Habite-se como um novo processo, separado da aprovação do projeto")
                : (remotePreProtocolNumber
                    ? "Revise o rascunho antes do pagamento da guia inicial"
                    : "Cadastre o projeto, envie os documentos e conclua o protocolo em uma única jornada")
            }
            description={
              isHabiteSeMode
                ? (remotePreProtocolNumber
                    ? "Esta abertura ainda é um rascunho com guia pendente. Você pode corrigir dados e documentos; o número oficial do processo só será criado após a compensação."
                    : "Informe o processo de aprovação e o Alvará que deram origem à obra, anexe os documentos e gere o pré-protocolo com a guia inicial. O processo municipal e a numeração oficial só são criados após a confirmação do pagamento.")
                : (remotePreProtocolNumber
                    ? "Esta abertura continua editável enquanto a guia estiver pendente. Nenhuma sequência oficial será consumida antes do pagamento."
                    : "Preencha e confira seus dados, imóvel e documentos. O envio gera apenas o pré-protocolo e a guia inicial; o processo entra na Prefeitura somente depois da compensação do pagamento.")
            }
            icon={FilePlus2}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(-1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => navigate("/externo/controle")}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair do protocolo
                </Button>
              </div>
            }
          />

          {isExternalFlow ? (
            <InternalTabs
              items={externalTabs.map(({ value, label, helper }) => ({ value, label, helper }))}
              value={activeTab.value}
              onChange={(value) => {
                const target = externalTabs.find((tab) => tab.value === value);
                if (target) navigate(target.route);
              }}
              className="mb-2"
            />
          ) : null}

          <PageStatsRow className="xl:grid-cols-3">
            {statusCards.map((item, index) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                description={
                  index === 0
                    ? "Progresso dos obrigatórios desta abertura"
                    : index === 1
                      ? "Arquivos enviados para compor o protocolo"
                      : "Itens ainda exigidos antes da confirmação"
                }
                icon={index === 0 ? CheckCircle2 : index === 1 ? UploadCloud : AlertCircle}
                tone={index === 0 ? "emerald" : index === 1 ? "blue" : "amber"}
                valueClassName="text-xl md:text-2xl"
              />
            ))}
          </PageStatsRow>

          <SectionCard
            title="Resumo do protocolo"
            description="Visão consolidada do que será protocolado antes do envio final."
            icon={FilePlus2}
            contentClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {protocolSummary.map((item) => (
              <SoftInfoCard key={item.label} label={item.label} value={item.value} />
            ))}
          </SectionCard>

          <SectionCard
            title="Dados do profissional responsável"
            description="Confira ou preencha os seus próprios dados. Eles identificam quem está protocolando e quem responde tecnicamente pelo projeto."
            icon={UserSquare2}
            contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={form.profissional} onChange={(event) => setField("profissional", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CPF ou CNPJ *</Label>
              <Input value={form.profissionalDocumento} onChange={(event) => setField("profissionalDocumento", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo profissional</Label>
              <Input value={form.tipoProfissional} onChange={(event) => setField("tipoProfissional", event.target.value)} placeholder="Ex.: Engenheiro Civil, Arquiteto" />
            </div>
            <div className="space-y-2">
              <Label>Registro profissional{tenantSettings?.registroProfissionalObrigatorio ? " *" : ""}</Label>
              <Input value={form.registro} onChange={(event) => setField("registro", event.target.value)} placeholder="CREA, CAU ou equivalente" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(event) => setField("telefone", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail *</Label>
              <Input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label>Empresa / escritório</Label>
              <Input value={form.empresaProfissional} onChange={(event) => setField("empresaProfissional", event.target.value)} />
            </div>
          </SectionCard>

          <SectionCard
            title="Dados do proprietário"
            description="Cadastro cadastral do titular usado na conferência municipal. CPF/CNPJ identifica fiscalmente; RG/RNE é um documento de identidade separado."
            icon={UserSquare2}
            contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="space-y-2">
              <Label>Nome do proprietário *</Label>
              <Input value={form.proprietario} onChange={(event) => setField("proprietario", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CPF ou CNPJ do proprietário *</Label>
              <Input
                value={form.documento}
                onChange={(event) => setField("documento", event.target.value)}
                placeholder="CPF para pessoa física ou CNPJ para pessoa jurídica"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>RG / RNE / documento de identidade</Label>
              <Input
                value={form.proprietarioRg}
                onChange={(event) => setField("proprietarioRg", event.target.value)}
                placeholder="Ex.: RG 12.345.678-9"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone do proprietário</Label>
              <Input
                value={form.proprietarioTelefone}
                onChange={(event) => setField("proprietarioTelefone", event.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-2">
              <Label>E-mail do proprietário</Label>
              <Input
                type="email"
                value={form.proprietarioEmail}
                onChange={(event) => setField("proprietarioEmail", event.target.value)}
                placeholder="titular@exemplo.com"
              />
            </div>
          </SectionCard>

          {isHabiteSeMode ? (
            <SectionCard
              title="Vínculo com a aprovação anterior"
              description="O Habite-se nasce com protocolo próprio, mas deve apontar claramente para o processo e o Alvará que autorizaram a obra."
              icon={FileStack}
              contentClassName="space-y-5"
            >
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm leading-6 text-sky-950 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-100">
                Este pedido não continua o processo de aprovação. O sistema criará um novo protocolo de Habite-se, com checklist, análise, exigências, histórico e decisão próprios.
              </div>
              <div
                data-habite-se-source-process-picker="true"
                className="rounded-[20px] border border-sky-200 bg-[linear-gradient(135deg,#f8fcff_0%,#eef8ff_100%)] p-4 shadow-[0_10px_26px_rgba(14,116,144,0.08)] dark:border-sky-500/30 dark:bg-[linear-gradient(135deg,#10283c_0%,#0b1f31_100%)]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                      <Label className="font-bold text-slate-950 dark:text-white">
                        Puxar processo já aprovado no SIGAPRO
                      </Label>
                    </div>
                    <Select
                      value={sourceProcessId}
                      onValueChange={(value) => void linkHabiteSeSourceProcess(value)}
                      disabled={sourceProcessLoading}
                    >
                      <SelectTrigger className="h-11 bg-white dark:bg-slate-950">
                        <SelectValue placeholder={
                          habiteSeSourceProcesses.length > 0
                            ? "Selecione um processo com Alvará emitido"
                            : "Nenhum processo próprio disponível"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {habiteSeSourceProcesses.map((process) => (
                          <SelectItem key={process.id} value={process.id}>
                            {formatOfficialProcessNumber(process.protocol)} — {process.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                      Ao selecionar, o SIGAPRO confere o Alvará oficial e preenche automaticamente processo de origem, Alvará, proprietário, imóvel, área e responsável técnico.
                    </p>
                  </div>
                  <div className="flex min-h-11 min-w-[220px] items-center rounded-xl border border-sky-100 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-sky-500/20 dark:bg-slate-950 dark:text-slate-200">
                    {sourceProcessLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                        Conferindo Alvará...
                      </span>
                    ) : sourcePermitLabel ? (
                      <span className="inline-flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-emerald-600" />
                        {sourcePermitLabel}
                      </span>
                    ) : (
                      <span>Vínculo opcional, com validação oficial</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Processo de aprovação / regularização de origem *</Label>
                  <Input
                    value={form.processoAprovacao}
                    onChange={(event) => setField("processoAprovacao", event.target.value)}
                    placeholder="Ex.: Processo nº 11150/2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número do Alvará de origem *</Label>
                  <Input
                    value={form.numeroAlvara}
                    onChange={(event) => setField("numeroAlvara", event.target.value)}
                    placeholder="Informe o número do Alvará"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modalidade do pedido</Label>
                  <Select
                    value={form.modalidadeHabiteSe}
                    onValueChange={(value) =>
                      setField("modalidadeHabiteSe", value as ProtocolDraftForm["modalidadeHabiteSe"])
                    }
                  >
                    <SelectTrigger className="bg-white dark:bg-slate-950">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="integral">Habite-se integral</SelectItem>
                      <SelectItem value="parcial">Habite-se parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data de conclusão informada</Label>
                  <Input
                    type="date"
                    value={form.dataConclusaoObra}
                    onChange={(event) => setField("dataConclusaoObra", event.target.value)}
                  />
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title={isHabiteSeMode ? "Dados da edificação concluída" : "Dados do projeto e do imóvel"}
            description={isHabiteSeMode
              ? "Registre o imóvel e a área efetivamente concluída que serão objeto da análise do Habite-se."
              : "Preencha os dados essenciais para vincular o protocolo ao responsável, ao proprietário e ao imóvel."}
            icon={Landmark}
            contentClassName="space-y-5"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Título do projeto</Label>
                <Input value={form.titulo} onChange={(event) => setField("titulo", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de processo</Label>
                {isHabiteSeMode ? (
                  <>
                    <Input value={effectiveProcessType} readOnly className="bg-slate-50 font-semibold dark:bg-slate-900" />
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Tipo bloqueado para impedir que o Habite-se seja confundido com aprovação de projeto.
                    </p>
                  </>
                ) : (
                  <>
                    <Input list="sigapro-process-types" value={form.tipo} onChange={(event) => setField("tipo", event.target.value)} />
                    <datalist id="sigapro-process-types">
                      {standardProcessTypes.map((type) => (
                        <option key={type} value={type} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{isHabiteSeMode ? "Finalidade do protocolo" : "Natureza da obra *"}</Label>
                {isHabiteSeMode ? (
                  <Input value="Conclusão da obra / Habite-se" readOnly className="bg-slate-50 font-semibold dark:bg-slate-900" />
                ) : (
                  <Select value={form.tipoObra} onValueChange={(value) => setField("tipoObra", value)}>
                    <SelectTrigger className="bg-white dark:bg-slate-950">
                      <SelectValue placeholder="Selecione: construção nova, reforma, ampliação..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workTypeCatalog.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {isHabiteSeMode
                    ? "Este processo trata exclusivamente da conclusão/ocupação da obra e não reabre a aprovação do projeto."
                    : "Esta informação acompanha o processo desde o protocolo e será conferida na Análise Urbanística."}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Uso da edificação</Label>
                <Input
                  value={form.uso}
                  onChange={(event) => setField("uso", event.target.value)}
                  placeholder="Ex.: Residencial, Comercial, Industrial"
                />
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Define a finalidade de uso e continua sendo a referência do cálculo municipal.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tipo da edificação</Label>
                <Input
                  list="sigapro-building-types"
                  value={form.tipoEdificacao}
                  onChange={(event) => setField("tipoEdificacao", event.target.value)}
                  placeholder="Ex.: Casa térrea, Sobrado, Galpão"
                />
                <datalist id="sigapro-building-types">
                  {buildingTypeCatalog.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Classifica a tipologia física da edificação, separada do uso e da natureza da obra.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço do imóvel</Label>
              <Input value={form.endereco} onChange={(event) => setField("endereco", event.target.value)} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>IPTU</Label>
                <Input value={form.iptu} onChange={(event) => setField("iptu", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Matrícula</Label>
                <Input value={form.matricula} onChange={(event) => setField("matricula", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{isHabiteSeMode ? "Área concluída em m² *" : "Área em m²"}</Label>
                <Input value={form.area} onChange={(event) => setField("area", event.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Lote</Label>
                <Input value={form.lote} onChange={(event) => setField("lote", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Quadra</Label>
                <Input value={form.quadra} onChange={(event) => setField("quadra", event.target.value)} />
              </div>
              <div className="space-y-2">
                {isHabiteSeMode ? (
                  <>
                    <Label>Modalidade</Label>
                    <Input
                      value={form.modalidadeHabiteSe === "parcial" ? "Habite-se parcial" : "Habite-se integral"}
                      readOnly
                      className="bg-slate-50 font-semibold dark:bg-slate-900"
                    />
                  </>
                ) : (
                  <>
                    <Label>Padrão construtivo</Label>
                    <Input
                      list="padroes-construtivos"
                      value={form.padraoConstrutivo}
                      onChange={(event) => setField("padraoConstrutivo", event.target.value)}
                      placeholder="Médio"
                    />
                    <datalist id="padroes-construtivos">
                      <option value="luxo" />
                      <option value="primeira" />
                      <option value="medio" />
                      <option value="economico" />
                    </datalist>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações técnicas</Label>
              <Textarea rows={4} value={form.observacoes} onChange={(event) => setField("observacoes", event.target.value)} />
            </div>
          </SectionCard>

          <SectionCard
            title="Status do envio"
            description="Acompanhe obrigatórios enviados, anexos totais e pendências antes de protocolar."
            icon={ShieldCheck}
            contentClassName="space-y-4"
          >
            <div className="grid gap-3 md:grid-cols-3">
              {statusCards.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 dark:border-white/12 dark:bg-white/[0.04]">
                  <p className="sig-label">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold leading-8 text-slate-950 dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/12 dark:bg-white/[0.04]">
              <p className="sig-label">Pendências atuais</p>
              <div className="mt-3 space-y-2">
                {missingRequired.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                    Todos os documentos obrigatórios já foram anexados.
                  </div>
                ) : (
                  missingRequired.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                      {item.label}
                    </div>
                  ))
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Upload de documentos"
            description="Envie os documentos por grupo, confira o status de cada item e substitua arquivos antes da confirmação final."
            icon={UploadCloud}
            contentClassName="space-y-8"
          >
            {(Object.keys(groupedDocuments) as Array<keyof typeof groupedDocuments>).map((groupKey) => {
              const documents = groupedDocuments[groupKey];
              const meta = groupMeta[groupKey];

              return (
                <div key={groupKey} className="space-y-4">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-sky-200 bg-sky-50 text-sky-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)] dark:border-sky-400/24 dark:bg-sky-400/12 dark:text-sky-200">
                      <meta.icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-slate-950 dark:text-white">{meta.title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                        {documents.length} {documents.length === 1 ? "item vinculado" : "itens vinculados"} para esta etapa do protocolo.
                      </p>
                    </div>
                  </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {documents.map((item) => {
                      const itemFiles = getFilesForDocumentLabel(files, item.label);
                      const itemStatus =
                        itemFiles.length > 0
                          ? "enviado"
                          : item.required
                            ? "pendente"
                            : "nao_enviado";

                      return (
                        <div
                          key={item.label}
                          className="flex min-w-0 flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/12 dark:bg-white/[0.04] sm:p-5"
                        >
                          <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {itemStatus === "enviado" ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                ) : itemStatus === "pendente" ? (
                                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                                ) : (
                                  <CircleDashed className="h-4 w-4 text-slate-400 dark:text-sky-200" />
                                )}
                                <p className="min-w-0 break-words text-base font-semibold leading-6 text-slate-950 dark:text-white">{item.label}</p>
                              </div>
                              <p className="mt-2 break-words text-[15px] leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {item.required ? (
                                <span
                                  data-required-document="true"
                                  className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-800 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-200"
                                >
                                  Obrigatório
                                </span>
                              ) : null}
                              <span
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                                  itemStatus === "enviado"
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
                                    : itemStatus === "pendente"
                                      ? "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200"
                                      : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300"
                                }`}
                              >
                                {itemStatus === "enviado" ? "Enviado" : itemStatus === "pendente" ? "Pendente" : "Não enviado"}
                              </span>
                            </div>
                          </div>

                          <FileDropZone
                            title={item.label}
                            description="Arraste PDF ou uma imagem. O arquivo pode ser substituído ou removido antes do protocolo final."
                            accept=".pdf,image/*"
                            multiple={false}
                            allowPreview
                            busy={Boolean(uploadingLabels[item.label])}
                            disabled={
                              !effectiveScopeId ||
                              savingDraft ||
                              submitting ||
                              (hasPendingDocumentUpload && !uploadingLabels[item.label])
                            }
                            files={itemFiles}
                            onFilesSelected={(selected) => handleDocumentFilesSelected(item.label, selected)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </SectionCard>

          {status ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              {status}
            </div>
          ) : null}

          <SectionCard
            title="Ações finais"
            description={
              remotePreProtocolNumber
                ? "Salve sem sair da tela. Quando estiver tudo conferido, use Prosseguir para pagamento para abrir a guia inicial; o número oficial continua reservado somente após a compensação."
                : "Salve o rascunho para continuar depois ou gere a abertura com a guia inicial quando tudo estiver validado."
            }
            icon={ShieldCheck}
            contentClassName="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => navigate(-1)}
                disabled={savingDraft || submitting || hasPendingDocumentUpload}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => navigate("/externo/controle")}
                disabled={savingDraft || submitting || hasPendingDocumentUpload}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair do protocolo
              </Button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              {!remotePreProtocolNumber ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void handleSaveDraft()}
                  disabled={
                    savingDraft ||
                    submitting ||
                    remoteDraftLoading ||
                    hasPendingDocumentUpload
                  }
                >
                  {savingDraft ? "Salvando rascunho..." : "Salvar rascunho"}
                </Button>
              ) : null}
              <div className="flex flex-col items-end gap-2">
                {isHabiteSeMode && missingRequired.length > 0 ? (
                  <p
                    data-habite-se-document-lock="true"
                    className="max-w-[520px] text-right text-xs font-semibold leading-5 text-amber-700 dark:text-amber-300"
                  >
                    {remotePreProtocolNumber
                      ? `Você pode salvar o rascunho agora, mas o pagamento não poderá transformar esta abertura em processo enquanto faltarem: ${missingRequired.map((item) => item.label).join(", ")}.`
                      : `O pré-protocolo só será liberado quando todos os documentos obrigatórios estiverem anexados. Pendentes: ${missingRequired.map((item) => item.label).join(", ")}.`}
                  </p>
                ) : null}
                {remotePreProtocolNumber ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="submit"
                      variant="outline"
                      className="rounded-full"
                      data-remote-draft-action="save"
                      disabled={
                        submitting ||
                        remoteDraftLoading ||
                        hasPendingDocumentUpload
                      }
                      onClick={() => {
                        remoteDraftActionRef.current = "save";
                      }}
                      title="Salva os dados e documentos sem sair desta tela."
                    >
                      {submitting && remoteDraftActionRef.current === "save"
                        ? "Salvando alterações..."
                        : "Salvar alterações"}
                    </Button>

                    <Button
                      type="submit"
                      className="rounded-full bg-slate-950 px-5 font-bold text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] hover:bg-slate-900 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300"
                      data-remote-draft-action="payment"
                      disabled={
                        submitting ||
                        remoteDraftLoading ||
                        hasPendingDocumentUpload ||
                        missingRequired.length > 0
                      }
                      onClick={() => {
                        remoteDraftActionRef.current = "payment";
                      }}
                      title={
                        missingRequired.length > 0
                          ? `Anexe todos os documentos obrigatórios antes de prosseguir para o pagamento: ${missingRequired.map((item) => item.label).join(", ")}.`
                          : "Salva a última versão do rascunho e abre a guia de pagamento."
                      }
                    >
                      {submitting && remoteDraftActionRef.current === "payment"
                        ? "Preparando pagamento..."
                        : "Prosseguir para pagamento"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="submit"
                    className="rounded-full bg-slate-950 hover:bg-slate-900 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                    data-protocol-required-documents-locked={
                      missingRequired.length > 0 ? "true" : "false"
                    }
                    disabled={
                      submitting ||
                      remoteDraftLoading ||
                      hasPendingDocumentUpload ||
                      missingRequired.length > 0
                    }
                    title={
                      missingRequired.length > 0
                        ? isHabiteSeMode
                          ? "Anexe todos os documentos obrigatórios antes de gerar o pré-protocolo do Habite-se."
                          : "Anexe todos os documentos obrigatórios antes de gerar o pré-protocolo."
                        : undefined
                    }
                  >
                    {remoteDraftLoading
                      ? "Carregando rascunho..."
                      : submitting
                        ? "Gerando pré-protocolo..."
                        : "Gerar guia e pré-protocolo"}
                  </Button>
                )}
              </div>
            </div>
          </SectionCard>
        </form>
      </PageShell>
    </PortalFrame>
  );
}
