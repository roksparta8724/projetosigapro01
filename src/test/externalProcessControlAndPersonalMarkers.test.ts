import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("external process control and personal markers", () => {
  const external = read("src/pages/saas/ExternalProcessControlPage.tsx");
  const platformData = read("src/hooks/usePlatformData.tsx");
  const markerMigration = read(
    "neon/migrations/20261017_personal_process_markers.sql",
  );

  it("shows protocol and analysis payments as separate compact entries", () => {
    expect(external).toContain('case "protocolo":');
    expect(external).toContain('return "Protocolo"');
    expect(external).toContain('case "iss_obra":');
    expect(external).toContain('return "Análise / ISSQN"');
    expect(external).toContain("data-external-payment-guide={guide.kind}");
    expect(external).toContain("displayGuides.map");
  });

  it("presents a deferred external process as completed without changing the workflow enum", () => {
    expect(external).toContain('if (status === "deferido") return "Concluído"');
    expect(external).toContain('{ value: "deferido", label: "Concluído" }');
    expect(external).toContain("externalProcessStatusLabel(process.status)");
  });

  it("uses a compact premium process action instead of the oversized full-width bar", () => {
    expect(external).toContain('className="sig-primary-process-action h-11 min-w-[190px]');
    expect(external).toContain("flex items-center justify-end");
    expect(external).not.toContain('sig-primary-process-action h-16 w-full');
  });

  it("isolates process markers by authenticated profile in the database", () => {
    expect(markerMigration).toContain("process_markers_process_profile_label_uidx");
    expect(markerMigration).toContain(
      "on public.process_markers(process_id,created_by_profile_id,lower(label))",
    );
    expect(markerMigration).toContain("process_markers_select_own");
    expect(markerMigration).toContain(
      "created_by_profile_id=public.current_profile_id()",
    );
    expect(markerMigration).toContain(
      "Este marcador pertence a outro usuário.",
    );
    expect(markerMigration).not.toContain("insert into public.process_audit_entries");
  });

  it("keeps personal markers isolated by the authenticated profile", () => {
    expect(platformData).toContain("addProcessMarker");
    expect(platformData).toContain("removeProcessMarker");
    expect(markerMigration).toContain("created_by_profile_id=public.current_profile_id()");
    expect(markerMigration).toContain("process_markers_select_own");
  });
});
