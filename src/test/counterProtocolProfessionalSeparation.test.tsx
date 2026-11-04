import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProtocolTechnicalResponsibility } from "@/components/platform/ProtocolTechnicalResponsibility";
import { defaultProtocolDraftForm, type ProtocolDraftForm } from "@/lib/protocolDraft";

const page = readFileSync("src/pages/saas/ProtocolarProjetoPage.tsx", "utf8");
describe("SIGAPRO protocolar em balcão: identidade e responsável técnico separados", () => {
  it("uses the same approved form route with an explicit counter-mode guard", () => {
    const routes = readFileSync("src/App.tsx", "utf8");
    expect(routes).toContain('path="/prefeitura/protocolos/novo"');
    expect(page).toContain('location.pathname.startsWith("/prefeitura/protocolos/novo")');
    expect(page).toContain('counterMode={isCounterProtocol}');
    expect(page).toContain('createdBy: session.id');
    expect(page).toContain('technicalLead: form.profissional');
  });

  it("never populates a fresh counter request with the municipal employee's profile", () => {
    expect(page).toContain('shouldAutofillTechnicalLead(session.role, isCounterProtocol)');
    expect(page).toContain('profissional: !autofillTechnicalLead ? "" : profileFullName || session.name');
    expect(page).toContain('profissionalDocumento: !autofillTechnicalLead ? "" : profile?.cpfCnpj || ""');
    expect(page).toContain('email: !autofillTechnicalLead ? "" : profileEmail || session.email');
    expect(page).toContain('if (!autofillTechnicalLead) return;');
    expect(page).toContain('isolateCounterProfessionalDraft({');
    expect(page).toContain('data-counter-employee-profile="true"');
    expect(page).toContain('storedForm.profissional || payload.technicalLead ||');
  });

  it("keeps the municipal clerk inside the Prefeitura workflow after creating preprotocol", () => {
    expect(page).toContain('isCounterProtocol ? "/prefeitura/protocolos" : `/externo/pagamentos?preprotocolo=');
    expect(page).toContain('isCounterProtocol ? "/prefeitura/protocolos" : "/externo/controle"');
    expect(page).toContain('registerRemoteExternalAccount');
    expect(page).toContain('session.role === "profissional_externo"');
  });

  it("presents the authenticated clerk independently from the licensed construction professional", () => {
    const form:ProtocolDraftForm={...defaultProtocolDraftForm,profissional:"Profissional externo de teste"};
    render(<ProtocolTechnicalResponsibility form={form} counterMode clerkName="Servidor QA"
      setField={()=>{}} setToggle={()=>{}} />);
    expect(screen.getByText("Servidor autenticado: Servidor QA")).toBeTruthy();
    expect(screen.getByText(/O servidor é o autor do registro/)).toBeTruthy();
    expect(screen.queryByText("O protocolante é o mesmo responsável técnico pelo projeto")).toBeNull();
    expect(screen.getByText("ART / RRT / TRT do projeto")).toBeTruthy();
    const switcher=screen.getByText("O responsável pela execução é o mesmo profissional responsável pelo projeto");
    expect(switcher).toBeTruthy();
  });
});