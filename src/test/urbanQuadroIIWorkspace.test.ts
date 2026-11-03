import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("SIGAPRO IA — Quadro II safe assisted transcription", () => {
  it("indexes pages 38–51 without treating the index as transcribed rules", () => {
    const migration = read("neon/migrations/20261103_urban_quadro_ii_workspace_v1.sql");
    expect(migration).toContain("generate_series(38,51)");
    expect(migration).toContain("p=43");
    expect(migration).toContain("draft_unverified");
    expect(migration).toContain("'ready_for_ai',false");
    expect(migration).toContain("'legal_approval',false");
    expect(migration).not.toContain("activate_urban_regulation");
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).toContain("is_urban_regulation_admin_v1");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ON CONFLICT (municipality_id,request_id) DO NOTHING");
  });

  it("never silently promotes imported categories to norms for the AI", () => {
    const client = read("src/integrations/backend/urbanPrecheckClient.ts");
    const panel = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    expect(client).toContain('"list_urban_quadro_ii_workspace_v1"');
    expect(client).toContain('"save_urban_quadro_ii_draft_entry_v1"');
    expect(client).toContain('_document_sha256: documentSha256');
    expect(panel).toContain('data-urban-quadro-ii="true"');
    expect(panel).toContain("Pendências do Quadro I permanecem isoladas");
    expect(panel).toContain("Nenhuma categoria transcrita nesta página");
    expect(panel).toContain('workspace?.status === "pending_legal_review"');
    expect(panel).toContain('disabled={!valid || saving}');
    expect(panel).toContain('crypto.randomUUID()');
    expect(panel).toContain("Conferi {selectedSuggestion?.source_pages?.length");
    expect(panel).toContain("sem validação jurídica");
    expect(settings).toContain("<UrbanLegalMatrixReviewPanel");
    expect(settings).toContain("<UrbanQuadroIIWorkspacePanel");
  });

  it("requires human provenance and leaves unknown parking and zoning fields blank", () => {
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(client).toContain("entry.sourceExcerpt.trim().length < 20");
    expect(client).toContain("entry.pageNumber < 38 || entry.pageNumber > 51");
    expect(panel).toContain('permittedZones: ""');
    expect(panel).toContain('parkingRequirement: ""');
    expect(panel).toContain("Deixe vazio se não confirmado");
    expect(panel).toContain("Este registro ficará somente como rascunho");
  });
});


describe("SIGAPRO IA — Quadro I visible by default and Quadro II recoverable", () => {
  it("opens the Quadro I first and preserves an independent Quadro II tab", () => {
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    const first = read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    const second = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(settings).toContain('useState<"I" | "II">("I")');
    expect(settings).toContain('setActiveQuadro("I")');
    expect(settings).toContain('role="group"');
    expect(settings).toContain('role="region"');
    expect(settings).toContain("Quadro I — Índices urbanísticos");
    expect(settings).toContain("Quadro II — Usos e localização");
    expect(settings).toContain("Cadastro jurídico de versões — etapa independente");
    expect(settings).not.toContain("Ver 23 registros");
    expect(settings).toContain('activeQuadro === "I" ?');
    expect(first).toContain('const firstActive = batchResult.value.find');
    expect(first).toContain('if (active && detail) setSelected(detail)');
    expect(first).toContain("Quadro I — matriz de limites e índices urbanísticos");
    expect(second).toContain("Tentar novamente");
    expect(second).toContain("PGRST202");
  });
});


describe("SIGAPRO IA — visual polarity for both Quadro tabs", () => {
  it("enforces selected navy/white and unselected white/dark under inverse-main mode", () => {
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    const stylesheet = read("src/index.css");
    expect((settings.match(/data-urban-quadro-tab="true"/g) || []).length).toBe(2);
    expect((settings.match(/data-urban-quadro-tab-title="true"/g) || []).length).toBe(2);
    expect((settings.match(/data-urban-quadro-tab-detail="true"/g) || []).length).toBe(2);
    expect(settings).toContain('aria-pressed={activeQuadro === "I"}');
    expect(settings).toContain('aria-pressed={activeQuadro === "II"}');
    expect(settings).not.toContain("aria-selected=");
    expect(stylesheet).toContain("SIGAPRO IA — QUADROS I/II PREMIUM TAB CONTRAST");
    expect(stylesheet).toContain('button[data-urban-quadro-tab="true"][data-contrast-surface="dark"][aria-pressed="true"]');
    expect(stylesheet).toContain('button[data-urban-quadro-tab="true"][data-contrast-surface="light"][aria-pressed="false"]');
    expect(stylesheet).toContain("aria-pressed to avoid");
    expect(stylesheet).toContain("-webkit-text-fill-color: #ffffff !important;");
    expect(stylesheet).toContain("background: #0b3150 !important;");
    expect(stylesheet).toContain("background: #ffffff !important;");
    expect(stylesheet).toContain("color: #152b43 !important;");
  });
});


