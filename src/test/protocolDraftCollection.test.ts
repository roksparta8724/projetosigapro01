import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProtocolDraft,
  defaultProtocolDraftForm,
  listProtocolDrafts,
  readProtocolDraft,
  saveProtocolDraft,
} from "@/lib/protocolDraft";

describe("protocol draft collection", () => {
  const sessionId = "user-drafts";
  const scopeId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps independent drafts and resolves one by its draft number", () => {
    const first = {
      draftNumber: "PRE-20261012-170001",
      form: { ...defaultProtocolDraftForm, titulo: "Projeto A" },
      files: {},
      updatedAt: new Date(Date.now() - 1000).toISOString(),
    };
    const second = {
      draftNumber: "PRE-20261012-170002",
      form: { ...defaultProtocolDraftForm, titulo: "Projeto B" },
      files: {},
      updatedAt: new Date().toISOString(),
    };

    expect(saveProtocolDraft(sessionId, scopeId, first)).toBe(true);
    expect(saveProtocolDraft(sessionId, scopeId, second)).toBe(true);

    expect(listProtocolDrafts(sessionId, scopeId)).toHaveLength(2);
    expect(readProtocolDraft(sessionId, scopeId, null, first.draftNumber)?.form.titulo).toBe("Projeto A");
    expect(readProtocolDraft(sessionId, scopeId, null, second.draftNumber)?.form.titulo).toBe("Projeto B");

    clearProtocolDraft(sessionId, scopeId, null, first.draftNumber);

    const remaining = listProtocolDrafts(sessionId, scopeId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].draftNumber).toBe(second.draftNumber);
  });
});
