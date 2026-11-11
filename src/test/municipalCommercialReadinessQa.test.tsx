import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {fireEvent,render,screen,waitFor,cleanup} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";

const mocks=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("@/lib/municipalCollectionApi",()=>({
  municipalCollectionApiRequest:mocks.request,
}));
import {MunicipalCommercialReadiness} from "@/components/platform/MunicipalCommercialReadiness";

const tenantA="49dac0b6-6352-4744-9aab-9ff91c59d970";
const tenantB="4f01ab8b-8ae0-4aae-a908-a45f6711001c";
const data=(municipalityId=tenantA,parts:Record<string,unknown>={})=>({
  kind:"sigapro.municipal.commercial-readiness.v1",
  municipalityId,checkedAt:"2026-11-11T18:00:00Z",
  financialProvider:{provider:"not_configured",environment:"not_configured",
    activeAndTestedForProduction:false},
  municipalCollection:{mode:"not_configured",environment:"not_configured",active:false},
  bankAuthenticatedOriginalsProduction:0,officialLegalEvidenceCount:0,
  activatedNonFixtureUrbanRules:0,historicalAnalystSignatures:0,
  historicalDirectorSignatures:0,independentR2ByteAuditVerified:false,
  newAuthenticatedEndToEndVerified:false,officialMunicipalAcceptanceVerified:false,
  commercialReleaseCertified:false,...parts,
});
const view=(municipalityId=tenantA)=>render(<MemoryRouter>
  <MunicipalCommercialReadiness municipalityId={municipalityId}/>
</MemoryRouter>);
beforeEach(()=>{mocks.request.mockReset();});
afterEach(()=>cleanup());

describe("SIGAPRO: one municipal commercial readiness evidence source",()=>{
  it("uses authenticated same-municipality API and never certifies commercial release",async()=>{
    mocks.request.mockResolvedValue(data());
    view();
    await screen.findByText(/Liberação comercial não certificada/);
    expect(mocks.request).toHaveBeenCalledWith(
      "collection-configuration",tenantA,"commercial_readiness");
    expect(screen.getByText(/0\. Evidências legais conferidas: 0/)).toBeInTheDocument();
    expect(screen.getByText("Abrir cadastro de Legislações")).toHaveAttribute(
      "href","/cadastro-gestao/legislacao"
    );
    expect(screen.getAllByText(/Prefeitura/).length).toBeGreaterThan(0);
  });

  it("shows historic signatures as evidence, never an active municipal acceptance",async()=>{
    mocks.request.mockResolvedValue(data(tenantA,{
      financialProvider:{provider:"mercado_pago",environment:"production",
        activeAndTestedForProduction:true},
      bankAuthenticatedOriginalsProduction:2,officialLegalEvidenceCount:3,
      activatedNonFixtureUrbanRules:1,historicalAnalystSignatures:2,
      historicalDirectorSignatures:1,
    }));
    view();
    await screen.findByText(/Liberação comercial não certificada/);
    expect(screen.getByText(/Registros anteriores de analista e diretoria/)).toBeInTheDocument();
    expect(screen.getByText(/auditoria independente dos bytes/)).toBeInTheDocument();
    expect(screen.getByText(/aceite formal da Prefeitura/)).toBeInTheDocument();
  });

  it("denies mismatched tenant response and does not show unrelated data",async()=>{
    mocks.request.mockResolvedValue(data(tenantB));
    view(tenantA);
    await screen.findByRole("alert");
    expect(screen.getByText(/resposta não confirmou o isolamento/)).toBeInTheDocument();
    expect(screen.queryByText(/Liberação comercial não certificada/)).not.toBeInTheDocument();
  });

  it("shows authenticated lookup failures without claiming approval",async()=>{
    mocks.request.mockRejectedValue(new Error("Sem acesso a configuracao desta Prefeitura"));
    view();
    await screen.findByRole("alert");
    expect(screen.getByText(/Nenhuma autorização comercial foi concedida/)).toBeInTheDocument();
    expect(screen.queryByText(/Liberação comercial não certificada/)).not.toBeInTheDocument();
    mocks.request.mockResolvedValueOnce(data());
    fireEvent.click(screen.getByRole("button",{name:/Atualizar comprovações/}));
    await waitFor(()=>expect(screen.getByText(/Liberação comercial não certificada/)).toBeInTheDocument());
  });

  it("SQL validates tenant membership and contains no financial writes or secret values",()=>{
    const sql=readFileSync("neon/migrations/20261111_municipal_commercial_readiness_v1.sql","utf8");
    const api=readFileSync("api/collection-configuration.ts","utf8");
    const page=readFileSync("src/pages/saas/CollectionSettingsPage.tsx","utf8");
    expect(sql).toContain("public.can_read_municipal_collection_v1(_municipality_id)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_municipal_commercial_readiness_v1");
    expect(sql).toContain("FROM PUBLIC,anonymous");
    expect(sql).toContain("'commercialReleaseCertified',false");
    expect(sql).toContain("g.provider_environment='production'");
    expect(sql).toContain("e.confirmed_by_profile_id IS NOT NULL");
    expect(sql).not.toMatch(/UPDATE\s+public\.|DELETE\s+FROM\s+public\.|INSERT\s+INTO\s+public\./i);
    expect(api).toContain('action === "commercial_readiness"');
    expect(api).toContain('"get_municipal_commercial_readiness_v1"');
    expect(page).toContain("isolatedQa ? <MunicipalCommercialReadiness");
  });
});