describe("SIGAPRO IA — Quadro II PDF evidence suggestions remain unverified", () => {
  it("loads only provenance-linked text and proposals without auto-activating rules", () => {
    const migration=read("neon/migrations/20261103_quadro_ii_source_evidence_qa_v1.sql");
    const seed=read("neon/qa-seeds/20261103_quadro_ii_pdf_evidence_qa.sql");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.urban_quadro_ii_source_evidence_v1 FROM authenticated");
    expect(migration).toContain("'source_evidence_text'");
    expect(migration).toContain("'source_quality'");
    expect(migration).toContain("'proposals'");
    expect(seed).toContain("68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1");
    expect(seed).toContain("source_batch");
    expect(seed).toContain("ON CONFLICT (municipality_id,batch_id,page_number) DO NOTHING");
    expect(client).toContain('status: "proposal_unverified"');
    expect(panel).toContain("Pré-preencher e revisar");
    expect(panel).toContain('sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600)');
    expect(panel).toContain("setSelectedSuggestion(proposal)");
    expect(panel).toContain("setConfirmed(false); // Auto-fill is never a human confirmation.");
    expect(panel).toContain('page.source_quality === "machine_unverified"');
    expect(panel).toContain("setConfirmed(false)");
    expect(panel).toContain("Texto extraído pode misturar colunas");
    expect(panel).toContain('page.source_quality === "visual_required"');
    expect(panel).toContain("Nenhuma sugestão é norma");
    expect(panel).toContain("Regras liberadas para IA");
    expect(panel).toContain('disabled={!valid || saving}');
  });
});


describe("SIGAPRO IA — assisted field auto-fill with legal safeguards", () => {
  it("preserves zoning as unverified, prepares other fields and requires human evidence review", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const seed=read("neon/qa-seeds/20261103_quadro_ii_autofill_candidates_qa.sql");
    expect(client).toContain("permitted_zones_text?: string");
    expect(client).toContain("source_pages?: number[]");
    expect(panel).toContain('permittedZones: ""');
    expect(panel).toContain("Zonas detectadas automaticamente — NÃO confirmadas");
    expect(panel).toContain('roadHierarchy: (proposal.road_hierarchy_text || "").slice(0, 600)');
    expect(panel).toContain('parkingRequirement: proposal.field_warnings?.some((note) =>');
    expect(panel).toContain(') ? "" : (proposal.parking_requirement_text || "").slice(0, 600)');
    expect(panel).toContain('specialConditions: (proposal.special_conditions_text || "").slice(0, 800)');
    expect(panel).toContain('sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600)');
    expect(panel).toContain('setConfirmed(false); // Auto-fill is never a human confirmation.');
    expect(panel).toContain("selectedSuggestion.source_pages.join");
    expect(panel).toContain("Não aprove o cadastro apenas pela aparência");
    expect(panel).toContain('disabled={!valid || saving}');
    expect(seed).toContain("68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1");
    expect(seed).toContain("source_quality='machine_unverified'");
    expect(seed).not.toContain("activate_urban_regulation");
  });
});


describe("SIGAPRO IA — source-review form is visible and buttons maintain contrast", () => {
  it("renders prepared editor above category cards and scrolls to the chosen source", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const css=read("src/index.css");
    const editor=panel.indexOf('data-urban-qii-editor="true"');
    const proposals=panel.indexOf("Sugestões de categorias — requerem conferência");
    expect(editor).toBeGreaterThan(0);
    expect(editor).toBeLessThan(proposals);
    expect(panel).toContain("editorRef.current?.scrollIntoView");
    expect(panel).toContain('data-urban-qii-index="true"');
    expect(panel).toContain('data-urban-qii-detail="true"');
    expect(panel).not.toContain('pageDetailRef.current?.scrollIntoView({ behavior: "auto", block: "start" })');
    expect(panel).toContain("pageButtonRefs.current.get(activePage)");
    expect(panel).toContain('data-urban-qii-action="true"');
    expect(panel).toContain('data-urban-qii-action-label="true"');
    expect(panel).toContain("Pré-preencher e revisar");
    expect(panel).toContain("Conferência assistida · Página");
    expect(panel).toContain("setConfirmed(false); // Auto-fill is never a human confirmation.");
    expect(css).toContain('button[data-urban-qii-action="true"] > [data-urban-qii-action-label="true"]');
    expect(css).toContain("background: #0b3150 !important;");
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important;");
  });
});


