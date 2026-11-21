import { backendClient } from "@/integrations/backend/databaseClient";

export class MunicipalCollectionRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "MunicipalCollectionRequestError";
  }
}

export function isMunicipalCollectionAuthenticationError(error: unknown): boolean {
  return error instanceof MunicipalCollectionRequestError && [401, 403].includes(error.status);
}

/**
 * All bank, collection and provider screens must use the same authenticated
 * Neon session and same-origin API transport as the rest of the platform.
 * No credentials are cached here or ever logged.
 */
export async function municipalCollectionApiRequest<T>(
  endpoint: "collection-configuration" | "payment-connection",
  municipalityId: string,
  action: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 15000,
): Promise<T> {
  if (!municipalityId || !/^[0-9a-f-]{36}$/i.test(municipalityId)) {
    throw new MunicipalCollectionRequestError("Prefeitura não identificada. Volte à área de Administração e selecione a Prefeitura.", 400);
  }

  const auth = backendClient?.auth;
  if (!auth?.getSession) {
    throw new MunicipalCollectionRequestError("A autenticação do SIGAPRO não está disponível. Entre novamente na conta da Prefeitura.", 401);
  }

  let token = "";
  let authTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sessionResult = await Promise.race([
      auth.getSession(),
      new Promise<never>((_, reject) => {
        authTimer = setTimeout(
          () => reject(new MunicipalCollectionRequestError("A sessão demorou para responder. Confira sua conexão e tente novamente.", 408)),
          timeoutMs,
        );
      }),
    ]);
    if (sessionResult?.error) {
      throw new MunicipalCollectionRequestError("Falha ao confirmar a sessão. Saia e entre novamente com sua conta municipal.", 401);
    }
    const session = sessionResult?.data?.session;
    token = String(session?.access_token || session?.accessToken || session?.token || "");
    if (!token && typeof auth.refreshSession === "function") {
      // Neon may restore a visual session before its access JWT is refreshed.
      // Try the official auth adapter once, never use a cached profile as auth.
      try {
        const refreshed = await Promise.race([
          auth.refreshSession(),
          new Promise<never>((_, reject) => {
            if (authTimer) clearTimeout(authTimer);
            authTimer = setTimeout(() => reject(new MunicipalCollectionRequestError(
              "O Neon não conseguiu renovar a sessão. Entre novamente no SIGAPRO.", 401,
            )), timeoutMs);
          }),
        ]);
        const fresh = refreshed?.data?.session;
        token = String(fresh?.access_token || fresh?.accessToken || fresh?.token || "");
      } catch {
        // Display the explicit reauthentication error below.
      }
    }
  } catch (error) {
    if (error instanceof MunicipalCollectionRequestError) throw error;
    throw new MunicipalCollectionRequestError("Não foi possível confirmar sua sessão. Entre novamente na conta municipal.", 401);
  } finally {
    if (authTimer) clearTimeout(authTimer);
  }

  if (!token) {
    throw new MunicipalCollectionRequestError("A sessão visual não possui autenticação válida para salvar dados bancários. Saia e entre novamente no SIGAPRO.", 401);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`/api/${endpoint}`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ municipalityId, action, ...payload }),
    });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) {
      throw new MunicipalCollectionRequestError(
        String(data.error || `O servidor retornou HTTP ${response.status} ao consultar a Prefeitura.`),
        response.status,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof MunicipalCollectionRequestError) throw error;
    if (controller.signal.aborted) {
      throw new MunicipalCollectionRequestError("O servidor bancário demorou para responder. Nenhum salvamento foi confirmado; tente consultar novamente.", 408);
    }
    throw new MunicipalCollectionRequestError("Falha de comunicação com o servidor de arrecadação. Nenhum salvamento foi confirmado.", 503);
  } finally {
    clearTimeout(timeout);
  }
}
