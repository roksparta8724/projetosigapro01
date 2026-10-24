import { describe, expect, it } from "vitest";
import { mergeDerivedUrbanFields } from "@/lib/urbanPrecheckAssist";

describe("SIGAPRO — índices urbanísticos calculados", () => {
  it("preserva valor e evidência registrados manualmente e preenche campos vazios", () => {
    const current = {
      occupancy_percent: {value:"35",evidence:"Prancha A1, pág. 2"},
      permeability_percent: {value:"",evidence:""},
    };
    const result = mergeDerivedUrbanFields(current, [
      ["occupancy_percent", {value:40,evidence:"Leitura automática da planta"}],
      ["permeability_percent", {value:25,evidence:"Planta revisada, pág. 1"}],
    ]);
    expect(result.occupancy_percent).toEqual(current.occupancy_percent);
    expect(result.permeability_percent).toEqual({value:"25",evidence:"Planta revisada, pág. 1"});
    expect(current.permeability_percent.value).toBe("");
  });
  it("não sobrescreve referências já existentes mesmo quando o valor está vazio", () => {
    const result=mergeDerivedUrbanFields({
      floor_area_ratio:{value:"",evidence:"Conferência pendente do analista"},
    },[["floor_area_ratio",{value:1.2,evidence:"Cálculo sugerido"}]]);
    expect(result.floor_area_ratio).toEqual({value:"",evidence:"Conferência pendente do analista"});
  });
  it("rejeita cálculos inválidos sem contaminar a ficha técnica", () => {
    const result=mergeDerivedUrbanFields({}, [
      ["occupancy_percent",{value:NaN,evidence:"Prancha A"}],
      ["permeability_percent",{value:Infinity,evidence:"Prancha B"}],
      ["floor_area_ratio",{value:-1,evidence:"Prancha C"}],
      ["front_setback",{value:5,evidence:""}],
    ]);
    expect(Object.keys(result)).toHaveLength(0);
  });

});
