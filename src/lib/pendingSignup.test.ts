import { describe, expect, it } from "vitest";
import { readPendingSignup } from "./pendingSignup";

const user = {
  email: "  New@Example.com ",
  user_metadata: {
    role: "profissional_externo",
    tenant_id: "49dac0b6-6352-4744-9aab-9ff91c59d970",
    full_name: "Novo Profissional",
  },
};

describe("readPendingSignup", () => {
  it("recovers a confirmed external signup without inventing a tenant", () => {
    expect(readPendingSignup(user, null, null)).toMatchObject({
      tenantId: user.user_metadata.tenant_id,
      role: "profissional_externo",
      email: "new@example.com",
    });
  });

  it("concludes a signup whose legacy auth trigger created a provisional profile", () => {
    expect(readPendingSignup(user, "profissional", null)).toMatchObject({
      tenantId: user.user_metadata.tenant_id,
      role: "profissional_externo",
    });
  });

  it("does not rewrite an existing municipal membership", () => {
    expect(readPendingSignup(user, "profissional_externo", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBeNull();
  });

  it("rejects privileged roles and non-UUID scope metadata", () => {
    expect(readPendingSignup({ ...user, user_metadata: { ...user.user_metadata, role: "master_admin" } }, null, null)).toBeNull();
    expect(readPendingSignup({ ...user, user_metadata: { ...user.user_metadata, tenant_id: "tenant-campo" } }, null, null)).toBeNull();
    expect(readPendingSignup(user, "prefeitura_admin", null)).toBeNull();
  });
});
