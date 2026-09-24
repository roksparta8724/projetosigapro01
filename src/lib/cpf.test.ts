import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/cpf";

describe("CPF no cadastro municipal", () => {
  it("aceita um CPF valido com ou sem pontuacao", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejeita digitos verificadores invalidos, sequencias e CNPJ", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("12.345.678/0001-95")).toBe(false);
  });

  it("normaliza e formata sem alterar os digitos", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});
