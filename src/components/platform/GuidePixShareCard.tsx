import { useState } from "react";
import { Check, Copy, Share2, WalletCards } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { buildGuidePixPayload } from "@/lib/paymentCollection";
import { isValidPixPayload } from "@/lib/pix";
import type { PaymentGuideEntry, TenantSettings } from "@/lib/platform";

export type GuidePixShareCardProps = {
  guide: PaymentGuideEntry;
  settings?: TenantSettings | null;
  municipalityName?: string | null;
  municipalityCity?: string | null;
};

export function getShareableGuidePix(input: GuidePixShareCardProps): string {
  const { guide } = input;
  if (guide.status === "compensada" || guide.providerEnvironment === "test" || guide.amount <= 0) return "";
  // Respect the immutable issued code first; the current municipal key is
  // used only as a compatibility fallback for an unpaid, non-frozen guide.
  const payload = buildGuidePixPayload({
    settings: input.settings,
    guide,
    municipalityName: input.municipalityName,
    municipalityCity: input.municipalityCity,
  });
  return isValidPixPayload(payload) ? payload.trim() : "";
}

export function GuidePixShareCard(props: GuidePixShareCardProps) {
  const [feedback, setFeedback] = useState("");
  const payload = getShareableGuidePix(props);
  if (!payload) return null;

  const shareText = [
    `Guia municipal ${props.guide.code}`,
    `${props.guide.label} — R$ ${props.guide.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    props.guide.dueDate ? `Vencimento: ${props.guide.dueDate}` : "",
    "PIX Copia e Cola:",
    payload,
    "Confira o nome do beneficiário no aplicativo bancário antes de pagar.",
  ].filter(Boolean).join("\n");

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setFeedback("Código PIX copiado.");
    } catch {
      setFeedback("Selecione e copie o código PIX no campo abaixo.");
    }
  };

  const sharePix = async () => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `Guia ${props.guide.code}`, text: shareText });
        setFeedback("Informações de pagamento enviadas para compartilhamento.");
      } else {
        await navigator.clipboard.writeText(shareText);
        setFeedback("Mensagem com o PIX copiada. Cole no WhatsApp do proprietário.");
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        setFeedback("Não foi possível compartilhar. Use Copiar código PIX.");
      }
    }
  };

  return (
    <section data-guide-pix-share="true" className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-500/30 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
            <WalletCards className="h-4 w-4 text-sky-700 dark:text-sky-300" />
            Pagamento via PIX — Copia e Cola
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Código desta guia para o profissional encaminhar ao proprietário. Não altera a cobrança nem confirma o pagamento.
          </p>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-900 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100">
          PIX disponível
        </span>
      </div>
      <div className="mt-4 flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-2" aria-label="QR Code PIX desta guia">
          <QRCodeSVG value={payload} size={112} level="M" marginSize={2} />
        </div>
        <div className="min-w-0 flex-1 self-stretch">
          <label htmlFor={`pix-copia-cola-${props.guide.code}`} className="block text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Código PIX Copia e Cola
          </label>
          <textarea
            id={`pix-copia-cola-${props.guide.code}`}
            data-guide-pix-payload="true"
            readOnly
            rows={3}
            value={payload}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void copyPix()}>
              <Copy className="mr-1.5 h-4 w-4" /> Copiar código PIX
            </Button>
            <Button type="button" size="sm" className="rounded-full bg-sky-700 text-white hover:bg-sky-800" onClick={() => void sharePix()}>
              <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar com proprietário
            </Button>
          </div>
          {feedback ? <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-sky-800 dark:text-sky-300"><Check className="h-3.5 w-3.5" />{feedback}</p> : null}
          <p className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">O compartilhamento envia o código PIX, não cria um link bancário nem libera acesso ao processo.</p>
        </div>
      </div>
    </section>
  );
}
