import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const txt=(file:string)=>readFileSync(file,"utf8");

describe("SIGAPRO: electronic signatures, roles and ICP-Brasil commercial truthfulness",()=>{
  it("never promises qualified ICP-Brasil signing without a real provider",()=>{
    const master=txt("src/pages/saas/MasterAdminPage.tsx");
    expect(master).toContain('<SelectItem value="icp_brasil" disabled>');
    expect(master).toContain('data-icp-brazil-pending="true"');
    expect(master).toContain('if (form.signatureMode === "icp_brasil")');
    expect(master).toContain("prestador que gere e valide assinaturas qualificadas");
  });
  it("blocks readonly prefeitura admin from signing ordinary process documents",()=>{
    const sql=txt("neon/migrations/20261112_signature_roles_no_admin_impersonation.sql");
    const doc=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_signature_context_v1"));
    const allowList=doc.slice(doc.indexOf("if _role not in ("),doc.indexOf(") then",doc.indexOf("if _role not in (")));
    expect(allowList).not.toContain("'prefeitura_admin'");
    expect(allowList).not.toContain("'admin_prefeitura'");
    expect(allowList).not.toContain("'admin_municipality'");
    expect(allowList).toContain("'profissional_externo'");
    expect(allowList).toContain("'analista'");
    expect(allowList).toContain("'prefeitura_supervisor'");
  });
  it("removes master technical impersonation but retains assigned analysts and director",()=>{
    const sql=txt("neon/migrations/20261112_signature_roles_no_admin_impersonation.sql");
    const artifact=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_process_artifact_signature_context_v1"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.get_signature_context_v1"));
    expect(artifact).not.toContain("public.is_master()");
    expect(artifact).toContain("public.can_write_process_analysis(_process_id)");
    expect(artifact).toContain("_role in ('analista','analyst')");
    expect(artifact).toContain("_slot='diretoria'");
    expect(artifact).toContain("_slot='secretaria'");
    const fiscal=artifact.slice(artifact.indexOf("elsif _slot='conferencia_fiscal'"),
      artifact.indexOf("elsif _slot='diretoria'"));
    expect(fiscal).toContain("'prefeitura_admin'");
    expect(fiscal).toContain("_role not in (");
  });
  it("never changes past signatures, permit records, bank rows or tenant credentials",()=>{
    const sql=txt("neon/migrations/20261112_signature_roles_no_admin_impersonation.sql");
    expect((sql.match(/CREATE OR REPLACE FUNCTION/gi)||[])).toHaveLength(2);
    expect(sql).not.toMatch(/\b(INSERT INTO|UPDATE|DELETE FROM|DROP TABLE|TRUNCATE)\b/i);
    expect(sql).not.toContain("icp_brasil");
    const api=txt("api/e-sign-artifact.ts");
    expect(api).toContain('reauthenticateWithPassword');
    expect(api).toContain('"sign_process_artifact_v2"');
    expect(api).toContain('_auth_method: "password_reauth"');
  });
});
