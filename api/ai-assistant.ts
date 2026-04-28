import type { IncomingMessage, ServerResponse } from "http";

type Req = IncomingMessage & { method?: string; body?: unknown };
type Res = ServerResponse;

type ChatRole = "system" | "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AssistantRequestBody = {
  messages?: ChatMessage[];
};

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function setCors(res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: Res, status: number, body: unknown) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req): Promise<AssistantRequestBody> {
  if (req.body && typeof req.body === "object") {
    return req.body as AssistantRequestBody;
  }

  return new Promise<AssistantRequestBody>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as AssistantRequestBody) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (message) =>
        typeof message?.content === "string" &&
        ["system", "user", "assistant"].includes(message.role),
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

export default async function handler(req: Req, res: Res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Metodo nao permitido." });
    return;
  }

  try {
    const apiKey = readEnv("OPENAI_API_KEY");
    const model = readEnv("OPENAI_MODEL") || "gpt-4.1-mini";
    if (!apiKey) {
      json(res, 500, { error: "OPENAI_API_KEY nao configurada no servidor." });
      return;
    }

    const body = await readJsonBody(req);
    const messages = normalizeMessages(body.messages);
    if (messages.length === 0) {
      json(res, 400, { error: "Envie pelo menos uma mensagem valida." });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "Voce e o assistente SIGAPRO. Responda em portugues, foco em operacao publica, processos e atendimento claro.",
          },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      json(res, 502, { error: "Falha na resposta do provedor de IA.", details: errorText.slice(0, 800) });
      return;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      json(res, 502, { error: "Resposta vazia do provedor de IA." });
      return;
    }

    json(res, 200, {
      message: content,
      usage: payload.usage ?? null,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no assistente de IA.";
    json(res, 500, { error: message });
  }
}
