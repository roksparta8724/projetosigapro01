import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {inspectConfig,checkR2QaRoundtrip} from "../../scripts/qa-r2-roundtrip.mjs";
const script=readFileSync("scripts/qa-r2-roundtrip.mjs","utf8");
const env={
 VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",
 SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:"postgresql://sigapro_qa_webhook_worker:synthetic@ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923?sslmode=require",
 VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",
 SIGAPRO_QA_RECOVERY_R2_ENABLED:"true",SIGAPRO_QA_RECOVERY_R2_ENDPOINT:"https://"+ "a".repeat(32)+".r2.cloudflarestorage.com",
 SIGAPRO_QA_RECOVERY_R2_BUCKET:"sigapro-qa-recovery-test",SIGAPRO_QA_RECOVERY_R2_ACCESS_KEY_ID:"synthetic-qa-key",SIGAPRO_QA_RECOVERY_R2_SECRET_ACCESS_KEY:"synthetic-qa-secret",
 R2_BUCKET_DOCUMENTOS:"institutional-bucket",R2_ACCESS_KEY_ID:"synthetic-prod-key",R2_SECRET_ACCESS_KEY:"synthetic-prod-secret",
};
function mockStore(corruptRestore=false){
 const objects=new Map<string,{body:Buffer;metadata:Record<string,string>}>();
 const operations:string[]=[];
 let writes=0;
 return {objects,operations,client:{async send(command:{constructor:{name:string};input:Record<string,unknown>}){
  const key=String(command.input.Key),op=command.constructor.name;operations.push(op);
  if(op==="PutObjectCommand"){
   if(objects.has(key)||command.input.IfNoneMatch!=="*")throw Error("overwrite");
   writes++;const body=Buffer.from(command.input.Body as Uint8Array);
   if(corruptRestore&&writes===3)body[10]^=1;
   objects.set(key,{body,metadata:command.input.Metadata as Record<string,string>});return {};
  }
  if(op==="DeleteObjectCommand"){objects.delete(key);return {};}
  const obj=objects.get(key);
  if(!obj)throw Object.assign(Error("missing"),{name:"NotFound"});
  if(op==="HeadObjectCommand")return {ContentLength:obj.body.length,ContentType:"application/pdf",Metadata:obj.metadata};
  if(op==="GetObjectCommand")return {Body:(async function*(){yield obj.body;})()};
  throw Error("unknown operation");
 }}};
}
describe("R2 QA live-byte backup and recovery gate",()=>{
 it("requires the current isolated QA, independent bucket and explicit permission",()=>{
  expect(inspectConfig(env)).toBe("READY");
  for(const patch of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},{VITE_SIGAPRO_NEON_ISOLATED:"false"},
   {SIGAPRO_QA_RECOVERY_R2_ENABLED:"false"},{SIGAPRO_QA_RECOVERY_R2_BUCKET:env.R2_BUCKET_DOCUMENTOS},
   {SIGAPRO_QA_RECOVERY_R2_ACCESS_KEY_ID:env.R2_ACCESS_KEY_ID},{SIGAPRO_QA_RECOVERY_R2_SECRET_ACCESS_KEY:env.R2_SECRET_ACCESS_KEY},
   {SIGAPRO_QA_RECOVERY_R2_ACCESS_KEY_ID:""}])
    expect(inspectConfig({...env,...patch})).not.toBe("READY");
 });
 it("backs up, deletes and restores identical bytes, then removes both fixtures",async()=>{
  const s=mockStore();
  expect(await checkR2QaRoundtrip(env,s.client)).toBe("PASS");
  expect(s.operations.filter(x=>x==="PutObjectCommand")).toHaveLength(3);
  expect(s.objects.size).toBe(0);
 });
 it("rejects corrupted restore and cleans up",async()=>{
  const s=mockStore(true);
  expect(await checkR2QaRoundtrip(env,s.client)).toBe("FAIL_STORAGE_ROUNDTRIP");
  expect(s.objects.size).toBe(0);
 });
 it("never calls storage for invalid config",async()=>{
  const s=mockStore();
  expect(await checkR2QaRoundtrip({...env,SIGAPRO_QA_RECOVERY_R2_ENABLED:"false"},s.client)).toBe("NOT_VERIFIED_CONFIG");
  expect(s.operations).toHaveLength(0);
 });
 it("cannot pass an unverified command-line recovery",()=>{
  expect(script).toContain('if(status!=="PASS")process.exitCode=2');
  expect(script).toContain("FAIL_CLEANUP");
 });
});
