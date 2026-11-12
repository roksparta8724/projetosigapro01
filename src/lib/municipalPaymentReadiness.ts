/**
 * Condições técnicas da conexão municipal. Não comprova pagamento real;
 * apenas informa quais pré-requisitos ainda impedem a arrecadação automática.
 */
export type PaymentReadinessConnection = {
  provider?: "mercado_pago" | "bank_direct" | "manual";
  environment?: "test" | "production";
  status?: "inactive" | "configured" | "active" | "error";
  credentials_configured?: boolean;
  webhook_configured?: boolean;
  last_test_status?: string | null;
} | null;

export function municipalPaymentReadiness(connection: PaymentReadinessConnection) {
  if (!connection || !connection.provider || !connection.credentials_configured && connection.provider === "mercado_pago") {
    return {
      code: "credentials_missing" as const,
      title: "Arrecadação automática não habilitada",
      detail: "Esta Prefeitura ainda não possui uma credencial de provedor pronta. Configure a conta oficial, salve, teste e ative a conexão.",
    };
  }
  if (connection.provider === "bank_direct") {
    return {
      code: "bank_adapter_pending" as const,
      title: "Convênio bancário ainda não homologado",
      detail: "Cadastrar o banco não disponibiliza sua API de cobrança ou retorno. O convênio precisa de integração e testes oficiais próprios.",
    };
  }
  if (connection.provider === "manual") {
    return {
      code: "manual_only" as const,
      title: "Baixa municipal manual",
      detail: "Este modo exige conferência pelo Financeiro. Não é uma conciliação bancária automática.",
    };
  }
  if (connection.environment !== "production") {
    return {
      code: "test_only" as const,
      title: "Ambiente de homologação — não recebe cobranças reais",
      detail: "A conexão de teste valida a API, mas não substitui Access Token e Webhook de produção da própria Prefeitura.",
    };
  }
  if (!connection.webhook_configured) {
    return {
      code: "webhook_missing" as const,
      title: "Falta configurar o Webhook de produção",
      detail: "Cadastre a chave secreta de assinatura e a URL de notificações antes de ativar a conciliação.",
    };
  }
  if (connection.last_test_status !== "ok") {
    return {
      code: "test_pending" as const,
      title: "Teste oficial da conexão pendente",
      detail: "Execute Testar conexão. O teste de credenciais não comprova liquidação de uma guia.",
    };
  }
  if (connection.status !== "active") {
    return {
      code: "activation_pending" as const,
      title: "Conexão validada, ainda não ativada",
      detail: "Ative o provedor para a Prefeitura. As guias anteriores não devem ser quitadas retroativamente por essa ação.",
    };
  }
  return {
    code: "technical_connection_active" as const,
    title: "Conexão técnica de produção ativa",
    detail: "A conexão está configurada; só uma cobrança real confirmada pela API e seu Webhook comprova a baixa financeira.",
  };
}
