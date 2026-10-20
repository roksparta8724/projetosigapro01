import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getMunicipalPositionDefaults,
  getMunicipalPositionDisplayTitle,
  municipalPositionPresets,
  normalizeMunicipalPositionLabels,
} from "@/lib/municipalPositionCatalog";

const adminPage = readFileSync(resolve(process.cwd(),"src/pages/saas/TenantAdminPage.tsx"),"utf8");
const backend = readFileSync(resolve(process.cwd(),"src/integrations/backend/platformImpl.ts"),"utf8");
const migration = readFileSync(resolve(process.cwd(),"supabase/migrations/20261020214500_municipal_position_catalog.sql"),"utf8");

describe("cargos municipais canônicos", () => {
  it("oferece todos os cargos iniciais com chaves próprias", () => {
    expect(municipalPositionPresets).toHaveLength(7);
    expect(new Set(municipalPositionPresets.map((x) => x.key)).size).toBe(7);
    expect(municipalPositionPresets.map((x) => x.defaultTitle)).toEqual(
      expect.arrayContaining([
        "Diretor de Urbanismo", "Secretário de Urbanismo", "Secretário do Financeiro",
        "Diretor do Financeiro", "Diretor da Administração", "Secretário da Administração", "Diretor de TI",
      ]),
    );
  });
  it("muda a exibição sem modificar os IDs de papéis técnicos", () => {
    expect(getMunicipalPositionDisplayTitle("Diretor de Urbanismo", {
      diretor_urbanismo: "Diretor de Planejamento Urbano",
    })).toBe("Diretor de Planejamento Urbano");
    expect(getMunicipalPositionDisplayTitle("Diretor de Urbanismo", {
      diretor_urbanismo: "Direção Técnica Municipal",
    }, { diretor_urbanismo: ["Diretor de Planejamento Urbano"] })).toBe("Direção Técnica Municipal");
    expect(getMunicipalPositionDisplayTitle("Analista Técnico", getMunicipalPositionDefaults())).toBe("Analista Técnico");
    expect(normalizeMunicipalPositionLabels({ diretor_ti: "", desconhecido: "Administrador", diretor_financeiro: "  Diretor Financeiro  " })).toEqual({
      diretor_financeiro: "Diretor Financeiro",
    });
  });
  it("restringe edição ao administrador e mantém testes locais fora do banco", () => {
    expect(adminPage).toContain('session.role === "prefeitura_admin" && session.accessLevel >= 3');
    expect(adminPage).toContain("writeLocalMunicipalPositionLabels");
    expect(adminPage).toContain("updateRemoteMunicipalPositionLabels");
    expect(adminPage).toContain("data-municipal-position-catalog");
    expect(backend).toContain('db.rpc("update_municipal_position_titles_v1"');
    expect(migration).toContain("public.can_manage_municipality(_municipality_id)");
  });
});
