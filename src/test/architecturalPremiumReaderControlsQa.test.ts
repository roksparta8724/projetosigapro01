import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const reader=readFileSync("src/components/platform/ArchitecturalPdfAiPanel.tsx","utf8");
const analysis=readFileSync("src/pages/saas/DocumentAnalysisPage.tsx","utf8");
const extract=readFileSync("server/ai-project-extract.ts","utf8");
const provider=readFileSync("server/architectural-pdf-provider.ts","utf8");

describe("SIGAPRO — mesa de análise premium a partir do vídeo QA04",()=>{
  it("não deixa o leitor sobrecarregado de cards visíveis e mantém contraste de fontes",()=>{
    expect(reader).toContain('data-sigapro-premium-ai-header="true"');
    expect(reader).toContain('data-sigapro-ai-method-selector="true"');
    expect(reader).toContain('data-sigapro-legal-history-details="true"');
    expect(reader).toContain('data-sigapro-ai-evidence-alerts="true"');
    expect(reader).toContain('data-sigapro-territorial-readiness={territorial.cadastralLink}');
    expect(reader).toContain('bg-white p-3.5 text-slate-900');
    expect(reader).toContain('dark:bg-[#1a3049] dark:text-white');
    expect(reader).toContain('disabled:!text-slate-700 disabled:opacity-100');
    expect(analysis).toContain('disabled:!text-slate-600');
    expect(analysis).toContain('disabled:bg-slate-100');
  });
  it("o toolbar comunica página e zoom ao PDF real, sem alterar a origem do arquivo",()=>{
    expect(analysis).toContain('data-sigapro-pdf-synced-page={page}');
    expect(analysis).toContain('data-sigapro-pdf-synced-zoom={Math.round(zoom*100)}');
    expect(analysis).toContain("page=");
    expect(analysis).toContain("zoom=");
    expect(analysis).toContain('key={accessUrl}');
    expect(analysis).toContain('src={previewUrl}');
    expect(analysis).not.toContain('key={previewUrl}');
    expect(analysis).not.toContain('view=FitH');
    expect(analysis).toContain('onGoToPage={(nextPage)');
    expect(reader).toContain('data-sigapro-ai-go-to-page={row.page}');
    expect(reader).toContain('onClick={()=>onGoToPage(row.page!)}');
    expect(reader).toContain('makeReviewedDrawingEvidence(draft.fileName,row.page,row.quote)');
  });
  it("o analista pode interromper leitura remota sem perder laudo anterior ou dados processuais",()=>{
    const scan=reader.slice(reader.indexOf("async function scan()"),reader.indexOf("async function downloadReadingReport()"));
    expect(scan).toContain("new AbortController()");
    expect(scan).toContain("scanSequence.current");
    expect(scan).toContain("signal:controller.signal");
    expect(scan).toContain("setTimeout(()=>controller.abort(),67000)");
    expect(scan).not.toContain("setDraft(null)");
    expect(scan.indexOf("setChecked({});")).toBeGreaterThan(scan.indexOf("setDraft(result as ApiResult)")-35);
    expect(reader).toContain('data-sigapro-ai-cancel-reading="true"');
    expect(reader).toContain("scanController.current.abort()");
    expect(reader).toContain("Leitura interrompida pelo analista.");
    expect(reader).toContain("checkingController.abort()");
    expect(reader).toContain("setTimeout(()=>checkingController.abort(),18000)");
  });
  it("nunca recomenda geometria pelo modo somente texto nem aprova sem evidência",()=>{
    expect(extract).toContain("auditArchitecturalPdfPages(pdf,extracted)");
    expect(extract).toContain('legalConformity:"not_evaluated"');
    expect(reader).toContain("result.automaticallyApproved!==false");
    expect(reader).toContain("row.usableForReview && checked[row.metric]");
    expect(provider).toContain('throw new Error("CLOUDFLARE_PDF_TEXT_PARTIAL")');
    expect(provider).toContain("Nunca invente medidas");
  });
});