describe("SIGAPRO IA — safe literal evidence and E1 group applicability", () => {
  it("keeps E1 group scope and activities visible while rejecting composed excerpts as literal evidence", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const seed=read("neon/qa-seeds/20261103_quadro_ii_e1_scope_and_evidence_qa.sql");
    expect(panel).toContain("Enquadramento geral da categoria:");
    expect(panel).toContain("Atividades abrangidas na fonte:");
    expect(panel).toContain('sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600)');
    expect(panel).toContain("Resumos automáticos de várias colunas não são prova documental.");
    expect(client).toContain("literal_source_excerpt?: string;");
    expect(client).toContain("group_scope_text?: string;");
    expect(seed).toContain("área construída de até 250 m²");
    expect(seed).toContain("Creches; e similares.");
    expect(seed).toContain("document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1'");
    expect(seed).not.toContain("urban_regulation_versions");
  });
});


describe("SIGAPRO IA — stable navigation between the 14 Quadro II pages", () => {
  it("keeps the index fixed, renders only one detail and anchors each page switch", () => {
    const panel = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const css = read("src/index.css");
    expect(panel).toContain('role="group" aria-label="Selecionar página do Quadro II"');
    expect(panel).toContain('aria-pressed={activePage === item.page_number}');
    expect(panel).toContain('aria-controls="sigapro-qii-selected-page"');
    expect(panel).toContain('data-urban-qii-detail="true"');
    expect(panel).toContain('const page = selectedPage;');
    expect(panel).toContain('useLayoutEffect(() => {');
    expect(panel).not.toContain('pageDetailRef.current?.scrollIntoView({ behavior: "auto", block: "start" })');
    expect(panel).toContain("pageButtonRefs.current.get(activePage)");
    expect(panel).toContain("Página anterior");
    expect(panel).toContain("Próxima página");
    expect(panel).toContain("Ver índice");
    expect(panel).not.toContain('expanded ? "lg:col-span-2"');
    expect(css).toContain("overflow-anchor: none;");
    expect(css).toContain('[data-urban-qii-index="true"]');
  });
});


describe("SIGAPRO IA — stable compact navigation for all 14 pages", () => {
  it("keeps selected details beside a one-row page index without forced vertical jumps", () => {
    const panel = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(panel).toContain('className="flex w-max min-w-full flex-nowrap gap-2"');
    expect(panel).toContain("overflow-x-auto overscroll-x-contain");
    expect(panel).toContain("pageButtonRefs.current.get(activePage)");
    expect(panel).toContain("index.scrollTo({");
    expect(panel).not.toContain('pageDetailRef.current?.scrollIntoView({ behavior: "auto", block: "start" })');
    expect(panel).toContain("selectedPage ? (() => {");
    expect(panel).toContain("Página anterior");
    expect(panel).toContain("Próxima página");
    expect(panel).toContain("sem deslocar a tela para o fim da lista");
  });
});


describe("SIGAPRO IA — AIU2 analyst instruction and Quadro II scope accuracy", () => {
  it("preserves original ambiguous OCR and labels CA 1 only as reported guidance", () => {
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const matrix=read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    const migration=read("neon/migrations/20261103_aiu2_analyst_guidance_qa_v1.sql");
    const seed=read("neon/qa-seeds/20261103_aiu2_analyst_reported_ca_1_qa.sql");
    expect(client).toContain("analyst_guidance?: UrbanMatrixAnalystGuidance[]");
    expect(matrix).toContain('data-urban-matrix-analyst-guidance="true"');
    expect(matrix).toContain("CA mínimo proposto:");
    expect(matrix).toContain("Proposta do analista — não homologada");
    expect(matrix).toContain("pending_documentary_confirmation");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.urban_matrix_analyst_guidance_v1 FROM authenticated");
    expect(migration).toContain("'analyst_guidance',_guidance");
    expect(seed).toContain("'01'");
    expect(seed).not.toContain("UPDATE public.urban_matrix_batch_staging_v1");
  });
  it("keeps pages 41-51 explicitly pending instead of claiming no restrictions", () => {
    const qii=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const scope=read("neon/qa-seeds/20261103_quadro_ii_scope_review_refinements_qa.sql");
    expect(qii).toContain('data-urban-qii-unstructured="true"');
    expect(qii).toContain("Página sem categorias estruturadas");
    expect(qii).toContain("Não aplicar esta página à IA");
    expect(scope).toContain("art. 43, IV(a)");
    expect(scope).toContain("OU lotação");
    expect(scope).toContain("2.500 m²");
  });
});


