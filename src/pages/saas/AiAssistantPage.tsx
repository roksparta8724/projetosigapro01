import { FormEvent, useMemo, useState } from "react";
import { BookOpenText, Bot, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backendClient } from "@/integrations/backend/databaseClient";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
type LegalReadiness = {
  readiness: "missing_regulations" | "missing_evidence" | "manual_review_available";
  referenceDate: string;
  activeRegulations: number;
  scopedVerifiedEvidence: number;
  resultLimits: { regulations: number; evidence: number; potentiallyTruncated: boolean };
  citedEvidence: Array<{
    title: string; page: number; metric: string; excerpt: string;
    zone: string; usage: string; from: string; until: string | null; verification: string;
  }>;
  source: string;
  automatedCompliance: false;
  cloudflareTransmission: false;
};

export function AiAssistantPage() {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState("");
  const [legalReadiness, setLegalReadiness] = useState<LegalReadiness | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou o assistente operacional SIGAPRO. Posso explicar fluxos internos e apoiar a redação de minutas. A análise urbanística de processos exige normas municipais validadas e conferência do servidor responsável.",
    },
  ]);

  const canSend = useMemo(() => draft.trim().length > 0 && !isSending, [draft, isSending]);

  const refreshLegalReadiness = async () => {
    if (legalLoading) return;
    setLegalError("");
    setLegalReadiness(null);
    setLegalLoading(true);
    try {
      const auth = backendClient?.auth;
      if (!auth?.getSession) throw new Error("Sessão institucional indisponível.");
      const current = await auth.getSession();
      if (current?.error) throw new Error("Falha ao validar sessão. Entre novamente.");
      let bearer = String(current?.data?.session?.access_token ||
        current?.data?.session?.accessToken || current?.data?.session?.token || "");
      if (!bearer && typeof auth.refreshSession === "function") {
        const refreshed = await auth.refreshSession();
        bearer = String(refreshed?.data?.session?.access_token ||
          refreshed?.data?.session?.accessToken || refreshed?.data?.session?.token || "");
      }
      if (!bearer) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch("/api/ai-legal-readiness", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Authorization: `Bearer ${bearer}` },
      });
      const payload = await response.json() as LegalReadiness & { error?: string };
      if (!response.ok || !payload.readiness) throw new Error(payload.error || "Base legal indisponível.");
      setLegalReadiness(payload);
    } catch (err) {
      setLegalError(err instanceof Error ? err.message : "Não foi possível consultar o acervo.");
    } finally {
      setLegalLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    const userMessage = draft.trim();
    setDraft("");
    setError("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", content: userMessage }]);

    try {
      // Session JWT must be validated by the server. Never rely on a visual profile.
      const auth=backendClient?.auth;
      if (!auth?.getSession) throw new Error("Sessão institucional indisponível. Entre novamente.");
      const sessionResult=await auth.getSession();
      if (sessionResult?.error) throw new Error("Falha ao validar sua sessão. Entre novamente.");
      let session=sessionResult?.data?.session;
      let bearer=String(session?.access_token||session?.accessToken||session?.token||"");
      if (!bearer && typeof auth.refreshSession === "function") {
        const refreshed=await auth.refreshSession();
        session=refreshed?.data?.session;
        bearer=String(session?.access_token||session?.accessToken||session?.token||"");
      }
      if (!bearer) throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        credentials:"same-origin",
        cache:"no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }].slice(-8),
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "Nao foi possivel obter resposta agora.");
      }

      setMessages((current) => [...current, { role: "assistant", content: payload.message as string }]);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Falha ao consultar assistente.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PortalFrame eyebrow="Produtividade" title="Assistente IA">
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-blue-50 p-2 text-blue-700">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Assistente operacional</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Use este canal para rascunhar comunicados, revisar exigencias e tirar duvidas sobre os fluxos internos.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-xl border border-sky-100 bg-sky-50 p-2 text-sky-800">
                <BookOpenText className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Base legal municipal</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Consulte normas vigentes e trechos previamente verificados para sua prefeitura.
                  A consulta não envia documentos ou leis ao modelo de IA.
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" className="rounded-xl border-slate-300 text-slate-900"
              disabled={legalLoading} onClick={() => void refreshLegalReadiness()}>
              {legalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                <ShieldCheck className="mr-2 h-4 w-4" />}
              Consultar acervo
            </Button>
          </div>
          {legalError ? (
            <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {legalError}
            </p>
          ) : null}
          {legalReadiness ? (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {legalReadiness.readiness === "missing_regulations"
                  ? "Nenhuma norma municipal ativa e válida encontrada para a data de referência."
                  : legalReadiness.readiness === "missing_evidence"
                    ? "Há normas ativas, mas faltam trechos de lei vigentes com verificação registrada."
                    : "Há referências municipais para consulta e revisão técnica humana."}
              </p>
              <p className="text-sm leading-6 text-slate-700">
                Normas ativas: <strong>{legalReadiness.activeRegulations}</strong> ·
                {" "}Evidências verificadas: <strong>{legalReadiness.scopedVerifiedEvidence}</strong> ·
                {" "}Data de referência: <strong>{legalReadiness.referenceDate}</strong>
                {legalReadiness.resultLimits.potentiallyTruncated ? " · Listagem possivelmente parcial" : ""}
              </p>
              {legalReadiness.citedEvidence.length > 0 ? (
                <div className="space-y-2">
                  {legalReadiness.citedEvidence.map((item, index) => (
                    <article key={item.title + "-" + item.page + "-" + index}
                      className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-950">
                        {item.title} · Página {item.page} · {item.zone} / {item.usage}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{item.excerpt}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Parâmetro: {item.metric} · Vigência desde {item.from}
                        {item.until ? " até " + item.until : ""}
                      </p>
                    </article>
                  ))}
                </div>
              ) : null}
              <p className="text-xs leading-5 text-slate-600">
                Referências para conferência humana. Não são parecer, aprovação,
                prova de geometria ou resposta gerada pela Cloudflare.
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`rounded-2xl border px-4 py-3 ${
                  message.role === "assistant"
                    ? "border-blue-100 bg-blue-50/60 text-slate-800"
                    : "border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {message.role === "assistant" ? (
                    <>
                      <Bot className="h-3.5 w-3.5" />
                      Assistente
                    </>
                  ) : (
                    "Voce"
                  )}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              </article>
            ))}
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ex.: Gere um resumo do processo SIG-2026-0148 para retorno ao requerente."
              className="h-11"
            />
            <Button type="submit" disabled={!canSend} className="h-11 rounded-xl px-4">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </section>
      </div>
    </PortalFrame>
  );
}
