import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertMunicipalCredentialSave, assertMunicipalCredentialActivation } from "../../server/municipal-payment-credential-validation";

const saved = {provider:"mercado_pago",environment:"test",credentials_configured:true,webhook_configured:true,status:"active",last_test_status:"ok"};
describe("Municipal banking credentials - safe reusable configuration",()=>{
  it("retains blank fields only for the exact same provider and environment",()=>{
    expect(()=>assertMunicipalCredentialSave({provider:"mercado_pago",environment:"test",accessToken:"",webhookSecret:""},saved)).not.toThrow();
    expect(()=>assertMunicipalCredentialSave({provider:"mercado_pago",environment:"production",accessToken:"",webhookSecret:""},saved)).toThrow(/Access Token/);
    expect(()=>assertMunicipalCredentialSave({provider:"mercado_pago",environment:"production",accessToken:"prod-access",webhookSecret:""},saved)).toThrow(/Webhook/);
    expect(()=>assertMunicipalCredentialSave({provider:"mercado_pago",environment:"production",accessToken:"prod-access",webhookSecret:"prod-secret"},saved)).not.toThrow();
  });
  it("allows first municipality to save either test token or a fully configured production token",()=>{
    expect(()=>assertMunicipalCredentialSave({provider:"mercado_pago",environment:"test",accessToken:"test-credential",webhookSecret:""},null)).not.toThrow();
    expect(()=>assertMunicipalCredentialSave({provider:"mercado_pago",environment:"production",accessToken:"real-credential",webhookSecret:"real-webhook"},null)).not.toThrow();
  });
  it("does not accept Mercado Pago tokens for another bank/municipal system",()=>{
    expect(()=>assertMunicipalCredentialSave({provider:"bank_direct",environment:"production",accessToken:"some-token",webhookSecret:""},null)).toThrow(/conector específico/);
    expect(()=>assertMunicipalCredentialSave({provider:"manual",environment:"test",accessToken:"",webhookSecret:""},null)).not.toThrow();
    expect(()=>assertMunicipalCredentialSave({provider:"unknown",environment:"test",accessToken:"",webhookSecret:""},null)).toThrow();
  });
  it("blocks activation of an adapter not actually implemented",()=>{
    expect(()=>assertMunicipalCredentialActivation({provider:"bank_direct",status:"configured"})).toThrow(/conector bancário homologado/);
    expect(()=>assertMunicipalCredentialActivation({provider:"mercado_pago",environment:"test",credentials_configured:false,last_test_status:"ok"})).toThrow();
    expect(()=>assertMunicipalCredentialActivation({provider:"mercado_pago",environment:"production",credentials_configured:true,webhook_configured:false,last_test_status:"ok"})).toThrow(/Webhook/);
    expect(()=>assertMunicipalCredentialActivation({...saved,environment:"production",last_test_status:"ok"})).not.toThrow();
    expect(()=>assertMunicipalCredentialActivation({provider:"manual"})).not.toThrow();
  });
  it("prevents stale test/production credentials from leaking via UI shortcuts",()=>{
    const ui=readFileSync("src/components/platform/MunicipalPaymentSettings.tsx","utf8");
    const api=readFileSync("api/mercadopago.ts","utf8");
    expect(ui).toContain('data-municipal-bank-webhook-setup="true"');
    expect(ui).toContain('hasUnsavedCredentials || !connection?.credentials_configured');
    expect(ui).toContain('!connectionMatchesForm || hasUnsavedCredentials');
    expect(ui).toContain('accessToken: ""');
    expect(ui).toContain('webhookSecret: ""');
    expect(api).toContain("assertMunicipalCredentialSave({provider,environment,accessToken,webhookSecret},saved)");
    expect(api).toContain("assertMunicipalCredentialActivation(prior)");
  });
});
