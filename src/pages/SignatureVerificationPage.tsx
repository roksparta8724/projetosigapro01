import { FormEvent, useEffect, useState } from "react";
import { BadgeCheck, Fingerprint, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { verifyRemoteElectronicSignature } from "@/integrations/backend/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type VerificationResult = {
  valid?: boolean;
  status?: string;
  signatureCode?: string;
  signatureFingerprint?: string;
  contentSha256?: string;
  entityType?: string;
  documentVersion?: number | null;
  signerName?: string;
  signerRole?: string;
  signerProfileLabel?: string;
  signerTitle?: string;
  departmentCode?: string;
  departmentName?: string;
  assuranceLevel?: string;
  signedAt?: string;
  revokedAt?: string | null;
  revocationReason?: string | null;
  protocolNumber?: string;
  municipalityName?: string;
};

export function SignatureVerificationPage() {
  const [params, setParams] = useSearchParams();
  const initialCode = params.get("codigo")?.trim() || "";
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async (value: string) => {
    const clean = value.trim().toUpperCase();
    if (!clean) {
      setStatus("Informe o código de verificação.");
      setResult(null);
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const data = await verifyRemoteElectronicSignature(clean);
      setResult(data as VerificationResult);
      setParams({ codigo: clean }, { replace: true });
    } catch (error) {
      setResult(null);
      setStatus(error instanceof Error ? error.message : "Não foi possível verificar a assinatura.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialCode) void verify(initialCode);
    // O código inicial deve ser consultado apenas na entrada direta pela URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void verify(code);
  };

  const valid = Boolean(result?.valid);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_34%,#ffffff_72%)] px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-slate-950 text-white shadow-lg">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">SIGAPRO</p>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">Verificação de assinatura eletrônica</h1>
          </div>
        </header>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.09)] sm:p-7">
          <p className="text-sm leading-6 text-slate-600">
            Digite o código presente no selo de assinatura. A consulta confirma a integridade criptográfica e a identidade funcional registrada sem expor CPF, e-mail ou outras informações privadas.
          </p>

          <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="SIG-AAAAMMDD-XXXXXXXXXXXX"
              className="h-12 rounded-2xl font-mono"
              autoComplete="off"
            />
            <Button type="submit" className="h-12 rounded-2xl bg-slate-950 px-6 !text-white" disabled={busy}>
              <Search className="mr-2 h-4 w-4" />
              {busy ? "Verificando..." : "Verificar"}
            </Button>
          </form>

          {status ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {status}
            </div>
          ) : null}

          {result ? (
            <div className={`mt-6 overflow-hidden rounded-[22px] border ${
              valid ? "border-emerald-200" : "border-rose-200"
            }`}>
              <div className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${
                valid ? "bg-emerald-50" : "bg-rose-50"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-[13px] border bg-white ${
                    valid ? "border-emerald-200 text-emerald-700" : "border-rose-200 text-rose-700"
                  }`}>
                    {valid ? <BadgeCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-semibold">{valid ? "Assinatura válida" : "Assinatura não válida"}</p>
                    <p className="mt-1 text-xs text-slate-600">{result.signatureCode || code}</p>
                  </div>
                </div>
                <span className={`rounded-full border bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] ${
                  valid ? "border-emerald-200 text-emerald-800" : "border-rose-200 text-rose-800"
                }`}>
                  {result.status === "revoked" ? "Revogada" : valid ? "Verificada" : "Não encontrada"}
                </span>
              </div>

              {result.status !== "not_found" ? (
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Assinante</p>
                    <p className="mt-1 font-semibold">{result.signerName || "Não informado"}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {[result.signerTitle || result.signerProfileLabel, result.departmentCode, result.departmentName]
                        .filter(Boolean).join(" • ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Processo</p>
                    <p className="mt-1 font-semibold">{result.protocolNumber || "Não informado"}</p>
                    <p className="mt-1 text-sm text-slate-600">{result.municipalityName || "Município não informado"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Data e hora</p>
                    <p className="mt-1 text-sm font-medium">
                      {result.signedAt ? new Date(result.signedAt).toLocaleString("pt-BR") : "Não informada"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Nível de autenticação</p>
                    <p className="mt-1 text-sm font-medium">{result.assuranceLevel || "Não informado"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
                      <Fingerprint className="h-3.5 w-3.5" />
                      SHA-256 do conteúdo
                    </div>
                    <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 text-slate-700">
                      {result.contentSha256 || "Não informado"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Fingerprint da assinatura</p>
                    <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 text-slate-700">
                      {result.signatureFingerprint || "Não informado"}
                    </p>
                  </div>
                  {result.revocationReason ? (
                    <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      Motivo da revogação: {result.revocationReason}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="p-5 text-sm text-slate-600">
                  Nenhuma assinatura foi encontrada para este código.
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
