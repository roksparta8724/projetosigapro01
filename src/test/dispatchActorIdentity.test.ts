import { describe, expect, it } from "vitest";
import { resolveProcessDispatchAuthor } from "@/lib/dispatchActorIdentity";

describe("dispatch author identity", () => {
  it("prefers the linked official profile over an outdated stored name", () => {
    expect(
      resolveProcessDispatchAuthor(
        { requestedByProfileId: "profile-123", requestedBy: "Nome antigo" },
        [{ id: "profile-123", name: "Servidor Atual" }],
      ),
    ).toBe("Servidor Atual");
  });

  it("recovers a known author when only the profile id is stored", () => {
    expect(
      resolveProcessDispatchAuthor(
        { requestedByProfileId: "profile-123" },
        [{ id: "profile-123", name: "Responsável pelo despacho" }],
      ),
    ).toBe("Responsável pelo despacho");
  });

  it("preserves an explicitly recorded historical author when the profile is unavailable", () => {
    expect(
      resolveProcessDispatchAuthor(
        { requestedBy: "Responsável histórico" },
        [],
      ),
    ).toBe("Responsável histórico");
  });

  it("never invents an author using placeholders or unrelated users", () => {
    expect(
      resolveProcessDispatchAuthor(
        { requestedBy: "Autor não identificado", requestedByProfileId: "missing" },
        [{ id: "another-profile", name: "Outro analista" }],
      ),
    ).toBeNull();
  });

  it("does not treat generic system labels as identified people", () => {
    expect(resolveProcessDispatchAuthor({ requestedBy: "Sistema" })).toBeNull();
  });
});
