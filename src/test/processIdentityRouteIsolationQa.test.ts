import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  buildProcessPath,
  buildProcessIdentityRouteKey,
  parseProcessIdentityRouteKey,
  resolveProcessRoute,
  type ProcessRecord,
} from "@/lib/platform";

const first = {
  id: "33333333-3333-4333-8333-333333333333",
  protocol: "PM-2026-00001",
  municipalityId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
} as ProcessRecord;
const second = {
  id: "a16b5fa2-e6b1-4814-8dc3-7fa6d265fe72",
  protocol: "PM-2026-00001",
  municipalityId: "c334d39c-3a77-464c-abd6-a3a539cceba1",
} as ProcessRecord;

describe("SIGAPRO QA — rota de protocolo com colisão real entre prefeituras",()=>{
  it("a nova URL resolve o processo por ID imutável, independente da ordenação do Master",()=>{
    const route=buildProcessPath(second,"analise");
    expect(route).toContain("PM-2026-00001--a16b5fa2-e6b1-4814-8dc3-7fa6d265fe72");
    expect(route).toContain("?aba=analise");
    const key=route.split("/processos/")[1].split("?")[0];
    expect(parseProcessIdentityRouteKey(key)).toEqual({
      protocolKey:"PM-2026-00001",id:second.id,
    });
    expect(resolveProcessRoute([first,second],key)).toBe(second);
    expect(resolveProcessRoute([second,first],key)).toBe(second);
    expect(resolveProcessRoute([first,second],buildProcessIdentityRouteKey(first))).toBe(first);
  });
  it("links antigos continuam válidos quando não houver homônimos",()=>{
    expect(resolveProcessRoute([second],"PM-2026-00001")).toBe(second);
    expect(resolveProcessRoute([first],"33333333-3333-4333-8333-333333333333")).toBe(first);
  });
  it("número duplicado não abre um município diferente por acidente",()=>{
    expect(resolveProcessRoute([first,second],"PM-2026-00001")).toBeUndefined();
    expect(resolveProcessRoute([first,second],
      "PM-2026-99999--a16b5fa2-e6b1-4814-8dc3-7fa6d265fe72")).toBeUndefined();
    expect(resolveProcessRoute([first],
      buildProcessIdentityRouteKey(second))).toBeUndefined();
  });
  it("a recarga remota usa o UUID e nunca consulta o número duplicado para resolver uma URL nova",()=>{
    const backend=readFileSync(resolve("src/integrations/backend/platformImpl.ts"),"utf8");
    expect(backend).toContain("const identityKey = parseProcessIdentityRouteKey(routeKey)");
    expect(backend).toContain("const uuid = normalizeUuid(identityKey?.id ?? routeKey)");
    expect(backend).toContain('focusQuery.eq("id", uuid)');
    expect(backend).toContain("buildProcessRouteKey(String(item.protocol_number ?? \"\"), id)");
  });
  it("a página de detalhes redireciona para a rota inequívoca, preservando o histórico",()=>{
    const detail=readFileSync(resolve("src/pages/saas/ProcessDetailPage.tsx"),"utf8");
    expect(detail).toContain("const canonicalRouteKey = buildProcessIdentityRouteKey(process)");
    expect(detail).toContain("pathname: buildProcessPath(process)");
  });
});
