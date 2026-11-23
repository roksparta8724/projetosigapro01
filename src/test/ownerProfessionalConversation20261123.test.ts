import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatOwnerConversationTime } from "@/lib/ownerConversationDisplay";
import {
  getOwnerMessagesForLink, type OwnerProjectLink, type OwnerProfessionalMessage,
} from "@/lib/platform";

const read = (name: string) => readFileSync(name, "utf8");
const link = { id: "link-1", projectId: "process-1", ownerUserId: "owner-1", professionalUserId: "prof-1", chatEnabled: true, linkedAt: "2026-11-23", linkedBy: "prof-1" } as OwnerProjectLink;
const message = (id:string, createdAt:string, ownerUserId="owner-1"):OwnerProfessionalMessage => ({
 id, projectId:link.projectId, ownerUserId, professionalUserId:link.professionalUserId,
 senderUserId:link.professionalUserId, createdAt, message:id,
});
describe("proprietário ↔ profissional: conversa segura e pronta para uso", () => {
  it("keeps messages scoped to an approved link, sorted oldest to newest", () => {
    const list = [message("last","2026-11-23T15:00:00Z"),message("other","2026-11-23T12:00:00Z","another-owner"),message("first","2026-11-22T12:00:00Z")];
    expect(getOwnerMessagesForLink(link,list).map(m=>m.id)).toEqual(["first","last"]);
  });
  it("never presents Invalid Date to owners", () => {
    expect(formatOwnerConversationTime("not a date")).toBe("Horário indisponível");
    expect(formatOwnerConversationTime(null)).toBe("Horário indisponível");
    expect(formatOwnerConversationTime("2026-11-23T15:00:00Z")).toContain("23/11/2026");
  });
  it("validates full CPF/CNPJ in secured RPC instead of trusting masked digits", () => {
    const sql=read("neon/migrations/20261123_owner_professional_private_chat_v1.sql");
    expect(sql).toContain("create or replace function public.create_owner_request_by_protocol(");
    expect(sql).toContain("public.process_party_private_data priv");
    expect(sql).toContain("length(_normalized_document) not in (11,14)");
    expect(sql).toContain("priv.document_number");
    expect(sql).toContain("Somente o profissional responsavel pode alterar");
    expect(sql).toContain("mark_owner_conversation_read");
    expect(sql).not.toContain("or public.is_master()");
  });
  it("uses a focused, participant-scoped fetch and preserves drafts on failed sends", () => {
    const backend=read("src/integrations/backend/platformImpl.ts");
    const hook=read("src/hooks/useOwnerPrivateConversation.ts");
    const owner=read("src/pages/saas/OwnerPortalPage.tsx");
    const professional=read("src/pages/saas/ExternalMessagesPage.tsx");
    const store=read("src/hooks/usePlatformData.tsx");
    expect(backend).toContain('db.from("owner_professional_messages").select("*")');
    expect(backend).toContain('db.rpc("mark_owner_conversation_read"');
    expect(hook).toContain("12000");
    expect(owner).toContain("useOwnerPrivateConversation");
    expect(professional).toContain("useOwnerPrivateConversation");
    expect(owner).toContain('selectedLink ? (');
    expect(owner).toContain("sendingMessage");
    expect(professional).toContain("if (result === null || result === false)");
    expect(store).toContain("const confirmedLinkId = input.linkId || linkSnapshot?.id");
  });
});
