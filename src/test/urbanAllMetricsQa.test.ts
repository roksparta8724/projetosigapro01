import { describe, expect, it } from "vitest";
import {
  URBAN_METRICS, evaluateUrbanPrecheck, selectUrbanRegulation, validateUrbanRules,
  type UrbanMetric, type UrbanRule, type UrbanMeasurements,
} from "@/lib/urbanPrecheck";

const limits: Record<UrbanMetric, number> = {
  front_setback_m:5,side_setback_m:1.5,rear_setback_m:3,
  permeability_percent:30,occupancy_percent:60,
  floor_area_ratio:1.5,floor_area_ratio_min:0.25,
  lot_area_m2:250,lot_frontage_m:10,height_m:12,floor_count:3,
};
const rules:UrbanRule[]=URBAN_METRICS.map(({key})=>({
  metric:key,limit:limits[key],reference:"LEI HIPOTETICA - ENSAIO QA, SEM VALIDADE LEGAL",
}));
const measurements=():UrbanMeasurements=>Object.fromEntries(
  URBAN_METRICS.map(({key})=>[key,{value:limits[key],evidence:"Prancha QA, página 1, cota conferida manualmente"}]),
) as UrbanMeasurements;
describe("SIGAPRO — todos os 11 parâmetros urbanísticos em ensaio isolado",()=>{
  it("exige todos os 11 índices válidos, cada qual com mínimo ou máximo",()=>{
    expect(URBAN_METRICS).toHaveLength(11);
    expect(validateUrbanRules(rules)).toBe(true);
    const findings=evaluateUrbanPrecheck(rules,measurements());
    expect(findings).toHaveLength(11);
    expect(findings.every(row=>row.status==="within_limit")).toBe(true);
    expect(findings.map(row=>row.direction)).toEqual(URBAN_METRICS.map(row=>row.direction));
  });
  it("detecta cada limite excedido, nunca o inverte",()=>{
    for(const metric of URBAN_METRICS) {
      const measured=measurements();
      const direction=metric.direction;
      const change=metric.key==="floor_count" ? 1 : 0.1;
      measured[metric.key]={value:limits[metric.key]+(direction==="minimum"?-change:change),
        evidence:"Prancha QA, página 1, cota conferida manualmente"};
      const all=evaluateUrbanPrecheck(rules,measured);
      expect(all.find(row=>row.metric===metric.key)?.status).toBe("attention");
      expect(all.filter(row=>row.status==="attention")).toHaveLength(1);
    }
  });
  it("rejeita valores impossíveis e evidências não preenchidas",()=>{
    const measured=measurements();
    measured.occupancy_percent={value:101,evidence:"Prancha QA, página 1"};
    measured.permeability_percent={value:123,evidence:"Prancha QA, página 1"};
    measured.floor_count={value:2.5,evidence:"Prancha QA, página 1"};
    measured.front_setback_m={value:5,evidence:""};
    const findings=evaluateUrbanPrecheck(rules,measured);
    for(const key of ["occupancy_percent","permeability_percent","floor_count","front_setback_m"]) {
      expect(findings.find(row=>row.metric===key)?.status).toBe("missing_evidence");
    }
  });
  it("não torna ativa uma norma fictícia de homologação",()=>{
    expect(selectUrbanRegulation([{id:"test",municipality_id:"qa",zone_code:"QA-TEST",
      use_code:"RESIDENCIAL",status:"active",version:1,effective_from:"2026-01-01",
      created_at:"2026-01-01T00:00:00Z",rules}], "qa", "QA-TEST",
    "RESIDENCIAL","2026-11-04")).toBeNull();
  });
});
