import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CreditCard,
  KeyRound,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { backendClient } from "@/integrations/backend/databaseClient";
import { isCollectionSuccessMessage, municipalCollectionError } from "@/lib/collectionDiagnostics";

type PaymentConnection = {
  municipality_id?: string;
  provider?: "mercado_pago" | "bank_direct" | "manual";
  environment?: "test" | "production";
  status?: "inactive" | "configured" | "active" | "error";
  credentials_configured?: boolean;
  credential_fingerprint?: string;
  webhook_configured?: boolean;
  webhook_fingerprint?: string;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  updated_at?: string | null;
  testOk?: boolean;
  boletoAvailable?: boolean;
  pixAvailable?: boolean;
};

async function authorizationHeaders() {
  try {
    const result = await backendClient?.auth?.getSession?.();
    const session = result?.data?.session ?? null;
    const token =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function paymentRequest(
  municipalityId: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const response = await fetch("/api/payment-connection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authorizationHeaders()),
    },
    body: JSON.stringify({ municipalityId, action, ...payload }),
  });

  const body = (await response.json().catch(() => ({}))) as PaymentConnection & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error || "Não foi possível concluir a configuração de pagamentos.",
    );
  }
  return body;
}

function providerLabel(provider?: PaymentConnection["provider"]) {
  if (provider === "mercado_pago") return "Mercado Pago";
  if (provider === "bank_direct") return "Banco / convênio direto";
  return "PIX / baixa manual";
}

