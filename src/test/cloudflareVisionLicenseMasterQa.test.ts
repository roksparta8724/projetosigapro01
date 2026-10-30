import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {canAuthorizeCloudflareAccount,validateCloudflareVisionLicenseRequest,LICENSE_CONFIRMATION,VISION_MODEL} from "../../server/cloudflare-vision-license";
const ui=readFileSync("src/components/platform/CloudflareVisionLicenseActivation.tsx","utf8");
const master=readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
const api=readFileSync("api/ai-assistant.ts","utf8");
const server=readFileSync("server/cloudflare-vision-license.ts","utf8");
const body={action:"urban-vision-license-accept",accepted:true,model:VISION_MODEL,confirmation:LICENSE_CONFIRMATION};
describe("Master QA Cloudflare vision model license",()=>{
  it("never accepts terms on load or from tenant admin",()=>{
    expect(canAuthorizeCloudflareAccount({is_master:true,account_status:"active",profile_id:"a"})).toBe(true);
    expect(canAuthorizeCloudflareAccount({is_master:false,account_status:"active",profile_id:"a"})).toBe(false);
    expect(canAuthorizeCloudflareAccount({is_master:true,account_status:"blocked",profile_id:"a"})).toBe(false);
    expect(validateCloudflareVisionLicenseRequest(body)).toBe(true);
    // Regressão: objetos JSON podem ter qualquer ordem de propriedades.
    expect(Object.keys(body).sort()).toEqual(["accepted","action","confirmation","model"]);
    expect(validateCloudflareVisionLicenseRequest({
      model:VISION_MODEL,confirmation:LICENSE_CONFIRMATION,
      action:"urban-vision-license-accept",accepted:true,
    })).toBe(true);
    expect(validateCloudflareVisionLicenseRequest({...body,anotherField:true})).toBe(false);
    expect(validateCloudflareVisionLicenseRequest({...body,accepted:false})).toBe(false);
    expect(validateCloudflareVisionLicenseRequest({...body,confirmation:"ok"})).toBe(false);
    expect(validateCloudflareVisionLicenseRequest({...body,model:"another-model"})).toBe(false);
  });
  it("uses account-wide authorized action with exact documented prompt",()=>{
    expect(server).toContain('body:JSON.stringify({prompt:"agree"})');
    expect(server).toContain('process.env.VERCEL_ENV!=="preview"');
    expect(server).toContain('canAuthorizeCloudflareAccount(identity)');
    expect(server).toContain('success===true');
    expect(server).not.toContain('sort().join(",")==="action,accepted,confirmation,model"');
    expect(server).not.toContain("save_urban_matrix_numeric_review_v1");
    expect(api).toContain('action==="urban-vision-license-accept"');
  });
  it("requires explicit manual checkbox, typed declaration, and confirmation dialog",()=>{
    expect(ui).toContain("window.confirm(");
    expect(ui).toContain('checked={accepted}');
    expect(ui).toContain('confirmation.trim()===LICENSE_CONFIRMATION');
    expect(ui).toContain('disabled={!canSubmit}');
    expect(ui).toContain('data-sigapro-contrast="dark"');
    expect(ui).toContain("os documentos oficiais da Meta podem estar em inglês");
    expect(master).toContain("<CloudflareVisionLicenseActivation />");
  });
});
