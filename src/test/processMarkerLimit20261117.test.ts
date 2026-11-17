import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_PERSONAL_PROCESS_MARKERS, PERSONAL_PROCESS_MARKER_LIMIT_ERROR,
  canApplyPersonalProcessMarker, assertPersonalProcessMarkerLimit,
  composeProfessionalMarkerLabel, parseProfessionalMarkerSymbol,
} from "@/lib/processMarkerLimits";

const read = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — até 3 marcadores individuais + 1 situação automática", () => {
  const current = ["Prioridade::gold", "⭐ Favorito::cyan", "📍 Vistoria::violet"];

  it("o limite é três marcadores pessoais POR PROCESSO; a situação não é uma tag", () => {
    expect(MAX_PERSONAL_PROCESS_MARKERS).toBe(3);
    expect(canApplyPersonalProcessMarker([], "Retorno")).toBe(true);
    expect(canApplyPersonalProcessMarker(current.slice(0, 2), "Retorno")).toBe(true);
    expect(canApplyPersonalProcessMarker(current, "Retorno")).toBe(false);
    expect(() => assertPersonalProcessMarkerLimit(current, "Retorno"))
      .toThrow(PERSONAL_PROCESS_MARKER_LIMIT_ERROR);
  });

  it("permite atualizar a cor de um marcador existente mesmo com três já aplicados", () => {
    expect(canApplyPersonalProcessMarker(current, "Prioridade")).toBe(true);
    expect(canApplyPersonalProcessMarker(current, "⭐ Favorito")).toBe(true);
    expect(canApplyPersonalProcessMarker(current, "📍 Vistoria")).toBe(true);
    expect(() => assertPersonalProcessMarkerLimit(current, "⭐ Favorito")).not.toThrow();
    expect(canApplyPersonalProcessMarker(current, "🎯 Novo marcador")).toBe(false);
  });

  it("identidade visual escolhida na pasta é conservada no texto persistido", () => {
    const text = composeProfessionalMarkerLabel("Favorito", "⭐");
    expect(text).toBe("⭐ Favorito");
    expect(parseProfessionalMarkerSymbol(text)).toEqual({ emoji: "⭐", label: "Favorito" });
    expect(parseProfessionalMarkerSymbol("Prioridade")).toEqual({ label: "Prioridade" });
  });

  it("o seletor limita apenas os marcadores de PROCESSO, sem atingir os documentos", () => {
    const selector = read("src/components/platform/MarkerSelector.tsx");
    expect(selector).toContain("Boolean(processId && !onApplyMarker)");
    expect(selector).toContain("Marcadores individuais:");
    expect(selector).toContain("personalMarkerLimitReached && !isApplied");
    expect(selector).toContain("Remover marcador");
    expect(selector).toContain("composeProfessionalMarkerLabel(composedLabel, preset.emoji)");
  });

  it("a gravação compartilhada bloqueia quarta marcação nas mesas e na ficha", () => {
    const store = read("src/hooks/usePlatformData.tsx");
    const registry = read("src/pages/saas/MunicipalProcessRegistryPage.tsx");
    expect(store).toContain("assertPersonalProcessMarkerLimit(process.tags ?? [], normalized)");
    expect(store).toContain("markerWritesInFlightRef");
    expect(store).toContain("await savePersonalProcessMarker(processId, marker, color)");
    expect(registry).toContain("const full = selected.filter(process =>");
    expect(registry).toContain("canApplyPersonalProcessMarker(process.tags ?? [], actualLabel)");
  });

  it("nenhum registro existente é apagado para impor o novo limite", () => {
    const migration = read("neon/migrations/20261117_cap_three_personal_process_markers.sql");
    expect(migration).toContain("NEW.created_by_profile_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain(">= 3");
    expect(migration).not.toContain("DELETE FROM public.process_markers");
  });
});
