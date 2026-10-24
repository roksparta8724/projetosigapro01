import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO legacy process access identity security", () => {
  const migration=readFileSync(
    "neon/migrations/20261024_prevent_legacy_process_identity_spoofing.sql",
    "utf8",
  );
  it("never substitutes a caller-chosen user for its own authenticated legacy id", () => {
    expect(migration).toContain("cp.legacy_user_id as effective_legacy_user_id");
    expect(migration).toMatch(/where _user_id is null or _user_id=cp\.legacy_user_id/i);
    expect(migration).not.toMatch(/coalesce\(\s*_user_id\s*,/i);
  });
  it("preserves authenticated RPC access without granting PUBLIC execution", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.has_process_access(uuid,uuid) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.has_process_access(uuid,uuid) TO authenticated");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("public.current_profile_id()");
  });
});
