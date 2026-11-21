import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getChecklistTemplate } from "@/lib/platform";

const read=(path:string)=>readFileSync(path,"utf8");
const correction=read("neon/migrations/20261110_paid_triage_correction_v1.sql");
const sync=read("neon/migrations/20261110_document_sync_owner_scope_v1.sql");
const page=read("src/pages/saas/ProcessDetailPage.tsx");

describe("SIGAPRO paid-triage data repair — real records, authorized writers",()=>{
  it("restores absent property and party data without changing original payment or protocol",()=>{
    expect(correction).toContain("CREATE OR REPLACE FUNCTION public.correct_paid_triage_identity_v1");
    expect(correction).toContain("_process.property_id IS NULL");
    expect(correction).toContain("INSERT INTO public.properties(");
    expect(correction).toContain("INSERT INTO public.process_parties(");
    expect(correction).toContain("ownerName");
    expect(correction).toContain("technicalLead");
    expect(correction).toContain("public.evaluate_automatic_protocol_triage_v1");
    expect(correction).toContain("'paymentModified',false");
    expect(correction).toContain("'guideReissued',false");
    expect(correction).not.toContain("UPDATE public.payment_guides");
    expect(correction).not.toContain("next_tenant_protocol_number");
    expect(correction).not.toContain("SET paid=true");
  });
  it("enforces profile, owner, municipality, confirmed payment and eligible status in the database",()=>{
    expect(correction).toContain("account_status='active'");
    expect(correction).toContain("current_role_code() IS DISTINCT FROM 'profissional_externo'");
    expect(correction).toContain("_process.status IS DISTINCT FROM 'pendencia_documental'");
    expect(correction).toContain("_profile.municipality_id IS DISTINCT FROM _process.municipality_id");
    expect(correction).toContain("_process.created_by_profile_id = _actor");
    expect(correction).toContain("NOT public.has_process_access(_process_id)");
    expect(correction).toContain("g.paid IS TRUE");
    expect(correction).toContain("g.status='compensada'");
    expect(correction).toContain("PAID_AREA_REQUIRES_FINANCIAL_REVIEW");
    expect(correction).toContain("OWNER_IDENTITY_REQUIRES_FORMAL_REVISION");
    expect(correction).toContain("TECHNICAL_IDENTITY_REQUIRES_FORMAL_REVISION");
  });
  it("limits write paths to the authenticated professional and denies administrative writes",()=>{
    expect(sync).toContain("public.current_role_code()");
    expect(sync).toContain("public.has_process_access(_process_id)");
    expect(sync).toContain("'prefeitura_admin','admin_municipality'");
    expect(sync).toContain("'master_admin','master_ops','admin_master'");
    expect(sync).toContain("_profile_municipality IS DISTINCT FROM coalesce(_municipality_id,_tenant_id)");
    expect(sync).toContain("_process_creator IS DISTINCT FROM _profile_id");
    expect(sync).toContain("_role='profissional_externo'");
    expect(sync).toContain("'pendencia_documental'::public.process_status");
    expect(sync).toContain("'/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,180}$'");
    expect(sync).toContain("_existing_review IN ('aprovado','rejeitado')");
    expect(sync).toContain("reviewStatus','pendente");
    expect(sync).toContain("annotations','[]'");
  });
  it("requires the same four core files in intake and paid triage, never seven by default",()=>{
    for(const kind of [
      "Aprovação de Projeto Comercial","Aprovação de projeto residencial",
      "Aprovação de Projeto Industrial","Aprovação de Projeto Institucional",
    ]) {
      const template=getChecklistTemplate(kind);
      expect(template).toBeDefined();
      const required=template!.items.filter(x=>x.required).map(x=>x.label);
      expect(required).toHaveLength(4);
      expect(required.some(x=>/projeto arquitetonico/i.test(x))).toBe(true);
      expect(required.some(x=>/memorial descritivo/i.test(x))).toBe(true);
      expect(required.some(x=>/art ou rrt/i.test(x))).toBe(true);
      expect(required.some(x=>/matricula do imovel/i.test(x))).toBe(true);
    }
    const intake=read("src/pages/saas/ProtocolarProjetoPage.tsx");
    expect(intake).toContain('label: "RG e CPF ou CNH do Proprietário", required: false');
    expect(intake).toContain('label: "IPTU", required: false');
    expect(intake).toContain('label: "Levantamento Planialtimétrico", required: false');
  });
  it("shows real correction fields and keeps outstanding documents visible after uploads",()=>{
    expect(page).toContain('data-paid-triage-correction="true"');
    expect(page).toContain("correct_paid_triage_identity_v1");
    expect(page).toContain("handleCorrectPaidTriageIdentity");
    expect(page).toContain("address: triageCorrection.address.trim()");
    expect(page).toContain("ownerName: triageCorrection.ownerName.trim()");
    expect(page).toContain("technicalLead: triageCorrection.technicalLead.trim()");
    expect(page).toContain("const documentSlots = buildProcessDocuments(");
    expect(page).toContain("process.type, process.documents, process.tenantId, effectiveScopeId");
    expect(page).toContain("process.status === \"rascunho\" || process.status === \"pendencia_documental\"");
    expect(page).not.toContain("markGuideAsPaid(true)");
  });
});