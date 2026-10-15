import { BadgeCheck, ExternalLink, Fingerprint, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { ElectronicSignatureRecord } from "@/lib/electronicSignature";
import { electronicSignatureLevelLabel } from "@/lib/electronicSignature";
import { cn } from "@/lib/utils";

function entityLabel(entityType: string) {
  const labels: Record<string, string> = {
    professional_document_submission: "Documento apresentado pelo profissional",
    process_document_review: "Aprovação documental",
    payment_guide_issue: "Emissão de guia",
    process_dispatch: "Despacho",
    analysis_conclusion: "Conclusão da análise",
    technical_conclusion: "Conclusão técnica",
    required_process_document: "Documento administrativo obrigatório",
    superior_approval_decision: "Decisão superior",
    official_document: "Documento oficial",
  };
  return labels[entityType] || "Ato eletrônico";
}

export function ElectronicSignatureSeal({
  signature,
  compact = false,
  className,
}: {
  signature: ElectronicSignatureRecord;
  compact?: boolean;
  className?: string;
}) {
  const revoked = Boolean(signature.revokedAt);
  const verificationHref = `/verificar-assinatura?codigo=${encodeURIComponent(signature.signatureCode)}`;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[18px] border",
        revoked
          ? "border-rose-200 bg-rose-50/70"
          : "border-slate-300 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.055)]",
        className,
      )}
      aria-label="Comprovante de assinatura eletrônica"
    >
      <div className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b px-4",
        compact ? "py-3" : "py-4",
        revoked ? "border-rose-200 bg-rose-100/60" : "border-slate-200 bg-slate-50/80",
      )}>
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border",
            revoked
              ? "border-rose-200 bg-white text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}>
            {revoked ? <ShieldCheck className="h-5 w-5" /> : <BadgeCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
              Assinatura eletrônica SIGAPRO
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {entityLabel(signature.entityType)}
            </p>
          </div>
        </div>
        <span className={cn(
          "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
          revoked
            ? "border-rose-200 bg-white text-rose-800"
            : "border-emerald-200 bg-white text-emerald-800",
        )}>
          {revoked ? "Revogada" : "Válida"}
        </span>
      </div>

      <div className={cn("grid gap-4 px-4", compact ? "py-3" : "py-4 md:grid-cols-[1fr_auto]")}>
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{signature.signerName}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {[
              signature.signerTitle || signature.signerProfileLabel,
              signature.departmentCode
                ? `${signature.departmentCode}${signature.departmentName ? ` — ${signature.departmentName}` : ""}`
                : signature.departmentName,
            ].filter(Boolean).join(" • ") || "Identidade autenticada no SIGAPRO"}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Assinado em {signature.signedAt ? new Date(signature.signedAt).toLocaleString("pt-BR") : "data não informada"}
            {" • "}
            {electronicSignatureLevelLabel(signature.assuranceLevel)}
          </p>
        </div>

        {!compact ? (
          <div className="min-w-[220px] rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-500">
              Código de verificação
            </p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-950">
              {signature.signatureCode}
            </p>
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className="grid gap-3 border-t border-slate-200 bg-slate-50/55 px-4 py-3 md:grid-cols-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-500">
              <Fingerprint className="h-3.5 w-3.5" />
              SHA-256 do conteúdo
            </div>
            <p className="mt-1 break-all font-mono text-[10px] leading-5 text-slate-700">
              {signature.contentSha256}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-500">
              Fingerprint da assinatura
            </p>
            <p className="mt-1 break-all font-mono text-[10px] leading-5 text-slate-700">
              {signature.signatureFingerprint}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-5 text-slate-500">
          Verifique a autenticidade usando o código acima. Nenhuma senha ou documento pessoal é exibido na consulta pública.
        </p>
        <Link
          to={verificationHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
        >
          Verificar assinatura
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
