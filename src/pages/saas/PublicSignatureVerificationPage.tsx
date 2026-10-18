import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BadgeCheck,
  Building2,
  FileCheck2,
  Fingerprint,
  Loader2,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backendClient } from "@/integrations/backend/databaseClient";
import { normalizeSignatureVerificationCode } from "@/lib/signatureVerification";

type PublicSigner = {
  name?: string;
  title?: string;
  registration?: string | null;
  slot?: string;
  signed_at?: string;
};

type VerificationResult = {
  valid?: boolean;
  verification_code?: string;
  artifact_type?: string;
  artifact_key?: string;
  artifact_version?: number;
  artifact_hash?: string;
  completed_at?: string;
  protocol?: string;
  permit_number?: string;
  municipality_name?: string;
  signers?: PublicSigner[];
};

function artifactLabel(type?: string) {
  if (type === "construction_permit") return "Alvará de Construção";
  if (type === "urban_analysis_checklist") return "Ficha de Análise Técnica";
  if (type === "process_document") return "Documento do Processo";
  return "Documento eletrônico municipal";
}

function formatDate(value?: string) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("pt-BR");
}

function compactHash(value?: string) {
  const hash = String(value || "").trim();
  if (!hash) return "Não informado";
  if (hash.length <= 48) return hash;
  return `${hash.slice(0, 28)}…${hash.slice(-16)}`;
}

export function PublicSignatureVerificationPage() {
  const navigate = useNavigate();
  const params = useParams<{ codigo?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeCode = normalizeSignatureVerificationCode(params.codigo);
  const queryCode = normalizeSignatureVerificationCode(searchParams.get("codigo"));
  const urlCode = routeCode || queryCode;
  const [inputCode, setInputCode] = useState(urlCode);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(Boolean(urlCode));
  const [error, setError] = useState("");

  useEffect(() => {
    setInputCode(urlCode);
  }, [urlCode]);

  useEffect(() => {
    let active = true;

    if (!urlCode) {
      setResult(null);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        if (!backendClient?.rpc) {
          throw new Error("Serviço de verificação indisponível.");
        }

        const { data, error: rpcError } = await backendClient.rpc(
          "verify_process_artifact_signature_public_v1",
          { _verification_code: urlCode },
        );

        if (rpcError) throw rpcError;
        if (!active) return;
        setResult((data ?? { valid: false }) as VerificationResult);
      } catch (cause) {
        if (!active) return;
        setResult(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível consultar a assinatura eletrônica.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [urlCode]);

  const valid = Boolean(result?.valid);
  const signers = useMemo(
    () => (Array.isArray(result?.signers) ? result?.signers ?? [] : []),
    [result?.signers],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeSignatureVerificationCode(inputCode);
    if (!normalized) {
      if (routeCode) navigate("/verificar-assinatura");
      else setSearchParams({});
      return;
    }
    navigate(`/v/${encodeURIComponent(normalized)}`);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_36%,#eef2f7_100%)] px-4 py-10 text-slate-950">
      <div className="mx-auto w-full max-w-4xl">
        <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.14)]">
          <header className="bg-[linear-gradient(135deg,#06192b_0%,#0a4166_54%,#0879a8_100%)] px-6 py-7 text-white md:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-100">
                  SIGAPRO Municipal
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight">
                  Verificação de assinatura eletrônica
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                  Consulte o código impresso no documento ou leia o QR Code para confirmar a autenticidade registrada no banco oficial.
                </p>
              </div>
            </div>
          </header>

          <div className="space-y-6 p-6 md:p-8">
            <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                Código de verificação
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={inputCode}
                  onChange={(event) => setInputCode(event.target.value)}
                  placeholder="Digite o código impresso no documento"
                  className="h-11 rounded-xl bg-white font-mono uppercase"
                  autoComplete="off"
                />
                <Button type="submit" className="h-11 rounded-xl bg-slate-950 px-6 text-white hover:bg-slate-800">
                  <Search className="mr-2 h-4 w-4" />
                  Verificar
                </Button>
              </div>
            </form>

            {loading ? (
              <div className="flex min-h-48 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50">
                <div className="text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-700" />
                  <p className="mt-3 text-sm font-semibold text-sky-900">
                    Conferindo evidência no banco oficial…
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">Não foi possível concluir a consulta</p>
                    <p className="mt-1 text-sm leading-6">{error}</p>
                  </div>
                </div>
              </div>
            ) : urlCode && result && !valid ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">Código não reconhecido</p>
                    <p className="mt-1 text-sm leading-6">
                      Não existe assinatura eletrônica válida registrada com esse código.
                    </p>
                  </div>
                </div>
              </div>
            ) : valid ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-lg font-black text-emerald-950">
                        Assinatura eletrônica válida
                      </p>
                      <p className="mt-1 text-sm leading-6 text-emerald-800">
                        A evidência apresentada corresponde a um documento assinado e registrado no SIGAPRO Municipal.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2 text-slate-500">
                      <FileCheck2 className="h-4 w-4" />
                      <span className="text-[10px] font-black uppercase tracking-[0.12em]">Documento</span>
                    </div>
                    <p className="mt-2 font-bold">{artifactLabel(result?.artifact_type)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {result?.permit_number || result?.protocol || "Documento municipal"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Building2 className="h-4 w-4" />
                      <span className="text-[10px] font-black uppercase tracking-[0.12em]">Instituição</span>
                    </div>
                    <p className="mt-2 font-bold">{result?.municipality_name || "Prefeitura Municipal"}</p>
                    <p className="mt-1 text-sm text-slate-600">Processo {result?.protocol || "não informado"}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white">
                  <div className="flex items-center gap-2 text-sky-200">
                    <Fingerprint className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.12em]">Evidência criptográfica</span>
                  </div>
                  <p className="mt-3 font-mono text-sm font-bold text-emerald-300">
                    {result?.verification_code}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] leading-5 text-slate-300">
                    SHA-256: {compactHash(result?.artifact_hash)}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Registro concluído em {formatDate(result?.completed_at)} • versão {result?.artifact_version || 1}
                  </p>
                </div>

                {signers.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Assinantes registrados
                    </p>
                    <div className="mt-3 grid gap-3">
                      {signers.map((signer, index) => (
                        <div key={`${signer.slot || "assinante"}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">{signer.name || "Autoridade municipal"}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {[signer.title, signer.registration].filter(Boolean).join(" • ")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(signer.signed_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Informe um código ou leia o QR Code de um documento oficial.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
