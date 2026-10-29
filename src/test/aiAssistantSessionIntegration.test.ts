import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("Official SIGAPRO AI assistant must authenticate real Neon session",()=>{
 it("sends JWT to authorized API and limits history without embedding keys",()=>{
   const page=readFileSync("src/pages/saas/AiAssistantPage.tsx","utf8");
   expect(page).toContain("backendClient?.auth");
   expect(page).toContain("auth.getSession()");
   expect(page).toContain("Authorization: `Bearer ${bearer}`");
   expect(page).toContain(".slice(-8)");
   expect(page).not.toContain("OPENAI_API_KEY");
 });
 it("never bypasses server authorizations with local user IDs",()=>{
   const api=readFileSync("api/ai-assistant.ts","utf8");
   expect(api).toContain('get_current_profile_context');
   expect(api).toContain('readEnv("OPENAI_API_KEY")');
   expect(api).toContain("SIGAPRO_AI_NOT_CONFIGURED");
 });
});
