import { describe, expect, it } from "vitest";
import { evaluateUrbanPrecheck } from "@/lib/urbanPrecheck";

describe("SIGAPRO — limites legais sem tolerância indevida", () => {
  it("classifica como divergência recuo inferior ao mínimo por diferença pequena", () => {
    const results = evaluateUrbanPrecheck(
      [{ metric: "front_setback_m", limit: 5, reference: "Lei municipal art. 10" }],
      { front_setback_m: { value: 4.9999999999, evidence: "Prancha 01, cota frontal" } },
    );
    expect(results[0].status).toBe("attention");
  });
  it("classifica como divergência ocupação superior ao máximo por diferença pequena", () => {
    const results = evaluateUrbanPrecheck(
      [{ metric: "occupancy_percent", limit: 60, reference: "Lei municipal art. 11" }],
      { occupancy_percent: { value: 60.0000000001, evidence: "Quadro de áreas da prancha 02" } },
    );
    expect(results[0].status).toBe("attention");
  });
  it("aceita o valor exatamente no limite legal", () => {
    expect(evaluateUrbanPrecheck(
      [{ metric: "front_setback_m", limit: 5, reference: "Lei municipal art. 10" }],
      { front_setback_m: { value: 5, evidence: "Prancha 01" } },
    )[0].status).toBe("within_limit");
  });
});
