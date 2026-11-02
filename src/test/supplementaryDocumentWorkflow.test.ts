import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const rd=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
describe("SIGAPRO: pagamento antes do processo e documentos complementares",()=>{
  const draft=rd("src/pages/saas/ProtocolarProjetoPage.tsx");
  const d=rd("src/pages/saas/ProcessDetailPage.tsx");
  const sql=rd("neon/migrations/20261102_supplementary_document_request_v1.sql");
  it("rotula corretamente a solicitação anterior ao protocolo",()=>{
    expect(draft).toContain("Referência da solicitação (não é processo oficial)");
    expect(draft).toContain("Emitir guia e registrar solicitação");
  });
  it("vincula novo documento, resposta externa e conferência do analista",()=>{
    expect(d).toContain('data-supplementary-analyst="true"');
    expect(d).toContain('data-supplementary-professional="true"');
    expect(d).toContain("await respondRequirement({");
    expect(d).toContain("requestRemoteSupplementaryDocument({");
    expect(d).toContain("canEditAssignedAnalysis && session.role");
  });
  it("a exigência só é emitida pelo analista designado, depois da guia e da triagem",()=>{
    expect(sql).toContain("_role <> 'analista'");
    expect(sql).toContain("_p.analysis_assigned_to_profile_id IS DISTINCT FROM _actor");
    expect(sql).toContain("_p.officialized_at IS NULL");
    expect(sql).toContain("process_technical_release_verified_v1");
    expect(sql).toContain("process_audit_entries");
    expect(sql).not.toContain("payment_guides");
  });
});
