import { createHash, createHmac } from "node:crypto";
import type { MunicipalPaymentConnection } from "./municipal-payment.js";
import { assertBankChargeAttestationReady } from "./guide-persistence.js";
import { prodDatabaseUrl } from "./mp-prod-webhook.js";

export function assertProductionMunicipalSetupRuntime(env:Record<string,string|undefined>=process.env) {
  if (env.VERCEL_ENV !== "production" || env.VERCEL_GIT_COMMIT_REF !== "main")
    throw new Error("Configure credenciais reais exclusivamente no site oficial. Na homologação utilize uma conta de teste.");
}
export function assertProductionMunicipalActivationRuntime() {
  assertProductionMunicipalSetupRuntime();
  assertBankChargeAttestationReady();
  prodDatabaseUrl();
  if (process.env.SIGAPRO_PROD_BANK_CHARGES_ENABLED !== "true")
    throw new Error("Credencial cadastrada; a plataforma ainda precisa liberar a emissão bancária real. Nenhuma cobrança foi ativada.");
}
export function municipalPaymentSetupProof(config:MunicipalPaymentConnection, municipalityId:string,
  action:"test"|"activate", ok:boolean, boleto:boolean, pix:boolean, now=Date.now()) {
  if (config.municipality_id!==municipalityId || config.provider!=="mercado_pago" ||
      !["test","production"].includes(String(config.environment)) || !config.credentials_ciphertext)
    throw new Error("A configuração bancária não corresponde à Prefeitura selecionada.");
  const sha=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");
  const environment=config.environment!;
  const credentialDigest=sha(config.credentials_ciphertext);
  const webhookDigest=sha(config.webhook_secret_ciphertext||"");
  const epoch=Math.floor(now/1000);
  const fields=["sigapro-bank-setup-v2",action,municipalityId,environment,credentialDigest,webhookDigest,
    ok?"1":"0",boleto?"1":"0",pix?"1":"0",String(epoch)];
  const mac=environment==="production"
    ? createHmac("sha256",Buffer.from(assertBankChargeAttestationReady(),"hex")).update(fields.join("\n"),"utf8").digest("hex")
    : "";
  return {_municipality_id:municipalityId,_environment:environment,_credential_digest:credentialDigest,
    _webhook_digest:webhookDigest,_ok:ok,_boleto:boleto,_pix:pix,_epoch:epoch,_mac:mac};
}
