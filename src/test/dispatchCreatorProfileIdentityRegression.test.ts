import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const neonMigration = readFileSync(
  resolve(process.cwd(), "neon/migrations/20261018_dispatch_creator_profile_fk_guard.sql"),
  "utf8",
);

const supabaseMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261018151500_dispatch_creator_profile_fk_guard.sql"),
  "utf8",
);

describe("dispatch creator profile identity FK guard", () => {
  it("keeps profile_id canonical and only persists a legacy auth user when it exists", () => {
    for (const migration of [neonMigration, supabaseMigration]) {
      expect(migration).toContain("create or replace function public.sync_dispatch_creator_profile()");
      expect(migration).toContain("new.created_by_profile_id := public.current_profile_id()");
      expect(migration).toContain("from auth.users au");
      expect(migration).toContain("where au.id = p.user_id");
      expect(migration).toContain("then p.user_id");
      expect(migration).toContain("else null");
      expect(migration).toContain("new.created_by := _legacy_id");
    }
  });

  it("preserves municipality compatibility while fixing author identity", () => {
    expect(neonMigration).toContain("new.municipality_id is null");
    expect(neonMigration).toContain("where m.id = new.tenant_id");
    expect(neonMigration).toContain("new.municipality_id := new.tenant_id");
  });
});
