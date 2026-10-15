import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, Printer, ShieldCheck, Signature, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  verifyElectronicSignature,
  type PublicSignatureVerification,
} from "@/integrations/esign/client";

function formatSignedAt(value?: string) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  });
}

export function SignatureVerificationPage() {
  const { code = "" } = useParams();
  const [result, setResult] = useState<PublicSignatureVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const canonicalUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/validar-assinatura/${encodeURIComponent(code)}`;
  }, [code]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);

    void verifyElectronicSignature(code)
      .then((data) => {
        if (!active) return;
        setResult(data);
        setFailed(!data?.valid);
      })
      .catch(() => {
        if (!active) return;
        setResult(null);
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [code]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              SIGAPRO Municipal
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Validação de assinatura eletrônica
            </h1>
          </div>
          <Button type="button" variant="outline" className="rounded-full bg-white" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir comprovante
          </Button>
        </div>

        <Card className="overflow-hidden rounded-[28px] border-slate-200 bg-white shadow-xl shadow-slate-200/50 print:rounded-none print:border-0 print:shadow-none">
          <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                  Autenticidade documental
                </p>
                <p className="mt-1 text-lg font-semibold">Comprovante eletrônico SIGAPRO</p>
              </div>
            </div>
          </div>

          <CardContent className="p-6 sm:p-8">
            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center text-center">
                <div>
                  <ShieldCheck className="mx-auto h-10 w-10 animate-pulse text-sky-700" />
                  <p className="mt-4 font-semibold">Validando assinatura...</p>
                  <p className="mt-1 text-sm text-slate-500">Conferindo o registro oficial no banco de evidências.</p>
                </div>
              </div>
            ) : failed || !result ? (
              <div className="flex min-h-[320px] items-center justify-center text-center">
                <div className="max-w-lg">
                  <XCircle className="mx-auto h-12 w-12 text-rose-600" />
                  <h2 className="mt-4 text-xl font-bold">Assinatura não localizada</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    O código informado não corresponde a um registro eletrônico válido e concluído no SIGAPRO.
                  </p>
                  <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 font-mono text-sm text-slate-700">
                    {code || "Código ausente"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
                    <div>
                      <h2 className="text-lg font-bold text-emerald-950">Assinatura eletrônica válida</h2>
                      <p className="mt-1 text-sm leading-6 text-emerald-800">
                        O código existe no registro oficial do SIGAPRO e está vinculado ao hash do documento indicado abaixo.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-4">
                    <section className="rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="h-5 w-5 text-sky-700" />
                        <h3 className="font-bold">Documento</h3>
                      </div>
                      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Título</dt>
                          <dd className="mt-1 text-sm font-semibold">{result.document?.title || "Documento"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Versão</dt>
                          <dd className="mt-1 text-sm font-semibold">{result.document?.version ?? 1}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Processo</dt>
                          <dd className="mt-1 text-sm font-semibold">{result.process?.protocol || "Não informado"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Prefeitura</dt>
                          <dd className="mt-1 text-sm font-semibold">{result.municipality?.name || "Município"}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-2xl border border-slate-200 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Hash SHA-256 do documento</p>
                      <p className="mt-2 break-all rounded-xl bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100">
                        {result.document?.hash || "Hash não informado"}
                      </p>
                    </section>
                  </div>

                  <aside className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    {canonicalUrl ? (
                      <QRCodeSVG value={canonicalUrl} size={150} level="M" includeMargin={false} />
                    ) : null}
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Código de verificação</p>
                    <p className="mt-2 break-all font-mono text-sm font-bold text-slate-950">
                      {result.verification_code}
                    </p>
                  </aside>
                </div>

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2">
                    <Signature className="h-5 w-5 text-sky-700" />
                    <h3 className="font-bold">Assinaturas registradas</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(result.signers ?? []).map((signer, index) => (
                      <div key={`${signer.name}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="font-semibold">
                          Documento assinado eletronicamente por {signer.name || "Usuário"}
                          {signer.title ? `, ${signer.title}` : ""}.
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatSignedAt(signer.signed_at)}
                          {signer.registration ? ` • Registro profissional: ${signer.registration}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Confirmação de identidade por senha de acesso • evidência vinculada ao SHA-256 do documento.
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <footer className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
                  <p>
                    Este comprovante apresenta os dados públicos mínimos de verificação. Endereço IP, agente do navegador e demais evidências técnicas permanecem protegidos no registro interno de auditoria.
                  </p>
                </footer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
