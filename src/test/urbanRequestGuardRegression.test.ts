import { describe, expect, it } from "vitest";
import { isCurrentUrbanRequest } from "@/lib/urbanRequestGuard";

describe("SIGAPRO — proteção contra respostas antigas da análise urbanística", () => {
  const active = { processId: "processo-a", municipalityId: "prefeitura-a", generation: 4 };

  it("permite resposta somente para a mesma prefeitura, processo e geração", () => {
    expect(isCurrentUrbanRequest({ ...active }, active)).toBe(true);
  });

  it.each([
    ["outra prefeitura", { ...active, municipalityId: "prefeitura-b" }],
    ["outro processo", { ...active, processId: "processo-b" }],
    ["geração anterior", { ...active, generation: 3 }],
    ["geração posterior", { ...active, generation: 5 }],
  ])("descarta resposta de %s", (_scenario, requested) => {
    expect(isCurrentUrbanRequest(requested, active)).toBe(false);
  });

  it("não aceita resposta de uma sessão anterior depois de trocar e voltar ao mesmo processo", () => {
    const previous = { ...active, generation: 4 };
    const reopened = { ...active, generation: 6 };
    expect(isCurrentUrbanRequest(previous, reopened)).toBe(false);
  });
});
