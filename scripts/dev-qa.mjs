/**
 * Isolated municipal collection QA server.
 * Separate from localhost:8080 and the production Neon credentials.
 * Public Neon branch URLs only; no keys, tokens or municipal secrets here.
 * Neon Auth accepts allow_localhost=true; use localhost, not 127.0.0.1,
 * otherwise Better Auth rejects the sign-in with "Invalid origin".
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadOrCreateQaPaymentSecret } from "./qa-payment-secret.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const qaBranchAuth = "https://ep-misty-breeze-b4ri8ig0.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";
const qaBranchData = "https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";
const authEndpoint = new URL(qaBranchAuth).hostname.split(".")[0];
const dataEndpoint = new URL(qaBranchData).hostname.split(".")[0];
if (authEndpoint !== dataEndpoint || !authEndpoint.startsWith("ep-")) {
  throw new Error("Neon Auth and Data API must belong to the same isolated QA branch.");
}
// A payment key inherited from another environment must never be used here.
// --check validates the launcher without creating secrets on disk.
const paymentSecret = process.argv.includes("--check")
  ? null
  : loadOrCreateQaPaymentSecret({ dataApiUrl: qaBranchData });
const env = {
  ...process.env,
  MUNICIPAL_PAYMENT_MASTER_KEY: paymentSecret?.secret ?? "",
  NODE_ENV: "development",
  VERCEL_ENV: "development",
  SIGAPRO_LOCAL_QA_LAUNCH: "true",
  VITE_BACKEND: "neon",
  VITE_SIGAPRO_NEON_ISOLATED: "true",
  VITE_NEON_AUTH_URL: qaBranchAuth,
  VITE_NEON_DATA_API_URL: qaBranchData,
  VITE_SIGAPRO_QA_READINESS_BANNER: "true",
  // QA must never issue a real payment or upload into a potentially production R2.
  SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES: "true",
};

if (process.argv.includes("--check")) {
  console.log("SIGAPRO: QA branch configured; URL: http://localhost:8081");
  console.log("No production changes. Live charge and R2 writes are disabled.");
  console.log("QA payment key is provisioned privately on launch (never printed).");
} else {
  console.log("[SIGAPRO][QA] Chave bancária local isolada configurada e preservada entre reinicializações.");
  const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteCli, "--host", "localhost", "--port", "8081", "--strictPort"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", (error) => {
    console.error("Falha ao iniciar ambiente isolado:", error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}
