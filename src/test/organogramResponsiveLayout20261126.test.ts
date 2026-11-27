import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const chart=readFileSync("src/components/platform/MunicipalOrganizationChart.tsx","utf8");
describe("Organograma responsivo, nomes sem compressão",()=>{
 it("separa a linha de ações da área de texto institucional",()=>{
  expect(chart).toContain('data-organogram-unit-header="true"');
  expect(chart).toContain('data-organogram-unit-actions="true"');
  expect(chart).toContain('data-organogram-unit-copy="true" className="mt-2 min-w-0 w-full"');
  expect(chart).toContain('whitespace-normal [overflow-wrap:break-word]');
  expect(chart).toContain('aria-label={"Editar "+department.name}');
  expect(chart).toContain('aria-label={"Adicionar unidade em "+department.name}');
 });
 it("usa a largura real do painel, sem esticar as colunas nem esconder nomes",()=>{
  expect(chart).toContain('repeat(auto-fit,minmax(min(100%,25rem),1fr))');
  expect(chart).toContain('items-start gap-4');
  expect(chart).not.toContain('mt-0.5 truncate');
  expect(chart).toContain('data-organogram-children="true"');
  expect(chart).toContain('onAddChild={onAddChild}');
 });
});
