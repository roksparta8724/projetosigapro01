import {describe,it,expect,vi,afterEach} from "vitest";
import {encryptStorageCredentials,decryptStorageCredentials,normalizeStorageEndpoint,testMunicipalStorageConnection} from "./municipal-storage";
import type {S3Client} from "@aws-sdk/client-s3";
const endpoint="https://"+"a".repeat(32)+".r2.cloudflarestorage.com";
const city="11111111-1111-4111-8111-111111111111";
const scope={municipalityId:city,endpoint};
afterEach(()=>vi.unstubAllEnvs());
describe("Municipal storage setup v2",()=>{
 it("binds encrypted credentials to tenant and endpoint, rejects substitutions",()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","a".repeat(64));
  const cred={accessKeyId:"fake-access",secretAccessKey:"fake-secret"};
  const ciphertext=encryptStorageCredentials(cred,scope);
  expect(ciphertext).not.toContain("fake-secret");
  expect(decryptStorageCredentials(ciphertext,scope)).toEqual(cred);
  expect(()=>decryptStorageCredentials(ciphertext,{...scope,municipalityId:"22222222-2222-4222-8222-222222222222"})).toThrow();
  expect(()=>decryptStorageCredentials(ciphertext,{...scope,endpoint:"https://s3.amazonaws.com"})).toThrow();
 });
 it("restricts server network destinations",()=>{
  expect(normalizeStorageEndpoint(endpoint)).toBe(endpoint);
  expect(normalizeStorageEndpoint("https://s3.us-east-1.amazonaws.com")).toBe("https://s3.us-east-1.amazonaws.com");
  for(const v of ["https://127.0.0.1","https://169.254.169.254","https://s3.amazonaws.com.evil.example","https://user@s3.amazonaws.com","https://s3.amazonaws.com/path"])expect(()=>normalizeStorageEndpoint(v)).toThrow();
 });
 it("requires actual readback and successful cleanup, not merely PUT",async()=>{
  let bytes:Buffer|undefined;
  const send=vi.fn(async(cmd:{constructor:{name:string};input:{Body?:Buffer}})=>{
   if(cmd.constructor.name==="PutObjectCommand"){bytes=cmd.input.Body;return {};}
   if(cmd.constructor.name==="GetObjectCommand")return {ContentLength:bytes!.length,ContentType:"text/plain",Body:(async function*(){yield bytes!;})()};
   if(cmd.constructor.name==="DeleteObjectCommand"){bytes=undefined;return {};}
   if(cmd.constructor.name==="HeadObjectCommand")throw Object.assign(Error("not found"),{$metadata:{httpStatusCode:404}});
   throw Error("unexpected");
  });
  const config={municipality_id:city,bucket_documents:"qa-storage-test"};
  await expect(testMunicipalStorageConnection(config,{send} as unknown as S3Client)).resolves.toMatchObject({ok:true});
  expect(send.mock.calls.map(([cmd])=>cmd.constructor.name)).toEqual(["PutObjectCommand","GetObjectCommand","DeleteObjectCommand","HeadObjectCommand"]);
  const bad=vi.fn(async(cmd:{constructor:{name:string}})=>{if(cmd.constructor.name==="DeleteObjectCommand")throw Error("denied");return {};});
  await expect(testMunicipalStorageConnection(config,{send:bad} as unknown as S3Client)).rejects.toThrow();
 });
});
