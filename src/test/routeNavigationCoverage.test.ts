import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");

function unique(values: string[]) {
  return [...new Set(values)];
}

describe("route and navigation coverage", () => {
  const routePaths = unique(
    [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== "*"),
  );

  const navigationTargets = unique(
    [...portal.matchAll(/to:\s*"([^"]+)"/g)].map((match) => match[1]),
  );

  it("keeps every internal navigation target backed by a declared route", () => {
    const missing = navigationTargets.filter(
      (target) =>
        !routePaths.includes(target) &&
        !routePaths.some((route) => route.includes(":") && target.startsWith(route.split("/:")[0])),
    );

    expect(missing, `Navigation without route: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not duplicate declared route paths", () => {
    const rawRoutes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = rawRoutes.filter((route, index) => rawRoutes.indexOf(route) !== index);
    expect(unique(duplicates), `Duplicated routes: ${unique(duplicates).join(", ")}`).toEqual([]);
  });

  it("keeps the critical municipal department pages declared", () => {
    [
      "/prefeitura",
      "/prefeitura/analise",
      "/prefeitura/protocolos",
      "/prefeitura/protocolos/novo",
      "/prefeitura/financeiro",
      "/prefeitura/financeiro/protocolos",
      "/prefeitura/financeiro/iptu",
      "/historico",
      "/legislacao",
      "/legislacao/zoneamento",
      "/notificacoes",
      "/configuracoes",
      "/perfil",
    ].forEach((path) => expect(routePaths).toContain(path));
  });
});
