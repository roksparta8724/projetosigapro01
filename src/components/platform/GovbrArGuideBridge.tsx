import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FilePlus2, FileText, Landmark, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import { uploadFileToStorage } from "@/integrations/r2/storage";
import type { PaymentGuideEntry, PaymentGuideKind, ProcessDocument, ProcessRecord } from "@/lib/platform";

const GOVBR_PREFIX = "Guia GOVBR/AR - ";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const guideTypes: { kind: PaymentGuideKind; label: string }[] = [
  { kind: "protocolo", label: "Taxa de protocolo" },
  { kind: "iss_obra", label: "Análise / ISSQN / Projeto" },
  { kind: "aprovacao_final", label: "Aprovação / Alvará" },
  { kind: "habite_se", label: "Habite-se" },
];

export function isGovbrArGuideDocument(doc: Pick<ProcessDocument, "uploaded" | "label" | "filePath">) {
  return !!doc.uploaded && !!doc.filePath && doc.label.startsWith(GOVBR_PREFIX);
}

export function formatGovbrArGuideLabel(reference: string, kind: PaymentGuideKind) {
  const description = guideTypes.find((item) => item.kind === kind)?.label || "Recolhimento";
  return `${GOVBR_PREFIX}${reference} | ${description}`;
}

export function hasGovbrArReference(documents: ProcessDocument[], reference: string) {
  return documents.some((doc) =>
    isGovbrArGuideDocument(doc) &&
    doc.label.slice(GOVBR_PREFIX.length).split(" | ")[0].toUpperCase() === reference.toUpperCase());
}

export async function validateGovbrArPdf(file: File) {
  if (file.size < 16 || file.size > MAX_PDF_BYTES) {
    throw new Error("A guia GOVBR/AR deve ser um PDF entre 16 bytes e 12 MB.");
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
  process: Pick<ProcessRecord, "id" | "documents">;
  municipalityId: string;
  actorId: string;
  actorName: string;
  canImport: boolean;
  existingGuides: PaymentGuideEntry[];
  onAppend: (documents: ProcessDocument[]) => Promise<{ synced: number }>;
  onNotify: (message: string) => Promise<void>;
};

export function GovbrArGuideBridge({
  process, municipalityId, actorId, actorName, canImport, existingGuides, onAppend, onNotify,
}: Props) {
  const [reference, setReference] = useState("");
  const [guideKind, setGuideKind] = useState<PaymentGuideKind>("protocolo");
  const [pdf, setPdf] = useState<File | null>(null);
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
    if (alreadyImported) {
      setStatus("Essa referência GOVBR/AR já está vinculada ao processo. Abra o PDF existente, sem importar outra cobrança.");
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
      const guideLabel = formatGovbrArGuideLabel(normalizedReference, guideKind);
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
        fileName: `GOVBR-AR-${normalizedReference.replace(/[^A-Z0-9._-]/g, "-")}.pdf`,
        filePath: uploaded.path,
        fileHash: sha256,
        mimeType: "application/pdf",
        fileSizeBytes: pdf.size,
        sizeLabel: `${(pdf.size / 1024).toFixed(1)} KB`,
      };
      const saved = await onAppend([document]);
      if (Number(saved.synced) !== 1) {
        throw new Error("O PDF foi enviado ao R2, mas a vinculação ao processo não foi confirmada no Neon.");
      }
      setPdf(null);
      setReference("");
      setVerifiedByClerk(false);
      setStatus(`Guia GOVBR/AR ${normalizedReference} armazenada no R2 e vinculada ao processo. Nenhuma nova cobrança foi emitida.`);
      try {
        await onNotify(`Guia oficial GOVBR/AR ${normalizedReference} (${guideLabel}) anexada ao processo pela equipe da Prefeitura (responsável: ${actorName}). Acesse o SIGAPRO, na área Financeiro ou Documentos, para consultar o PDF emitido pela Prefeitura.`);
        setStatus(`Guia GOVBR/AR ${normalizedReference} vinculada ao processo e comunicação registrada para o profissional no SIGAPRO. Nenhuma cobrança nova foi criada.`);
      } catch {
        setStatus(`Guia GOVBR/AR ${normalizedReference} SALVA no processo e no R2. A comunicação ao profissional não foi confirmada; use as mensagens do processo sem importar a guia novamente.`);
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
            <Landmark className="h-5 w-5 text-cyan-100" /> Receber guia oficial GOVBR/AR
          </h3>
          <p className="mt-1 text-xs leading-5 !text-sky-100">Taxas Diversas → Salvar PDF no GOVBR → Vincular ao processo → Disponibilizar no SIGAPRO.</p>
        </div>
        <span className="rounded-full border border-sky-300/50 bg-slate-950/40 px-3 py-1.5 text-xs font-bold !text-white">PDF original, sem gerar outra cobrança</span>
      </div>

      <div className="space-y-4 p-5">
        {canImport ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="govbr-ar-kind">Tipo de taxa</Label>
              <select id="govbr-ar-kind" value={guideKind} onChange={(event) => setGuideKind(event.target.value as PaymentGuideKind)} disabled={busy}
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                {guideTypes.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="govbr-ar-reference">Número da guia gerada no GOVBR/AR</Label>
              <Input id="govbr-ar-reference" className="mt-2 h-11" placeholder="Referência oficial impressa na guia" disabled={busy}
                value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="govbr-ar-pdf">Guia oficial em PDF</Label>
              <Input id="govbr-ar-pdf" className="mt-2 h-11 cursor-pointer bg-white file:mr-3 file:font-semibold dark:bg-slate-950"
                type="file" accept=".pdf,application/pdf" disabled={busy}
                onChange={(event) => { setPdf(event.target.files?.[0] ?? null); setVerifiedByClerk(false); }} />
              {pdf ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Selecionado: {pdf.name} ({(pdf.size / 1024).toFixed(1)} KB)</p> : null}
            </div>
            {existingSameKind ? (
              <p className="md:col-span-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                Atenção: o SIGAPRO já registra uma guia de {guideTypes.find((item) => item.kind === guideKind)?.label} ({existingSameKind.code}, situação: {existingSameKind.status}). Confira com a Tesouraria qual é a cobrança válida. Esta importação não cancela nem substitui uma guia existente.
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-900 md:col-span-2">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-sky-700" checked={verifiedByClerk} disabled={busy}
                onChange={(event) => setVerifiedByClerk(event.target.checked)} />
              <span>Conferi no GOVBR/AR a identificação da guia, contribuinte, valor e vencimento. O PDF será anexado como documento oficial externo, sem gerar uma cobrança SIGAPRO nem confirmar pagamento.</span>
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
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Guias GOVBR/AR recebidas neste processo</p>
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
          <p className="text-xs text-slate-600 dark:text-slate-300">Nenhuma guia GOVBR/AR importada. No programa municipal: Atendimento → Solicitações → Taxas Diversas → Guia de Recolhimento → salvar PDF.</p>
        )}
      </div>
    </section>
  );
}
