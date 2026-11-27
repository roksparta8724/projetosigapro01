import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {verifyLoginLandingAccess} from "@/lib/loginLandingAccess";
describe("Login municipal: isolamento de identidade",()=>{
 it("confere o sujeito do JWT antes de aceitar o perfil e o papel",()=>{
 const code=readFileSync("src/hooks/useAppBootstrap.tsx","utf8");
 expect(code).toContain('String(ctx?.auth_subject || "").trim() !== userId');
 expect(code).toContain("if (mismatchedSubject) throw new Error");
 expect(code).toContain("normalizeEmail(data.user.email) !== normalized");
 const manual=code.split("signIn: async (email, password) => {")[1];
 expect(manual.indexOf("await backendClient.auth.signOut()")).toBeLessThan(manual.indexOf("await backendClient.auth.signInWithPassword"));
 });
 it("administrador não depende de delegação de suporte",async()=>{
 const result=await verifyLoginLandingAccess("prefeitura_admin","12345678-1234-4123-8123-123456789012",async()=>({data:true,error:null}),async()=>{throw Error("A consulta TI não deve ser chamada para administrador");});
 expect(result).toEqual({ok:true,path:"/prefeitura/ti"});
 });
});
