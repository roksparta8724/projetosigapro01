import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {isGuideSettled} from "@/lib/guideOriginal";
const read=(name:string)=>readFileSync(name,"utf8");
describe("bank settlement blocks editing a remote draft during municipal officialization",()=>{
 it("recognizes paid flag and legitimate historical bank status variants",()=>{
   expect(isGuideSettled({status:"pendente",paid:true})).toBe(true);
   expect(isGuideSettled({status:"confirmed",paid:false})).toBe(true);
   expect(isGuideSettled({status:"compensada",paid:false})).toBe(true);
   expect(isGuideSettled({status:"pendente",paid:false})).toBe(false);
 });
 it("redirects a paid canonical draft before restoring any mutable fields or uploads",()=>{
   const page=read("src/pages/saas/ProtocolarProjetoPage.tsx");
   expect(page).toContain("if (isGuideSettled(remoteDraft.guide)) {");
   expect(page).toContain('navigate(isCounterProtocol ? "/prefeitura/protocolos" : "/externo/controle", { replace: true })');
   expect(page).toContain('const [remoteDraftWritable, setRemoteDraftWritable] = useState(!remotePreProtocolNumber)');
   expect(page).toContain("setRemoteDraftWritable(false)");
   expect(page).toContain("setRemoteDraftWritable(true)");
   expect(page.indexOf("if (isGuideSettled(remoteDraft.guide))")).toBeLessThan(page.indexOf("const storedForm ="));
 });
 it("fails closed on draft fetch errors, upload and submission while pending is unconfirmed",()=>{
   const page=read("src/pages/saas/ProtocolarProjetoPage.tsx");
   expect(page).toContain("if (remotePreProtocolNumber && !remoteDraftWritable) {");
   expect(page).toContain("(Boolean(remotePreProtocolNumber) && !remoteDraftWritable)");
   expect(page).toContain('remoteHydratedRef.current = "";\n          setRemoteDraftWritable(false)');
   expect(page).toContain("!remoteDraftWritable ||");
 });
 it("does not offer paid preprotocols an edit link via the payments ledger",()=>{
   const page=read("src/pages/saas/ExternalPaymentsPage.tsx");
   expect(page).toContain('status === "compensada" ? "Pagamento confirmado · em oficialização"');
   expect(page).toContain('status === "compensada"\n                        ? "/externo/controle"');
   expect(page).toContain('status === "compensada" ? (\n                              <Button asChild variant="outline"');
   expect(page).toContain("Acompanhar oficialização");
   expect(page).toContain("!isGuideSettled(guide)");
 });
});