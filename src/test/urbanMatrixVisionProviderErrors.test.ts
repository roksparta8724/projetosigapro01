import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {classifyCloudflareVisionFailure} from "../../server/urban-matrix-vision";

describe("SIGAPRO OCR QA: Cloudflare failures are actionable but sanitized",()=>{
 it("explains license acceptance without auto-agreeing to legal terms",()=>{
   const result=classifyCloudflareVisionFailure(403,{errors:[{message:"Please accept Meta License and Agreement"}]});
   expect(result.code).toBe("CLOUDFLARE_VISION_LICENSE_REQUIRED");
   expect(result.error).toContain("responsável");
 });
 it("distinguishes token, access, format, missing model, quota and outage",()=>{
   expect(classifyCloudflareVisionFailure(401,null).code).toBe("CLOUDFLARE_VISION_TOKEN_REJECTED");
   expect(classifyCloudflareVisionFailure(403,null).code).toBe("CLOUDFLARE_VISION_ACCESS_DENIED");
   expect(classifyCloudflareVisionFailure(400,null).code).toBe("CLOUDFLARE_VISION_REQUEST_REJECTED");
   expect(classifyCloudflareVisionFailure(404,null).code).toBe("CLOUDFLARE_VISION_MODEL_UNAVAILABLE");
   expect(classifyCloudflareVisionFailure(429,null).httpStatus).toBe(429);
   expect(classifyCloudflareVisionFailure(502,null).code).toBe("CLOUDFLARE_VISION_PROVIDER_ERROR");
 });
 it("does not echo secrets or arbitrary upstream body to the operator",()=>{
   const token="SECRET_PRIVATE_TOKEN_VALUE";
   const result=classifyCloudflareVisionFailure(403,{errors:[{message:token}]});
   expect(JSON.stringify(result)).not.toContain(token);
   expect(readFileSync("server/urban-matrix-vision.ts","utf8")).not.toContain('"prompt":"agree"');
 });
});
