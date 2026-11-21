/**
 * SIGAPRO preview QA release gate.
 *
 * Temporary in-build validation while GitHub Actions cannot schedule runners.
 * This runs only on the protected Vercel QA branch; other previews and
 * production keep their existing build behavior. The R2 inspection performs
 * a read-only QA SQL SELECT and a read-only S3 GET, hashing bytes in memory;
 * it never writes, logs document contents, or submits data to an AI provider.
 */
import { spawnSync } from "node:child_process";
const BRANCH="fix/qa-triagem-analise-pagamento-20261101";
const TESTS=[
  "server/qa-architectural-benchmark.test.ts",
  "server/architectural-document-guard.test.ts",
  "server/mp-qa-webhook.test.ts",
  "server/mp-qa-reconcile-after-pdf.test.ts",
  "server/qa-mercadopago-pix.test.ts",
  "server/mp-webhook-worker-privilege.test.ts",
  "server/municipal-payment.test.ts",
  "src/test/qaArchitecturalLabUi.test.tsx",
  "src/test/qaArchitecturalLabEntryPoint.test.ts",
  "server/qa-cloudflare-native-text-bridge.test.ts",
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
  "src/test/closedProcessLifecycleQa.test.ts",
  "src/test/qaTriageAuthorizedRecoveryQa.test.ts",
  "src/test/qaOriginalPdfCanonicalAuthorization.test.ts",
  "src/test/qaDamOriginalIdempotency.test.ts",
  "src/test/qaLargeDamOriginalUpload.test.ts",
  "src/test/realBankDamOriginalGate.test.ts",
  "src/test/realBoletoIssuanceBoundary.test.ts",
  "src/test/qaHostedBankPaymentRoutes.test.ts",
  "src/test/qaPixBankEndToEndBridge.test.ts",
  "src/test/paidTriageDocumentReturnFlow.test.ts",
  "src/test/paidTriageRealCorrectionDbQa.test.ts",
  "src/test/qaRollbackFullPermitSecurity.test.ts",
  "src/test/qaR2RoundtripBuildGate.test.ts",
  "src/test/processDocumentCanonicalShaRegressionQa.test.ts",
  "server/document-pdf-integrity.test.ts",
  "server/qa-r2-reading-proof.test.ts",
  "server/govbr-ar-readonly.test.ts",
  "src/test/govbrArApiIsolationQa.test.ts",
  "server/bank-return-cnab240.test.ts",
  "src/test/bankReturnPreviewIsolationQa.test.ts",
  "src/lib/bankFileInspector.test.ts",
  "src/test/municipalProviderProvisioningReadiness.test.ts",
  "src/test/municipalCommercialReadinessQa.test.tsx",
  "src/test/municipalIntegrationCatalog.test.ts",
  "src/test/guideOpeningExperience.test.ts",
  "src/test/r2DamSignedByteIntegrity.test.ts",
  "src/test/r2ProcessChunkUploadGateQa.test.ts",
  "src/test/r2ProcessChunkUploadSecurityQa.test.ts",
  "src/test/r2UploadAccessSecurity.test.ts",
  "src/test/r2ConsolidatedRuntime.test.ts",
  "src/test/habiteSeCanonicalSignedPdfQa.test.ts",
  "src/test/habiteSeSignedSnapshotQa.test.ts",
  "src/test/habiteSeSignedPdfBytesQa.test.ts",
  "src/test/dashboardOperationalIntegrityQa.test.ts",
  "src/test/processIdentityRouteIsolationQa.test.ts",
  "src/test/municipalAdminDbGuardFullQa.test.ts",
  "src/test/prefeituraAdminDispatchFailClosedQa.test.ts",
  "src/test/qa04StoredPdfAudit.test.tsx",
];
function run(label,args,extraEnv={}){
  console.log("[SIGAPRO_QA_BUILD_GATE] START "+label);
  const result=spawnSync(process.execPath,args,{
    stdio:"inherit",cwd:process.cwd(),timeout:240000,
    env:{...process.env,...extraEnv,CI:"true"},
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
// The general process-control preview must validate real source, not only a
// successful Vite asset build. These local checks are read-only and run solely
// for this branch; bank settlement, invoices and R2 objects are not touched.
const PREMIUM_PROCESS_BRANCH = "fix/homologacao-geral-sei-dashboard-bank-20261113";
if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === PREMIUM_PROCESS_BRANCH) {
  run("process-ui-typecheck", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.app.json", "--noEmit"]);
  run("process-ui-eslint", ["node_modules/eslint/bin/eslint.js", "."]);
  run("process-ui-regression-tests", ["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=2",
    "src/test/premiumUnifiedProcessControl20261116.test.tsx",
    "src/test/premiumBlueContrast20261117.test.ts",
    "src/test/premiumCardHierarchy20261117.test.tsx",
    "src/test/dashboardCardContrast20261119.test.ts",
    "src/test/inverseMainSurfaceAudit20261119.test.ts",
    "src/test/authenticatedDarkAllRoutesAudit20261119.test.ts",
    "src/test/premiumInstitutionFooter20261118.test.ts",
    "src/test/protocolPremiumTabs20261118.test.tsx",
    "src/test/processTableLegibility20261118.test.tsx",
    "src/test/topbarProcessShortcutContrast20261118.test.tsx",
    "src/test/protocolCompactHeader20261118.test.ts",
    "src/test/landingDemoPremiumContrast20261118.test.tsx",
    "src/test/financeSharedPremium20261118.test.tsx",
    "src/test/financeScreenshotContrast20261118.test.tsx",
    "src/test/financeOfficialProcessLedger20261118.test.ts",
    "src/test/navigationVisualContinuity20261118.test.tsx",
    "src/test/browserToolbarRefreshContinuity20261118.test.ts",
    "src/test/firstRefreshAfterTabSwitch20261119.test.tsx",
    "src/test/privateFrameFirstPaintPrefetch20261118.test.ts",
    "src/test/refreshAuthHydrationF5Regression.test.tsx",
    "src/test/avatarF5SessionContinuity20261116.test.tsx",
    "src/test/verifiedAvatarRetentionAcrossRefresh.test.tsx",
    "src/test/masterAvatarNavigationStabilityQa.test.ts",
    "src/test/masterInstitutionalGovernance20261119.test.ts",
    "src/test/refreshVisualContinuity.test.ts",
    "src/test/staticInPlaceRefresh20261118.test.ts",
    "src/test/municipalMultiDepartmentStaff20261118.test.ts",
    "src/test/municipalStaffLegacyAssignment20261119.test.tsx",
    "src/test/municipalUserRegistryPhoto20261119.test.tsx",
    "src/test/f5ActualRouteFirstPaintRegression.test.ts",
    "src/components/platform/PermissionRoute.test.tsx",
    "src/test/protocolRegistrationSource20261117.test.ts",
    "src/test/processPersonalUnitFilters20261117.test.tsx",
    "src/test/unifiedMunicipalProcessWorkspace20261117.test.tsx",
    "src/components/platform/CompactProcessRegistry.test.tsx",
    "src/test/municipalProcessRegistry.test.ts",
    "src/test/municipalProcessRegistryAuthoritativeSync.test.ts",
    "src/test/municipalAdminProtocolReadOnlyQa.test.ts",
    "src/test/processPresentationRegression.test.ts",
    "src/test/officialProcessRowsRender.test.tsx",
    "src/test/municipalAdminAndProfessionalProcessRegression.test.ts",
    "src/test/processCardContrastRegression.test.ts",
    "src/test/processCardGeometryRegression.test.ts",
    "src/test/dashboardSummaryNavigationRegression.test.tsx",
    "src/test/municipalExpandableList.test.ts",
    "src/test/municipalOverviewSubpagesQa.test.tsx",
    "src/test/processNavigationOrganogramRegression.test.ts",
    "src/test/tenantAdminPremiumWorkspace.test.ts",
    "src/test/processWorkspaceMockupParity20261116.test.ts",
    "src/test/singleLineProcessLayout20261116.test.ts",
    "src/test/referenceProcessLayoutFidelity20261116.test.tsx",
    "src/test/processDetailHeroPremiumQa20261117.test.tsx",
    "src/test/publicLoginVersionAuthQa20261117.test.ts",
    "src/test/navigationDocumentSwCacheRegression.test.ts",
    "src/test/previewF5NavigationPreload20261118.test.ts",
    "src/test/serviceWorker.test.ts",
    "src/test/productionAssetFreshnessRegression.test.ts",
    "src/test/productionParityCriticalRegression.test.ts",
  ]);
  console.log("[SIGAPRO_QA_BUILD_GATE] PASS unified municipal process-control preview checks.");
}
if(process.env.VERCEL_ENV==="preview"&&process.env.VERCEL_GIT_COMMIT_REF===BRANCH){
  // Only local static checks; none of these routines call a real provider.
  run("typecheck",["node_modules/typescript/bin/tsc","-p","tsconfig.app.json","--noEmit"]);
  run("eslint",["node_modules/eslint/bin/eslint.js","."]);
  run("proof-control-tests",["--test","scripts/qa-commercial-acceptance.test.mjs","scripts/qa-commercial-evidence-provenance.test.mjs","scripts/qa-r2-original-bytes.test.mjs","scripts/qa-r2-dam-exact-recovery.test.mjs","scripts/qa-visual-provider-config.test.mjs"]);
  run("focused-tests",["node_modules/vitest/vitest.mjs","run",
      "--maxWorkers=2",...TESTS]);
  // Best-effort inspection; missing private credentials do not count as acceptance.
  // A concrete mismatch between stored PDF bytes and its immutable SHA fails closed.
  // Restore a missing archived original only from an existing same-city PDF
  // with the identical immutable SHA-256; never substitute a new PDF.
  run("qa-original-dam-exact-sha-forensics",["scripts/qa-r2-dam-exact-recovery.mjs"]);
  // Configuration discovery does not contact or spend from an AI service.
  run("qa-visual-ai-provider-configuration",["scripts/qa-visual-provider-config.mjs"]);
  run("read-only-r2-original-byte-integrity",["scripts/qa-r2-original-bytes.mjs"]);
  // Real isolated R2 PUT/HEAD/GET/sha256/DELETE on a disposable QA key.
  // Never writes into a municipal document prefix or production bucket.
  run("live-qa-r2-byte-roundtrip-and-cleanup",["scripts/qa-r2-roundtrip.mjs"]);
  // One deliberately marked, single-build QA test; never call a chargeable
  // external vision model in ordinary CI, every-preview builds or production.
  const marked=String(process.env.VERCEL_GIT_COMMIT_MESSAGE||"").includes("[visual-qa-once]") ||
    String(spawnSync("git",["log","-1","--pretty=%s"],{
      cwd:process.cwd(),encoding:"utf8",
    }).stdout||"").includes("[visual-qa-once]");
  if(marked){
    run("single-real-Claude-vision-on-qa-synthetic-pdf",[
      "node_modules/vitest/vitest.mjs","run",
      "server/qa-live-visual-once.test.ts","--maxWorkers=1",
    ],{SIGAPRO_QA_REAL_VISUAL_PROBE_ONCE:"true"});
  }

  // Explicitly opted-in, one-shot alternate free-eligible provider evidence.
  // It may perform one real Workers AI PDF-text request only on a marker
  // commit and a synthetic QA R2 object. It is NOT a CAD visual proof.
  const cfMarked=String(process.env.VERCEL_GIT_COMMIT_MESSAGE||"").includes("[cf-text-qa-once]") ||
    String(spawnSync("git",["log","-1","--pretty=%s"],{
      cwd:process.cwd(),encoding:"utf8",
    }).stdout||"").includes("[cf-text-qa-once]");
  if(cfMarked){
    run("single-real-Cloudflare-PDF-text-on-qa-synthetic-pdf",[
      "node_modules/vitest/vitest.mjs","run",
      "server/qa-live-cloudflare-text-once.test.ts","--maxWorkers=1",
    ],{SIGAPRO_QA_REAL_CF_TEXT_PROBE_ONCE:"true"});
  }

  console.log("[SIGAPRO_QA_BUILD_GATE] PASS focused preview gate; "+
    "commercial E2E/official regulation/bank confirmation remain separately required.");
}
