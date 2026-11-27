// Public-facing errors must not reveal provider payloads, credentials, addresses or account existence.
export function authEmailErrorMessage(error: unknown): string {
 const raw = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String(error.message || "") : "";
 const message = raw.toLowerCase();
 if (/rate.limit|too many|429|quota|limite/.test(message)) return "O serviço de e-mail atingiu um limite temporário. Aguarde antes de tentar novamente.";
 if (/timeout|timed.out|network|fetch|connection|503|502|504/.test(message)) return "O serviço de autenticação está temporariamente indisponível. Tente novamente mais tarde.";
 if (/email.*failed|failed.*email|send.*email|mail.*delivery|smtp|resend|falha.*e-mail/.test(message)) return "O serviço de autenticação não confirmou o envio do e-mail. Tente novamente mais tarde ou procure o suporte do SIGAPRO.";
 return "Não foi possível concluir a solicitação de e-mail com segurança. Tente novamente mais tarde ou procure o suporte do SIGAPRO.";
}
