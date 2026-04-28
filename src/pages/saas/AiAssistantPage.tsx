import { FormEvent, useMemo, useState } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function AiAssistantPage() {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Ola. Sou o assistente SIGAPRO. Posso ajudar com fluxos de protocolo, financeiro, exigencias e comunicacao com o requerente.",
    },
  ]);

  const canSend = useMemo(() => draft.trim().length > 0 && !isSending, [draft, isSending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    const userMessage = draft.trim();
    setDraft("");
    setError("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", content: userMessage }]);

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
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
