import { describe, expect, it } from "vitest";
import { municipalPaymentReadiness } from "./municipalPaymentReadiness";

describe("SIGAPRO — prontidão bancária por prefeitura", () => {
  const activeTest = {
    provider: "mercado_pago" as const, environment: "test" as const,
    status: "active" as const, credentials_configured: true,
    webhook_configured: true, last_test_status: "ok",
  };

  it("não confunde conexão QA ativa com cobrança de produção", () => {
    expect(municipalPaymentReadiness(activeTest).code).toBe("test_only");
  });
  it("não chama produção de pronta quando não existe conexão", () => {
    expect(municipalPaymentReadiness(null).code).toBe("credentials_missing");
  });
  it("exige Webhook, teste e ativação antes da prontidão técnica", () => {
    const production = { ...activeTest, environment: "production" as const };
    expect(municipalPaymentReadiness({ ...production, webhook_configured: false }).code).toBe("webhook_missing");
    expect(municipalPaymentReadiness({ ...production, last_test_status: "error" }).code).toBe("test_pending");
    expect(municipalPaymentReadiness({ ...production, status: "configured" }).code).toBe("activation_pending");
    expect(municipalPaymentReadiness(production).code).toBe("technical_connection_active");
  });
  it("banco direto cadastrado não equivale a integração automática", () => {
    expect(municipalPaymentReadiness({ provider: "bank_direct", environment: "production", status: "active" }).code)
      .toBe("bank_adapter_pending");
  });
  it("modo manual nunca é anunciado como baixa automática", () => {
    expect(municipalPaymentReadiness({ provider: "manual", status: "active" }).code).toBe("manual_only");
  });
});
