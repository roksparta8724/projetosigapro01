import { describe, expect, it } from "vitest";
import { isCurrentUrbanRequest } from "@/lib/urbanRequestGuard";

describe("SIGAPRO IA: isolamento de respostas assíncronas", () => {
  const requested = { processId: "processo-1", municipalityId: "municipio-1", generation: 5 };
  it("aceita apenas a resposta do mesmo processo, prefeitura e geração", () => {
    expect(isCurrentUrbanRequest(requested, { ...requested })).toBe(true);
  });
  it.each([
    ["processo diferente", { ...requested, processId: "processo-2" }],
    ["prefeitura diferente", { ...requested, municipalityId: "municipio-2" }],
    ["requisição antiga", { ...requested, generation: 6 }],
  ])("descarta resposta obsoleta: %s", (_description, current) => {
    expect(isCurrentUrbanRequest(requested, current)).toBe(false);
  });
});
