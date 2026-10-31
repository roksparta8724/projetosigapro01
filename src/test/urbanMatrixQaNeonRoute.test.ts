import {afterEach,describe,expect,it,vi} from "vitest";
import {getDataApiUrl} from "../../server/municipal-storage";
const prod="https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";
const qa="https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";
const qaAuth="https://ep-misty-breeze-b4ri8ig0.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";
afterEach(()=>vi.unstubAllEnvs());
describe("Neon matrix preview is fail-closed and never writes into production",()=>{
 it("production host always uses pinned production URL, irrespective of QA variables",()=>{
  vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED","true");
  vi.stubEnv("VITE_NEON_DATA_API_URL",qa);vi.stubEnv("VITE_NEON_AUTH_URL",qaAuth);
  vi.stubEnv("R2_AUTH_DATA_API_URL",qa);
  expect(getDataApiUrl()).toBe(prod);
 });
 it("valid QA preview routes only to paired QA Neon Data API",()=>{
  vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("NODE_ENV","production");
  vi.stubEnv("VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED","true");
  vi.stubEnv("VITE_NEON_DATA_API_URL",qa);vi.stubEnv("VITE_NEON_AUTH_URL",qaAuth);
  vi.stubEnv("R2_AUTH_DATA_API_URL",qa);
  expect(getDataApiUrl()).toBe(qa);
 });
 it("rejects preview QA with stale official / different data endpoint",()=>{
  vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("NODE_ENV","production");
  vi.stubEnv("VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED","true");
  vi.stubEnv("VITE_NEON_DATA_API_URL",qa);vi.stubEnv("VITE_NEON_AUTH_URL",qaAuth);
  vi.stubEnv("R2_AUTH_DATA_API_URL",prod);
  expect(()=>getDataApiUrl()).toThrow("mesma branch NÃO produtiva");
 });
 it("rejects preview flag with official branch or missing QA auth",()=>{
  vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("NODE_ENV","production");
  vi.stubEnv("VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED","true");
  vi.stubEnv("VITE_NEON_AUTH_URL","");
  vi.stubEnv("VITE_NEON_DATA_API_URL",prod);vi.stubEnv("R2_AUTH_DATA_API_URL",prod);
  expect(()=>getDataApiUrl()).toThrow();
 });
});