export function MunicipalPaymentSettings({
  municipalityId,
  municipalityName,
}: {
  municipalityId: string;
  municipalityName?: string | null;
}) {
  const [connection, setConnection] = useState<PaymentConnection | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    provider: "mercado_pago" as "mercado_pago" | "bank_direct" | "manual",
    environment: "test" as "test" | "production",
    accessToken: "",
    webhookSecret: "",
  });

  const isActive = connection?.status === "active";
  const hasValidTest = connection?.last_test_status === "ok";
  const provider = connection?.provider || form.provider;

  const statusLabel = useMemo(() => {
    if (!connection) return busy === "load" ? "Carregando configuração" : "Conexão não verificada";
    if (connection.status === "active") return "Provedor ativo";
    if (connection.status === "error") return "Conexão com erro";
    if (connection.status === "configured") return "Configuração preparada";
    return "Provedor ainda não ativado";
  }, [connection, busy]);

  const load = async () => {
    if (!municipalityId) return;
    setBusy("load");
    setMessage("");
    try {
      const current = await paymentRequest(municipalityId, "get");
      setConnection(current);
      setForm((value) => ({
        ...value,
        provider: current.provider || "mercado_pago",
        environment: current.environment || "test",
        accessToken: "",
        webhookSecret: "",
      }));
    } catch (error) {
      setMessage(municipalCollectionError(error));
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    void load();
  }, [municipalityId]);

  const save = async () => {
    setBusy("save");
    setMessage("");
    try {
      const next = await paymentRequest(municipalityId, "save", form);
      setConnection(next);
      setForm((current) => ({
        ...current,
        accessToken: "",
        webhookSecret: "",
      }));
      setMessage(
        "Configuração salva com segurança. As credenciais não são devolvidas ao navegador.",
      );
    } catch (error) {
      setMessage(
        municipalCollectionError(error),
      );
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setMessage("");
    try {
      const next = await paymentRequest(municipalityId, "test");
      setConnection(next);
      setMessage(
        `Conexão validada. Boleto: ${next.boletoAvailable ? "disponível" : "não retornado"} · PIX: ${next.pixAvailable ? "disponível" : "não retornado"}.`,
      );
    } catch (error) {
      // Do not call load(): that clears the error and masks the exact reason
      // a provider test was rejected by Neon or its bank endpoint.
      setMessage(municipalCollectionError(error));
    } finally {
      setBusy("");
    }
  };

  const activate = async () => {
    setBusy("activate");
    setMessage("");
    try {
      const next = await paymentRequest(municipalityId, "activate");
      setConnection(next);
      setMessage(
        "Provedor ativado para esta Prefeitura. Novas cobranças passam a usar esta conexão.",
      );
    } catch (error) {
      setMessage(
        municipalCollectionError(error),
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="sig-collection-payment-settings space-y-5" data-collection-payment-settings="true">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div data-collection-payment-card="provider" className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Provedor financeiro da Prefeitura
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                {providerLabel(provider)}
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Cada Prefeitura contratante possui sua própria conexão. O Access
                Token e o segredo do Webhook são cifrados no servidor e nunca
                ficam disponíveis para outras Prefeituras.
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-sky-200 bg-sky-50 text-sky-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isActive ? "bg-emerald-600" : "bg-sky-600"
                }`}
              />
              {statusLabel}
            </div>
          </div>

          <div data-collection-payment-features="true" className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <CreditCard className="h-5 w-5 text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Cobrança oficial
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Linha digitável e código de barras vêm do provedor, nunca são
                fabricados pelo SIGAPRO.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Webhook className="h-5 w-5 text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Baixa automática
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                O Webhook permitirá registrar pagamento e autenticação bancária
                quando a integração de produção for ativada.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ShieldCheck className="h-5 w-5 text-slate-700" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Segredos isolados
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Tokens e chaves secretas são protegidos no backend por
                Prefeitura.
              </p>
            </div>
          </div>
        </div>

        <div data-collection-payment-card="status" className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white">
              {isActive ? (
                <BadgeCheck className="h-5 w-5 text-emerald-700" />
              ) : (
                <Landmark className="h-5 w-5 text-sky-700" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Situação da credencial
              </p>
              <p className="text-xs text-slate-500">
                {connection?.credentials_configured
                  ? connection.credential_fingerprint || "Credencial configurada"
                  : "Nenhum Access Token municipal armazenado"}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>
              Ambiente:{" "}
              {connection?.environment === "production"
                ? "Produção"
                : "Homologação / teste"}
            </p>
            <p>
              Webhook:{" "}
              {connection?.webhook_configured
                ? connection.webhook_fingerprint || "configurado"
                : "ainda não configurado"}
            </p>
            <p>
              Último teste:{" "}
              {connection?.last_tested_at
                ? new Date(connection.last_tested_at).toLocaleString("pt-BR")
                : "ainda não realizado"}
            </p>
          </div>
        </div>
      </div>

      <div data-collection-payment-card="credentials" className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Credenciais do provedor
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              Conectar a conta de arrecadação
            </h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Use as credenciais da própria Prefeitura. Em homologação podem ser
              usadas credenciais de teste; produção deve usar a conta oficial do
              município.
            </p>
          </div>
          <KeyRound className="h-5 w-5 text-slate-400" />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select
              value={form.provider}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  provider: value as typeof current.provider,
                }))
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mercado_pago">Mercado Pago</SelectItem>
                <SelectItem value="bank_direct">Banco / convênio direto</SelectItem>
                <SelectItem value="manual">PIX / baixa manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select
              value={form.environment}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  environment: value as typeof current.environment,
                }))
              }
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Homologação / teste</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.provider === "mercado_pago" ? (
            <>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.accessToken}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accessToken: event.target.value,
                    }))
                  }
                  placeholder={
                    connection?.credentials_configured
                      ? "Deixe vazio para manter o token atual"
                      : "Access Token da Prefeitura"
                  }
                />
                <p className="text-xs leading-5 text-slate-500">
                  Nunca é exibido novamente após salvar.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Chave secreta do Webhook</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.webhookSecret}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      webhookSecret: event.target.value,
                    }))
                  }
                  placeholder={
                    connection?.webhook_configured
                      ? "Deixe vazio para manter a chave atual"
                      : "Secret signature do Mercado Pago"
                  }
                />
                <p className="text-xs leading-5 text-slate-500">
                  Usada para validar notificações de pagamento no backend.
                </p>
              </div>
            </>
          ) : null}
        </div>

        {message ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              isCollectionSuccessMessage(message)
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={Boolean(busy)}
            onClick={() => void save()}
          >
            {busy === "save" ? "Salvando..." : "Salvar conexão"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={
              Boolean(busy) ||
              form.provider !== "mercado_pago" ||
              !connection?.credentials_configured
            }
            onClick={() => void test()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {busy === "test" ? "Testando..." : "Testar conexão"}
          </Button>
          <Button
            type="button"
            className="sig-collection-payment-activate rounded-full bg-slate-950 px-5 !text-white hover:bg-slate-900"
            disabled={
              Boolean(busy) ||
              (form.provider !== "manual" && !hasValidTest) ||
              isActive
            }
            onClick={() => void activate()}
          >
            {busy === "activate" ? "Ativando..." : "Ativar para a Prefeitura"}
          </Button>
        </div>
      </div>
    </div>
  );
}
