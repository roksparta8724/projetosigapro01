/**
 * SIGAPRO preview QA release gate.
 *
 * Temporary in-build validation while GitHub Actions cannot schedule runners.
 * This runs only on the protected Vercel QA branch; other previews and
 * production keep their existing build behavior. It never opens a database,
 * uses credentials, changes payment records or sends documents anywhere.
 */
import { spawnSync } from "node:child_process";
const BRANCH="fix/qa-triagem-analise-pagamento-20261101";
const TESTS=[
  "server/qa-architectural-benchmark.test.ts",
  "server/architectural-document-guard.test.ts",
  "server/mp-qa-webhook.test.ts",
  "server/mp-webhook-worker-privilege.test.ts",
  "server/municipal-payment.test.ts",
  "src/test/qaArchitecturalLabUi.test.tsx",
  "src/test/qaArchitecturalLabEntryPoint.test.ts",
  "src/test/nativeArchitecturalPdfQa.test.ts",
  "src/test/nativeArchitecturalPdfExtendedCoverage.test.ts",
  "src/test/architecturalPdfPreflightQa.test.ts",
  "src/test/urbanQuadroIIDossier.test.ts",
  "src/test/urbanQuadroIIReviewProgress.test.ts",
  "src/test/urbanQuadroIIResumeExistingDraftQa.test.ts",
  "src/test/urbanLegalReadinessSecurity.test.ts",
  "src/test/urbanZoningGeoJson.test.ts",
  "src/test/urbanTerritorialReadiness.test.ts",
  "src/test/municipalCollectionApi.test.ts",
  "src/test/mpProdWebhookReleaseReadiness.test.ts",
  "src/test/qaPreviewBuildGate.test.ts",
  "src/test/qaPaymentEvidence.test.ts",
  "src/test/urbanAiOfficialIntegration.test.ts",
  "src/test/urbanEvidenceTemporalGate.test.ts",
  "src/test/workflowUnknownStageQa.test.ts",
  "src/test/qaFullJourneyIntegrated.test.ts",
  "src/test/habiteSeCompletionRealRpcRegression.test.ts",
  "src/test/habiteSeCanonicalSignedPdfQa.test.ts",
  "src/test/municipalAdminDbGuardFullQa.test.ts",
  "src/test/prefeituraAdminDispatchFailClosedQa.test.ts",
  "src/test/qa04StoredPdfAudit.test.tsx",
];
function run(label,args){
  console.log("[SIGAPRO_QA_BUILD_GATE] START "+label);
  const result=spawnSync(process.execPath,args,{
    stdio:"inherit",cwd:process.cwd(),timeout:240000,
    env:{...process.env,CI:"true"},
  });
  if(result.error){
    console.error("[SIGAPRO_QA_BUILD_GATE] ERROR "+label+" "+result.error.message);
    process.exit(1);
  }
  if(result.status!==0){
    console.error("[SIGAPRO_QA_BUILD_GATE] BLOCKED "+label+
      " exit="+String(result.status)+" signal="+String(result.signal));
    process.exit(result.status&&result.status>0?result.status:1);
  }
  console.log("[SIGAPRO_QA_BUILD_GATE] PASS "+label);
}
if(process.env.VERCEL_ENV==="preview"&&process.env.VERCEL_GIT_COMMIT_REF===BRANCH){
  // Only local static checks; none of these routines call a real provider.
  run("typecheck",["node_modules/typescript/bin/tsc","-p","tsconfig.app.json","--noEmit"]);
  run("eslint",["node_modules/eslint/bin/eslint.js","."]);
  run("focused-tests",["node_modules/vitest/vitest.mjs","run",
      "--maxWorkers=2",...TESTS]);
  console.log("[SIGAPRO_QA_BUILD_GATE] PASS focused preview gate; "+
    "commercial E2E/official regulation/bank confirmation remain separately required.");
}
