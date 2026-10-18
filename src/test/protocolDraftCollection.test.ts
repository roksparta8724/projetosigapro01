import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProtocolDraft,
  defaultProtocolDraftForm,
  listProtocolDrafts,
  inferProtocolDraftEntryMode,
  readProtocolDraft,
  saveProtocolDraft,
} from "@/lib/protocolDraft";

describe("protocol draft collection", () => {
  const sessionId = "user-drafts";
  const scopeId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    window.localStorage.clear();
  });


  it("keeps project and Habite-se drafts in separate resume flows", () => {
    const projectDraft = {
      draftNumber: "PRE-20261018-010001",
      entryMode: "projeto" as const,
      form: { ...defaultProtocolDraftForm, titulo: "Projeto residencial", tipo: "Licenciamento" },
      files: {},
      updatedAt: new Date(Date.now() - 1000).toISOString(),
    };
    const habiteDraft = {
      draftNumber: "HAB-20261018-010002",
      entryMode: "habite-se" as const,
      form: {
        ...defaultProtocolDraftForm,
        titulo: "",
        tipo: "Habite-se",
        processoAprovacao: "PM-2026-00002",
        numeroAlvara: "ALV-2026-00002",
      },
      files: {},
      updatedAt: new Date().toISOString(),
    };

    expect(saveProtocolDraft(sessionId, scopeId, projectDraft)).toBe(true);
    expect(saveProtocolDraft(sessionId, scopeId, habiteDraft)).toBe(true);

    expect(
      readProtocolDraft(sessionId, scopeId, null, projectDraft.draftNumber, "projeto")
        ?.draftNumber,
    ).toBe(projectDraft.draftNumber);
    expect(
      readProtocolDraft(sessionId, scopeId, null, habiteDraft.draftNumber, "habite-se")
        ?.draftNumber,
    ).toBe(habiteDraft.draftNumber);
    expect(
      readProtocolDraft(sessionId, scopeId, null, habiteDraft.draftNumber, "projeto"),
    ).toBeNull();
    expect(inferProtocolDraftEntryMode(habiteDraft)).toBe("habite-se");
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