describe("SIGAPRO IA — legal safety and premium review workflow", () => {
  it("never assumes today's date as the effective date of a law, and keeps the manual editor collapsed", () => {
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    expect(settings).toContain('const [effectiveFrom, setEffectiveFrom] = useState("");');
    expect(settings).not.toContain('municipalCivilDate()');
    expect(settings).toContain('data-urban-legal-editor="true"');
    expect(settings).toContain("a data do cadastro ou a de hoje não comprova vigência");
    expect(settings).toContain("data de início de vigência comprovada");
  });
  it("never fills unreadable zoning automatically or certifies a conflicting AIU2 observation", () => {
    const qii = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const matrix = read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    expect(qii).toContain('permittedZones: ""');
    expect(qii).toContain("Zonas detectadas automaticamente — NÃO confirmadas");
    expect(qii).toContain("O campo de zonas ficou vazio propositalmente");
    expect(qii).toContain("propositalmente");
    expect(matrix).toContain('data-aiu2-conflicting-review="true"');
    expect(matrix).toContain("São informações conflitantes");
  });
});


describe("SIGAPRO IA — Quadro II continuation pages", () => {
  it("does not mistake a continuation or parcelamento modality for an empty use table", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(panel).toContain("Continuação das categorias S1 — serviços locais");
    expect(panel).toContain("Continuação das categorias C2 — comércio diversificado");
    expect(panel).toContain("Parcelamento do solo — modalidades habitacionais");
    expect(panel).toContain("não de categorias de uso");
    expect(panel).toContain("Não aplicar esta página à IA");
  });
});


describe("SIGAPRO IA — pending AIU2 value does not silently become law", () => {
  it("visibly separates analyst proposal from unverified OCR and keeps review pending", () => {
    const matrix=read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    const lib=read("src/lib/urbanLegalMatrixReview.ts");
    const css=read("src/index.css");
    expect(lib).toContain("describePendingAnalystCa");
    expect(lib).toContain("pending_documentary_confirmation");
    expect(lib).toContain("minimumFractionDigits: 2");
    expect(matrix).toContain('data-urban-matrix-ca-chip="true"');
    expect(matrix).toContain('data-urban-matrix-ca-pending="true"');
    expect(matrix).toContain("OCR original:");
    expect(matrix).toContain("Ver pendência da leitura automática original");
    expect(matrix).toContain("Não ativado para análise automática.");
    expect(matrix).toContain("g.row_index === entry.index");
    expect(css).toContain('[data-urban-matrix-ca-pending="true"] > span');
  });
});


describe("SIGAPRO IA — compact AIU(2) review with full audit retained", () => {
  it("keeps previous review details available without expanding the card by default", () => {
    const matrix=read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    expect(matrix).toContain('data-urban-matrix-compact-history="true"');
    expect(matrix).toContain('const auditHistory = (');
    expect(matrix).toContain(") : auditHistory}");
    expect(matrix).toContain("Histórico e justificativas da AIU(2)");
    expect(matrix).toContain("Ver registro detalhado da orientação");
    expect(matrix).toContain("Ver pendência da leitura automática original");
    expect(matrix).toContain("Última revisão:");
    expect(matrix).toContain('entry.needsCorrection ? "Editar observação, se necessário"');
    expect(matrix).toContain('reviewingIndex === entry.index');
    expect(matrix).not.toContain('<details data-urban-matrix-compact-history="true" open');
  });
});


describe("SIGAPRO IA — AIU(2) proportional card and optional correction", () => {
  it("keeps long OCR history collapsed and stops prompting duplicate reviews", () => {
    const matrix=read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    expect(matrix).toContain("min-w-0 break-words border-l-[3px] border-amber-400 pl-3");
    expect(matrix).toContain("Não marque a caixa nem registre essa mesma observação novamente.");
    expect(matrix).toContain("Editar observação, se necessário");
    expect(matrix).toContain('reviewingIndex === entry.index ? "Fechar conferência"');
    expect(matrix).toContain("Ver histórico");
    expect(matrix).toContain("group-open/history:rotate-180");
    expect(matrix).toContain('className="group/history');
    expect(matrix).toContain("OCR original:");
    expect(matrix).toContain("A extração original foi preservada.");
    expect(matrix).not.toContain("space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3");
  });
});


describe("SIGAPRO IA — signed AIU2 exception is treated without false legal approval", () => {
  it("counts documented exceptions as handled but not as verified coefficients", () => {
    const calc=read("src/lib/urbanLegalMatrixReview.ts");
    const panel=read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    expect(calc).toContain("const handled = reviewed + needsCorrection");
    expect(calc).toContain("const untreated = Math.max(0, total - handled)");
    expect(calc).toContain("pending: Math.max(0, total - reviewed)");
    expect(calc).toContain("handledPercentage:");
    expect(panel).toContain('data-urban-matrix-reading-treated="true"');
    expect(panel).toContain("Ressalvas já registradas (");
    expect(panel).toContain("Não é necessário repetir a conferência da AIU(2).");
    expect(panel).toContain("Salvar ressalva atualizada");
    expect(panel).toContain("Revisei a evidência disponível e registrei a ressalva.");
    expect(panel).toContain("A ressalva NÃO confirma o CA mínimo");
  });
});
