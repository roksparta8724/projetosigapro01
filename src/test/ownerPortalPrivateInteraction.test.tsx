import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");
describe("portal do proprietário: navegação privada e dispositivos móveis",()=>{
  it("can talk after approval even when preprotocol process details are not yet visible",()=>{
    const owner=read("src/pages/saas/OwnerPortalPage.tsx");
    expect(owner).toContain('selectedLink ? (');
    expect(owner).not.toContain('selectedLink && selectedProcess ? (');
    expect(owner).not.toContain("if (!process) return null");
    expect(owner).toContain("linkId: selectedLink.id");
    expect(owner).toContain('active: activeTab === "mensagens" && Boolean(selectedLink)');
    expect(owner).toContain("sendingMessage");
  });
  it("resolves deep links to private message tabs and uses a bounded scroll area",()=>{
    const owner=read("src/pages/saas/OwnerPortalPage.tsx");
    const professional=read("src/pages/saas/ExternalMessagesPage.tsx");
    expect(owner).toContain('params.get("aba")');
    expect(owner).toContain('params.get("conversa")');
    expect(owner).toContain("max-h-[540px]");
    expect(professional).toContain('requestedConversationId = new URLSearchParams(location.search).get("conversa")');
    expect(professional).toContain("max-h-[540px]");
    expect(professional).toContain("const textToSend = ownerMessageDraft.trim()");
  });
});
