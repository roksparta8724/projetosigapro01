/**
 * Preview-only Mercado Pago signed Orders webhook.
 * Production and other previews always return 503 via the handler gate.
 */
import handleQaMpWebhook from "../server/mp-qa-webhook.js";
export default handleQaMpWebhook;
