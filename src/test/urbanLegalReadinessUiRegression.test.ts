import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO — legal catalog remains separate from the LLM", () => {
  it("uses an authenticated, read-only municipal legal view with visible non-approval notice", () => {
    const page = readFileSync("src/pages/saas/AiAssistantPage.tsx", "utf8");
    expect(page).toContain('fetch("/api/ai-legal-readiness"');
    expect(page).toContain('method: "GET"');
    expect(page).toContain('credentials: "same-origin"');
    expect(page).toContain('headers: { Authorization: `Bearer ${bearer}` }');
    expect(page).toContain("Consultar acervo");
    expect(page).toContain("A consulta não envia documentos ou leis ao modelo de IA.");
    expect(page).toContain("Não são parecer, aprovação,");
    expect(page).toContain('fetch("/api/ai-assistant"');
    expect(page).toContain("messages: [...messages");
  });
});
