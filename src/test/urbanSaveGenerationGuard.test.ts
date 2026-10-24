import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO IA - geração da gravação por navegação", () => {
  const source=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
  const save=source.slice(source.indexOf("const save = async () =>"),source.indexOf("const retryHistory = async () =>"));
  it("invalida gravação anterior ao trocar de processo, mesmo após retornar",()=>{
    expect(source).toContain("saveGenerationRef.current += 1;");
    expect(save).toContain("const saveGeneration = ++saveGenerationRef.current;");
    expect(save).toContain("saveGenerationRef.current !== saveGeneration");
  });
  it("não deixa conclusão obsoleta publicar sucesso ou erro na tela",()=>{
    expect(save).toContain("saveGenerationRef.current === saveGeneration");
    expect(save).toMatch(/saveGenerationRef\.current !== saveGeneration[\s\S]*?setLastSavedSnapshot/);
    expect(save).toContain("if (saveGenerationRef.current === saveGeneration)");
  });
});
