import { useMemo, useRef, useState } from "react";
import { ExternalLink, FilePlus2, FileText, Landmark, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import { uploadFileToStorage } from "@/integrations/r2/storage";
import type { PaymentGuideEntry, PaymentGuideKind, ProcessDocument, ProcessRecord } from "@/lib/platform";

const GOVBR_PREFIX = "Guia GOVBR/AR - ";
const MUNICIPAL_PREFIX = "Guia municipal oficial - ";
function collectionPrefix(supplierCode?: string) { return supplierCode === "govbr_ar" || !supplierCode ? GOVBR_PREFIX : MUNICIPAL_PREFIX; }
const MAX_PDF_BYTES = 3 * 1024 * 1024;
const guideTypes: { kind: PaymentGuideKind; label: string }[] = [
  { kind: "protocolo", label: "Protocolo inicial (Cadastro Eventual)" },
  { kind: "iss_obra", label: "ISSQN / Projeto (Cadastro Mobiliário)" },
  { kind: "aprovacao_final", label: "Aprovação / Alvará" },
  { kind: "habite_se", label: "Habite-se (Financeiro)" },
];

export type GovbrArGuideScope = "protocolo" | "financeiro";
export function availableGovbrArGuideTypes(scope: GovbrArGuideScope, supplierCode = "govbr_ar") {
  return guideTypes
    .filter((type) => scope === "protocolo" ? type.kind === "protocolo" : type.kind !== "protocolo")
    .map((type) => supplierCode === "govbr_ar" ? type : {
      ...type,
      label: type.kind === "protocolo" ? "Taxa de protocolo inicial" :
        type.kind === "iss_obra" ? "ISSQN / Projeto" :
        type.kind === "habite_se" ? "Habite-se" : "Aprovação / Alvará",
    });
}

export function isGovbrArGuideDocument(doc: Pick<ProcessDocument, "uploaded" | "label" | "filePath" | "source" | "fileHash">) {
  return !!doc.uploaded &&
    !!doc.filePath &&
    doc.source === "integracao" &&
    /^[a-f0-9]{64}$/i.test(doc.fileHash || "") &&
    (doc.label.startsWith(GOVBR_PREFIX) || doc.label.startsWith(MUNICIPAL_PREFIX));
}

export function formatGovbrArGuideLabel(reference: string, kind: PaymentGuideKind, supplierCode = "govbr_ar") {
  const description = availableGovbrArGuideTypes(kind === "protocolo" ? "protocolo" : "financeiro", supplierCode).find((item) => item.kind === kind)?.label || "Recolhimento";
  return `${collectionPrefix(supplierCode)}${reference} | ${description}`;
}

export function hasGovbrArReference(documents: ProcessDocument[], reference: string) {
  return documents.some((doc) =>
    isGovbrArGuideDocument(doc) &&
    doc.label.slice(doc.label.startsWith(GOVBR_PREFIX) ? GOVBR_PREFIX.length : MUNICIPAL_PREFIX.length).split(" | ")[0].toUpperCase() === reference.toUpperCase());
}

export async function validateGovbrArPdf(file: File) {
  if (file.size < 16 || file.size > MAX_PDF_BYTES) {
    throw new Error("A guia GOVBR/AR deve ser um PDF entre 16 bytes e 3 MB (limite seguro do envio web).");
  }
  if (!/\.pdf$/i.test(file.name)) {
    throw new Error("Selecione o PDF original gerado pelo GOVBR/AR.");
  }
  const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") {
    throw new Error("O arquivo selecionado não possui assinatura de PDF válida.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type Props = {
  process: Pick<ProcessRecord, "id" | "documents" | "protocol" | "ownerName" | "ownerDocument">;
  municipalityId: string;
  actorId: string;
  actorName: string;
  canImport: boolean;
  scope: GovbrArGuideScope;
  supplierCode: string;
  supplierName: string;
  existingGuides: PaymentGuideEntry[];
  onAppend: (document: ProcessDocument, reference: string, guideKind: PaymentGuideKind) => Promise<{ synced: number }>;
  onNotify: (message: string) => Promise<void>;
};

export function GovbrArGuideBridge({
  process, municipalityId, actorId, actorName, canImport, scope, supplierCode, supplierName, existingGuides, onAppend, onNotify,
}: Props) {
  const [reference, setReference] = useState("");
  const isGovbr = supplierCode === "govbr_ar";
  const systemName = isGovbr ? "GOVBR/AR" : (supplierName || "sistema da Prefeitura");
  const [guideKind, setGuideKind] = useState<PaymentGuideKind>(scope === "protocolo" ? "protocolo" : "iss_obra");
  const allowedKinds = availableGovbrArGuideTypes(scope, supplierCode);
  const [pdf, setPdf] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [verifiedByClerk, setVerifiedByClerk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const importedGuides = useMemo(
    () => process.documents.filter(isGovbrArGuideDocument),
    [process.documents],
  );
  const normalizedReference = reference.trim().toUpperCase();
  const existingSameKind = existingGuides.find((guide) => guide.kind === guideKind);
  const alreadyImported = hasGovbrArReference(process.documents, normalizedReference);

  const copyDataForGovbr = async () => {
    const type = allowedKinds.find((item) => item.kind === guideKind)?.label || "Recolhimento";
    const summary = [
      `Processo SIGAPRO: ${process.protocol}`,
      `Contribuinte: ${process.ownerName}`,
      `CPF/CNPJ: ${process.ownerDocument || "Consultar cadastro municipal"}`,
      `Taxa: ${type}`,
      existingSameKind ? `Valor SIGAPRO para conferência: R$ ${existingSameKind.amount.toFixed(2)}` : "Valor: conferir na legislação municipal/GOVBR",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setStatus("Dados copiados para preenchimento no GOVBR/AR. Confira os valores e documentos antes de emitir.");
    } catch {
      setStatus("O navegador não autorizou a cópia. Utilize os dados do processo para preencher o GOVBR/AR.");
    }
  };

  const viewPdf = async (document: ProcessDocument) => {
    if (!document.filePath) return;
    const target = window.open("about:blank", "_blank");
    if (!target) {
      setStatus("Permita pop-ups para visualizar o PDF oficial do GOVBR/AR.");
      return;
    }
    try {
      const signedUrl = await getSignedUrlForObjectStrict({
        bucket: "process-documents",
        objectKey: document.filePath.replace(/^r2:/, ""),
      });
      if (!signedUrl) throw new Error("Arquivo oficial indisponível no R2.");
      target.opener = null;
      target.location.replace(signedUrl);
    } catch (error) {
      target.close();
      setStatus(error instanceof Error ? error.message : "Não foi possível abrir o PDF oficial.");
    }
  };

  const importPdf = async () => {
    if (busy || !canImport) return;
    setStatus("");
    if (!/^[A-Z0-9][A-Z0-9.\/_-]{2,79}$/.test(normalizedReference)) {
      setStatus("Informe a referência real da guia GOVBR/AR (3 a 80 caracteres, sem espaços).");
      return;
    }
    if (!allowedKinds.some((item) => item.kind === guideKind)) {
      setStatus("Tipo de guia incompatível com o setor responsável.");
      return;
    }
    if (alreadyImported) {
      setStatus("Essa referência oficial já está vinculada ao processo. Abra o PDF existente, sem importar outra cobrança.");
      return;
    }
    if (!verifiedByClerk || !pdf) {
      setStatus("Selecione o PDF e confirme a conferência com a guia emitida no GOVBR/AR.");
      return;
    }
    setBusy(true);
    try {
      const sha256 = await validateGovbrArPdf(pdf);
      const duplicateHash = importedGuides.find((doc) => doc.fileHash === sha256);
      if (duplicateHash) throw new Error("Este mesmo PDF GOVBR/AR já foi anexado ao processo.");
      const uploaded = await uploadFileToStorage({
        bucket: "process-documents",
        tenantId: municipalityId,
        userId: actorId,
        file: pdf,
        folder: "govbr-ar",
      });
      if (!uploaded.path) throw new Error("O R2 não confirmou o armazenamento do PDF GOVBR/AR.");
      const guideLabel = formatGovbrArGuideLabel(normalizedReference, guideKind, supplierCode);
      const document: ProcessDocument = {
        id: `doc-${crypto.randomUUID()}`,
        label: guideLabel,
        required: false,
        uploaded: true,
        signed: false,
        reviewStatus: "pendente",
        annotations: [],
        version: 1,
        source: "integracao",
        fileName: `GUIA-MUNICIPAL-${normalizedReference.replace(/[^A-Z0-9._-]/g, "-")}.pdf`,
        filePath: uploaded.path,
        fileHash: sha256,
        mimeType: "application/pdf",
        fileSizeBytes: pdf.size,
        sizeLabel: `${(pdf.size / 1024).toFixed(1)} KB`,
      };
      const saved = await onAppend(document, normalizedReference, guideKind);
      if (Number(saved.synced) !== 1) {
        throw new Error("O PDF foi enviado ao R2, mas a vinculação ao processo não foi confirmada no Neon.");
      }
      setPdf(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      setReference("");
      setVerifiedByClerk(false);
      setStatus(`Guia oficial ${normalizedReference} armazenada no R2 e vinculada ao processo. Nenhuma nova cobrança foi emitida.`);
      try {
        await onNotify(`Guia oficial do sistema municipal ${normalizedReference} (${guideLabel}) anexada ao processo pela equipe da Prefeitura (responsável: ${actorName}). Acesse o SIGAPRO, na área Financeiro ou Documentos, para consultar o PDF emitido pela Prefeitura.`);
        setStatus(`Guia municipal ${normalizedReference} vinculada ao processo e comunicação registrada para o profissional no SIGAPRO. Nenhuma cobrança nova foi criada.`);
      } catch {
        setStatus(`Guia municipal ${normalizedReference} SALVA no processo e no R2. A comunicação ao profissional não foi confirmada; use as mensagens do processo sem importar a guia novamente.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível concluir o recebimento da guia GOVBR/AR.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-govbr-ar-bridge="true" className="overflow-hidden rounded-[24px] border border-sky-200 bg-white shadow-sm dark:border-sky-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-950 via-sky-950 to-sky-800 px-5 py-4 text-white">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-cyan-200">Integração municipal • recebimento direto</p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-extrabold !text-white">
            <Landmark className="h-5 w-5 text-cyan-100" /> Receber guia oficial — {systemName}
          </h3>
          <p className="mt-1 text-xs leading-5 !text-sky-100">
            {scope === "protocolo"
              ? (isGovbr ? "Cadastro Eventual • Protocolo inicial: emitir no GOVBR/AR e vincular o PDF." : "Protocolo inicial: emitir no sistema municipal e vincular o PDF oficial.")
              : (isGovbr ? "Financeiro • ISSQN/Projeto, Aprovação ou Habite-se no GOVBR/AR." : "Financeiro • ISSQN/Projeto, Aprovação ou Habite-se no sistema municipal.")}
          </p>
        </div>
        <span className="rounded-full border border-sky-300/50 bg-slate-950/40 px-3 py-1.5 text-xs font-bold !text-white">PDF original, sem gerar outra cobrança</span>
      </div>

      <div className="space-y-4 p-5">
        {canImport ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 md:col-span-2">
              <p className="max-w-xl text-xs leading-5 text-slate-700">{isGovbr ? "No GOVBR/AR, use Atendimento → Solicitações → Taxas Diversas." : `No ${systemName}, emita a guia na rotina oficial da Prefeitura.`} Copie os dados para evitar digitação repetida.</p>
              <Button type="button" variant="outline" className="shrink-0 border-sky-300 bg-white text-sky-950" onClick={() => void copyDataForGovbr()}>
                Copiar dados do processo
              </Button>
            </div>
            <div>
              <Label htmlFor="govbr-ar-kind">Tipo de taxa</Label>
              <select id="govbr-ar-kind" value={guideKind} onChange={(event) => setGuideKind(event.target.value as PaymentGuideKind)} disabled={busy}
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                {allowedKinds.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="govbr-ar-reference">Número oficial da guia gerada pela Prefeitura</Label>
              <Input id="govbr-ar-reference" className="mt-2 h-11" placeholder="Referência oficial impressa na guia" disabled={busy}
                value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="govbr-ar-pdf">Guia oficial em PDF</Label>
              <Input id="govbr-ar-pdf" ref={pdfInputRef} className="mt-2 h-11 cursor-pointer bg-white file:mr-3 file:font-semibold dark:bg-slate-950"
                type="file" accept=".pdf,application/pdf" disabled={busy}
                onChange={(event) => { setPdf(event.target.files?.[0] ?? null); setVerifiedByClerk(false); }} />
              {pdf ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Selecionado: {pdf.name} ({(pdf.size / 1024).toFixed(1)} KB)</p> : null}
            </div>
            {existingSameKind ? (
              <p className="md:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                Atenção: o SIGAPRO já registra uma guia de {allowedKinds.find((item) => item.kind === guideKind)?.label} ({existingSameKind.code}, situação: {existingSameKind.status}). Confira com a Tesouraria qual é a cobrança válida. Esta importação não cancela nem substitui uma guia existente.
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-900 md:col-span-2">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-sky-700" checked={verifiedByClerk} disabled={busy}
                onChange={(event) => setVerifiedByClerk(event.target.checked)} />
              <span>Conferi no sistema municipal o número oficial, o contribuinte, o valor, a data de emissão e o vencimento, além do tipo de cobrança do setor. O PDF será anexado sem gerar nova cobrança SIGAPRO nem confirmar pagamento ou compensação.</span>
            </label>
            <Button type="button" className="h-11 w-full bg-sky-800 font-bold !text-white hover:bg-sky-700 md:col-span-2"
              disabled={busy || !pdf || !normalizedReference || !verifiedByClerk || alreadyImported}
              onClick={() => void importPdf()}>
              {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
              {busy ? "Vinculando guia oficial..." : alreadyImported ? "Guia já vinculada ao processo" : "Receber PDF GOVBR/AR e comunicar ao profissional"}
            </Button>
          </div>
        ) : null}
        {status ? <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950">{status}</p> : null}

        {importedGuides.length > 0 ? (
          <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Guias oficiais recebidas neste processo</p>
            {importedGuides.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-slate-900 dark:text-white">{doc.label}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">PDF arquivado no processo • a baixa bancária continua dependente de confirmação oficial</p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => void viewPdf(doc)}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Abrir original
                </Button>
              </div>
            ))}
          </div>
        ) : !canImport ? null : (
          <p className="text-xs text-slate-600 dark:text-slate-300">{isGovbr ? "Nenhuma guia importada. GOVBR/AR: Atendimento → Solicitações → Taxas Diversas → Guia de Recolhimento → salvar PDF." : "Nenhuma guia municipal importada. Emita e salve a guia no sistema oficial antes de importar."}</p>
        )}
      </div>
    </section>
  );
}
