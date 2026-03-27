import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, FilePlus2, FileStack, Landmark, ShieldCheck, UploadCloud, UserSquare2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { PageHero } from "@/components/platform/PageHero";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { createRemoteExternalProcess, uploadFileToStorage } from "@/integrations/supabase/platform";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { getChecklistTemplate, processTypeCatalog } from "@/lib/platform";
import {
  createDraftNumber,
  defaultProtocolDraftForm,
  readProtocolDraft,
  saveProtocolDraft,
  toStoredUploadedFiles,
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

function describeDocument(label: string): Omit<UploadDocumentItem, "label" | "required"> {
  const normalized = normalizeLabel(label);

  if (normalized.includes("proprietario") || normalized.includes("responsavel tecnico")) {
    return {
      category: "pessoais",
      description: "Documento de identificacao das partes envolvidas no protocolo.",
    };
  }

  if (normalized.includes("iptu") || normalized.includes("matricula") || normalized.includes("imovel")) {
    return {
      category: "imovel",
      description: "Documento de vinculacao do projeto ao imovel e ao cadastro municipal.",
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
    description: "Documento complementar ou anuencia adicional vinculada ao processo.",
  };
}

const groupMeta = {
  pessoais: { title: "Documentos pessoais", icon: UserSquare2 },
  imovel: { title: "Documentos do imóvel", icon: Landmark },
  tecnicos: { title: "Documentos técnicos", icon: FileStack },
  complementares: { title: "Documentos complementares", icon: ShieldCheck },
} as const;

export function ProtocolarProjetoPage() {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const { scopeId, institutionSettingsCompat } = useMunicipality();
  const { createProcess, getInstitutionSettings, getUserProfile } = usePlatformData();
  const profile = getUserProfile(session.id);
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(scopeId ?? session.tenantId);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<Record<string, UploadedFileItem[]>>({});
  const [draftNumber, setDraftNumber] = useState(createDraftNumber());
  const [form, setForm] = useState<ProtocolDraftForm>({
    ...defaultProtocolDraftForm,
    profissional: profile?.fullName ?? session.name,
    registro: profile?.registrationNumber ?? "",
    telefone: profile?.phone ?? "",
    email: profile?.email ?? session.email,
  });

  useEffect(() => {
    const draft = readProtocolDraft(session.id, scopeId, session.tenantId);
    if (draft) {
      setDraftNumber(draft.draftNumber);
      setFiles(toStoredUploadedFiles(draft.files));
      setForm({
        ...defaultProtocolDraftForm,
        ...draft.form,
        profissional: draft.form.profissional || profile?.fullName || session.name,
        registro: draft.form.registro || profile?.registrationNumber || "",
        telefone: draft.form.telefone || profile?.phone || "",
        email: draft.form.email || profile?.email || session.email,
      });
      return;
    }

    setForm((current) => ({
      ...current,
      profissional: profile?.fullName ?? session.name,
      registro: profile?.registrationNumber ?? "",
      telefone: profile?.phone ?? "",
      email: profile?.email ?? session.email,
    }));
  }, [profile, scopeId, session.email, session.id, session.name, session.tenantId]);

  const checklistTemplate = useMemo(() => getChecklistTemplate(form.tipo, scopeId), [form.tipo, scopeId]);
  const documentItems = useMemo<UploadDocumentItem[]>(
    () =>
      checklistTemplate?.items.map((item) => ({
        label: item.label,
        required: item.required,
        ...describeDocument(item.label),
      })) ?? [
        { label: "RG e CPF ou CNH do Proprietário", required: true, ...describeDocument("RG e CPF ou CNH do Proprietário") },
        { label: "RG e CPF ou CNH do Responsável", required: true, ...describeDocument("RG e CPF ou CNH do Responsável") },
        { label: "IPTU", required: true, ...describeDocument("IPTU") },
        { label: "Matrícula do Imóvel", required: true, ...describeDocument("Matrícula do Imóvel") },
        { label: "Procuração, quando houver", required: false, ...describeDocument("Procuração, quando houver") },
        { label: "ART ou RRT", required: true, ...describeDocument("ART ou RRT") },
        { label: "Projeto Arquitetônico", required: true, ...describeDocument("Projeto Arquitetônico") },
        { label: "Memorial Descritivo", required: true, ...describeDocument("Memorial Descritivo") },
        { label: "Levantamento Planialtimétrico", required: true, ...describeDocument("Levantamento Planialtimétrico") },
        { label: "Documentos Ambientais e Anuências Complementares", required: false, ...describeDocument("Documentos Ambientais e Anuências Complementares") },
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

  const uploadedDocumentCount = useMemo(() => Object.values(files).reduce((sum, current) => sum + current.length, 0), [files]);
  const requiredDocuments = useMemo(() => documentItems.filter((item) => item.required), [documentItems]);
  const missingRequired = useMemo(() => requiredDocuments.filter((item) => (files[item.label]?.length ?? 0) === 0), [files, requiredDocuments]);

  const protocolSummary = useMemo(
    () => [
      { label: "Pre-protocolo", value: draftNumber },
      { label: "Projeto", value: form.titulo || "Não preenchido" },
      { label: "Tipo de processo", value: form.tipo || "Não preenchido" },
      { label: "Responsável técnico", value: form.profissional || "Não preenchido" },
      { label: "Proprietário", value: form.proprietario || "Não preenchido" },
      { label: "Imóvel", value: form.endereco || "Não preenchido" },
    ],
    [draftNumber, form.endereco, form.profissional, form.proprietario, form.titulo, form.tipo],
  );

  const statusCards = useMemo(
    () => [
      { label: "Obrigatorios enviados", value: `${requiredDocuments.length - missingRequired.length}/${requiredDocuments.length}` },
      { label: "Total anexado", value: String(uploadedDocumentCount) },
      { label: "Pendências", value: String(missingRequired.length) },
    ],
    [missingRequired.length, requiredDocuments.length, uploadedDocumentCount],
  );

  const setField = (field: keyof ProtocolDraftForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const persistDraft = () => {
    saveProtocolDraft(session.id, scopeId, {
      draftNumber,
      form,
      files: toStoredUploadedFiles(files),
      updatedAt: new Date().toISOString(),
    });
  };

  const findFilesForLabel = (label: string) =>
    Object.entries(files).find(([key]) => normalizeLabel(key) === normalizeLabel(label))?.[1] ?? [];

  const handleSaveDraft = () => {
    persistDraft();
    setStatus("Rascunho salvo com sucesso. Os dados do protocolo e a lista atual de arquivos ficaram registrados.");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");

    if (!scopeId) {
      setStatus("O perfil atual não está vinculado a uma Prefeitura.");
      return;
    }

    if (!form.titulo || !form.tipo || !form.endereco || !form.iptu || !form.matricula || !form.proprietario || !form.documento) {
      setStatus("Preencha os dados obrigatorios do projeto, do imovel e do proprietario.");
      return;
    }

    if (missingRequired.length > 0) {
      setStatus(`Faltam documentos obrigatorios: ${missingRequired.map((item) => item.label).join(", ")}.`);
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
        previewUrl: file.previewUrl,
      })),
    );

    setSubmitting(true);

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
            const originalFile = findFilesForLabel(document.label).find((item) => item.fileName === document.fileName && item.file)?.file;
            if (!originalFile) return document;
            const uploaded = await uploadFileToStorage({
              bucket: "process-documents",
              tenantId: scopeId,
              userId: session.id,
              file: originalFile,
              folder: "protocolos",
            });

            return { ...document, filePath: uploaded.path, previewUrl: uploaded.publicUrl };
          }),
        );

        const remoteProcess = await createRemoteExternalProcess({
          tenantId: scopeId,
          createdBy: session.id,
          title: form.titulo,
          type: form.tipo,
          address: form.endereco,
          ownerName: form.proprietario,
          ownerDocument: form.documento,
          technicalLead: form.profissional,
          tags: [form.uso || "sem classificacao", tenantSettings?.secretariaResponsavel || "urbanismo"],
          notes: form.observacoes,
          property: {
            registration: form.matricula,
            iptu: form.iptu,
            lot: form.lote,
            block: form.quadra,
            area: Number(form.area || 0),
            usage: form.uso,
            constructionStandard: form.padraoConstrutivo,
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
        setStatus(remoteError instanceof Error ? remoteError.message : "Falha ao gravar o protocolo no Supabase. O sistema vai manter o fluxo local.");
      }
    }

    const process = createProcess({
      tenantId: scopeId,
      createdBy: session.id,
      title: form.titulo,
      type: form.tipo,
      address: form.endereco,
      ownerName: form.proprietario,
      ownerDocument: form.documento,
      technicalLead: form.profissional,
      tags: [form.uso || "sem classificacao", tenantSettings?.secretariaResponsavel || "urbanismo"],
      notes: form.observacoes,
      property: {
        registration: form.matricula,
        iptu: form.iptu,
        lot: form.lote,
        block: form.quadra,
        area: Number(form.area || 0),
        usage: form.uso,
        constructionStandard: form.padraoConstrutivo,
      },
      documents,
      remote: remoteSeed,
    });

    setSubmitting(false);
    navigate(`/processos/${process.id}?aba=financeiro`);
  };

  return (
    <PortalFrame eyebrow="Novo protocolo" title="Protocolar projeto">
      <PageShell>
      <form className="sig-page-shell" onSubmit={handleSubmit}>
        <PageHero
          eyebrow="Abertura de novo protocolo"
          title="Cadastre o projeto, envie os documentos e conclua o protocolo em uma única jornada"
          description="Os dados do profissional e da prefeitura ja entram reaproveitados. Preencha o necessario, acompanhe as pendencias e protocole quando tudo estiver validado."
          icon={FilePlus2}
          actions={
            <Button type="button" variant="outline" className="rounded-full" onClick={() => navigate("/externo")}>
              &larr; Voltar para o painel
            </Button>
          }
        />

        <PageStatsRow>
          {statusCards.map((item, index) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={item.value}
              description={index === 0 ? "Progresso dos obrigatorios desta abertura" : index === 1 ? "Arquivos enviados para compor o protocolo" : "Itens ainda exigidos antes da confirmacao"}
              icon={index === 0 ? CheckCircle2 : index === 1 ? UploadCloud : AlertCircle}
              tone={index === 0 ? "emerald" : index === 1 ? "blue" : "amber"}
              valueClassName="text-xl md:text-2xl"
            />
          ))}
        </PageStatsRow>

        <PageMainGrid>
          <PageSideContent className="xl:col-span-4">
            <SectionCard title="Resumo do protocolo" description="Visão consolidada do que será protocolado antes do envio final." icon={FilePlus2} contentClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              {protocolSummary.map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="sig-label">{item.label}</p>
                  <p className="mt-2 text-[15px] font-medium leading-6 text-slate-800">{item.value}</p>
                </div>
              ))}
            </SectionCard>

            <SectionCard
              title="Dados reaproveitados e orientacoes"
              description="Informacoes carregadas automaticamente para acelerar a abertura do protocolo."
              icon={UserSquare2}
              contentClassName="grid gap-3 text-[15px] leading-6 text-slate-600"
            >
              <div className="rounded-2xl bg-slate-50 p-4">Profissional: {form.profissional || "Não preenchido"}</div>
              <div className="rounded-2xl bg-slate-50 p-4">Registro: {form.registro || "Atualize em Meu Perfil"}</div>
              <div className="rounded-2xl bg-slate-50 p-4">Telefone: {form.telefone || "Atualize em Meu Perfil"}</div>
              <div className="rounded-2xl bg-slate-50 p-4">E-mail: {form.email || "Atualize em Meu Perfil"}</div>
              <div className="rounded-2xl bg-slate-50 p-4">Secretaria responsável: {tenantSettings?.secretariaResponsavel || "Não configurada"}</div>
              <div className="rounded-2xl bg-amber-50 p-4 text-amber-900">
                Os dados do perfil tecnico e as orientacoes da prefeitura ja entram reaproveitados para agilizar o protocolo.
              </div>
            </SectionCard>

            <SectionCard title="Status do envio" description="Acompanhe obrigatorios enviados, anexos totais e pendencias antes de protocolar." icon={ShieldCheck} contentClassName="grid gap-3 md:grid-cols-3">
              {statusCards.map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="sig-label">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold leading-8 text-slate-950">{item.value}</p>
                </div>
              ))}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-3">
                <p className="sig-label">Pendências atuais</p>
                <div className="mt-3 space-y-2">
                  {missingRequired.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Todos os documentos obrigatórios já foram anexados.
                    </div>
                  ) : (
                    missingRequired.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4" />
                        {item.label}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </SectionCard>
          </PageSideContent>

          <PageMainContent className="xl:col-span-8">
            <SectionCard
              title="Dados do projeto e do imovel"
              description="Preencha os dados essenciais para vincular o protocolo ao responsavel, ao proprietario e ao imovel."
              icon={Landmark}
              contentClassName="space-y-5"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Título do projeto</Label>
                  <Input value={form.titulo} onChange={(event) => setField("titulo", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Processo</Label>
                  <Input list="sigapro-process-types" value={form.tipo} onChange={(event) => setField("tipo", event.target.value)} />
                  <datalist id="sigapro-process-types">
                    {processTypeCatalog.map((type) => (
                      <option key={type} value={type} />
                    ))}
                  </datalist>
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
                  <Label>Área em m²</Label>
                  <Input value={form.area} onChange={(event) => setField("area", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Lote</Label>
                  <Input value={form.lote} onChange={(event) => setField("lote", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Quadra</Label>
                  <Input value={form.quadra} onChange={(event) => setField("quadra", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Uso do imóvel</Label>
                  <Input value={form.uso} onChange={(event) => setField("uso", event.target.value)} />
                </div>
                <div className="space-y-2">
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
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome do proprietário</Label>
                  <Input value={form.proprietario} onChange={(event) => setField("proprietario", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Documento do proprietário</Label>
                  <Input value={form.documento} onChange={(event) => setField("documento", event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações técnicas</Label>
                <Textarea rows={4} value={form.observacoes} onChange={(event) => setField("observacoes", event.target.value)} />
              </div>
            </SectionCard>

            <SectionCard
              title="Upload de documentos"
              description="Envie os documentos por grupo, confira o status de cada item e substitua arquivos antes da confirmação final."
              icon={UploadCloud}
              contentClassName="space-y-6"
            >
              {(Object.keys(groupedDocuments) as Array<keyof typeof groupedDocuments>).map((groupKey) => {
                const documents = groupedDocuments[groupKey];
                const meta = groupMeta[groupKey];

                return (
                  <div key={groupKey} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <meta.icon className="h-4 w-4 text-slate-700" />
                      <p className="text-lg font-semibold text-slate-950">{meta.title}</p>
                    </div>

                    {documents.map((item) => {
                      const itemStatus = (files[item.label]?.length ?? 0) > 0 ? "enviado" : item.required ? "pendente" : "nao_enviado";

                      return (
                        <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {itemStatus === "enviado" ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                ) : itemStatus === "pendente" ? (
                                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
                                    ? "bg-amber-50 text-amber-600 dark:text-amber-400"
                                    : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {itemStatus === "enviado" ? "Enviado" : itemStatus === "pendente" ? "Pendente" : "Não enviado"}
                            </span>
                          </div>

                          <FileDropZone
                            title={item.label}
                            description="Arraste PDF ou uma imagem. O arquivo pode ser substituído ou removido antes do protocolo final."
                            accept=".pdf,image/*"
                            multiple={false}
                            allowPreview
                            files={files[item.label] ?? []}
                            onFilesSelected={(selected) => setFiles((current) => ({ ...current, [item.label]: selected }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </SectionCard>
          </PageMainContent>
        </PageMainGrid>

        {status ? <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{status}</div> : null}

        <SectionCard
          title="Acoes finais"
          description="Salve o rascunho para continuar depois ou conclua o protocolo quando tudo estiver validado."
          icon={ShieldCheck}
          contentClassName="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <div className="flex flex-col gap-3 md:flex-row">
            <Button type="button" variant="outline" className="rounded-full" onClick={handleSaveDraft}>
              Salvar rascunho
            </Button>
            <Button type="submit" className="rounded-full bg-slate-950 hover:bg-slate-900" disabled={submitting}>
              {submitting ? "Protocolando projeto..." : "Protocolar projeto"}
            </Button>
          </div>
        </SectionCard>
      </form>
      </PageShell>
    </PortalFrame>
  );
}
