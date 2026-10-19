import { useMemo } from "react";
import { createQrCodeDataUrl } from "@/lib/qrCode";
import { cn } from "@/lib/utils";

type SignatureVerificationQrProps = {
  verificationUrl: string;
  alt: string;
  className?: string;
  compact?: boolean;
};

export function SignatureVerificationQr({
  verificationUrl,
  alt,
  className,
  compact = false,
}: SignatureVerificationQrProps) {
  const qrDataUrl = useMemo(
    () => (verificationUrl ? createQrCodeDataUrl(verificationUrl, 128) : ""),
    [verificationUrl],
  );

  if (!verificationUrl || !qrDataUrl) return null;

  return (
    <a
      href={verificationUrl}
      target="_blank"
      rel="noreferrer"
      data-premium-qr="true"
      data-signature-qr-raster="true"
      className={cn(
        "sig-sei-verification-qr group flex shrink-0 flex-col items-center rounded-[12px] border border-slate-300 bg-white p-2.5 shadow-[0_7px_18px_rgba(15,23,42,0.10)]",
        compact ? "w-[124px]" : "w-[146px]",
        className,
      )}
      aria-label={alt}
      title="Abrir verificação pública da assinatura"
    >
      <span className="sig-sei-verification-qr-frame flex items-center justify-center rounded-[4px] border border-slate-300 bg-white p-1.5">
        <img
          src={qrDataUrl}
          alt={alt}
          width={compact ? 94 : 112}
          height={compact ? 94 : 112}
          className={cn(
            "sig-sei-verification-qr-image block bg-white object-contain",
            compact ? "h-[94px] w-[94px]" : "h-[112px] w-[112px]",
          )}
          draggable={false}
          decoding="sync"
        />
      </span>
      <span className="sig-sei-verification-qr-label mt-2 text-center text-[8px] font-black uppercase tracking-[0.07em]">
        Verificar assinatura
      </span>
    </a>
  );
}
