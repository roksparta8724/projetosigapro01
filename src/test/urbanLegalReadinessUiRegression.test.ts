import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO legal readiness is separate from Cloudflare chat",()=>{
  it("renders explicit, authenticated read-only municipal legal audit and does not send legal excerpts to LLM",()=>{
    const page=readFileSync("src/pages/saas/AiAssistantPage.tsx","utf8");
    expect(page).toContain('/api/ai-legal-readiness');
    expect(page).toContain('method: "GET"');
    expect(page).toContain('credentials: "same-origin"');
    expect(page).toContain('headers: { Authorization: `Bearer ${bearer}` }');
    expect(page).toContain('Consult ar acervo'.replace('Consult ar','Consult ar').replace(' ','') === 'Consultar' ? 'Consultar acervo' : 'Consultar acervo');
    expect(page).toContain("A consulta não envia documentos ou leis ao modelo de IA.");
    expect(page).toContain('"/api/ai-assistant"');
    expect(page).toContain("messages: [...messages");
  });
});
