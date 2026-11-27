import {beginIcpSandboxSession,bindIcpSandboxSession} from "./certified-icp-session-adapter";
import {createItiSandboxAuthorization} from "./iti-signature-sandbox";
import {completeIcpSandboxCandidate} from "./certified-icp-sandbox-worker";
import {archiveIcpSandboxCandidate} from "./certified-icp-candidate-archive";
import type {PreparedSignatureRange} from "./certified-pdf-byte-range";
import type {ApiReq} from "./municipal-storage";
import type {S3Client} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { verifySandboxDetachedCms,assertDetachedSha256Cms,assertIcpPersonCertificateIdentity,verifySandboxIcpPersonCms,type CmsTrustBundle } from "./certified-cms-preflight";
const sha=(v:string|Uint8Array)=>createHash("sha256").update(v).digest("hex");
let dir:string, root:string, leaf:string, crl:string, signature:Buffer, attached:Buffer, sha1:Buffer;
const content=Buffer.from("SIGAPRO QA detached signature bytes");
const run=(args:string[])=>execFileSync("openssl",args,{cwd:dir,timeout:15000,stdio:["ignore","pipe","pipe"]});
const read=(name:string)=>readFileSync(join(dir,name),"utf8");
beforeAll(()=>{
 dir=mkdtempSync(join(tmpdir(),"sigapro-cms-test-"));
 mkdirSync(join(dir,"newcerts"));
 for(const [name,value] of [["index.txt",""],["serial","1000\n"],["crlnumber","1000\n"]])writeFileSync(join(dir,name),value);
 writeFileSync(join(dir,"ca.cnf"),`[ca]
default_ca=ca_default
[ca_default]
dir=.
database=$dir/index.txt
new_certs_dir=$dir/newcerts
certificate=$dir/ca.pem
private_key=$dir/ca.key
serial=$dir/serial
crlnumber=$dir/crlnumber
default_md=sha256
default_days=2
default_crl_days=2
policy=policy_any
x509_extensions=leaf
[policy_any]
commonName=supplied
[leaf]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
subjectAltName=otherName:2.16.76.1.3.1;UTF8:010119905299822472500000000000000000000000000000000000
`);
 run(["req","-x509","-newkey","rsa:2048","-nodes","-days","2","-subj","/CN=SIGAPRO QA root","-addext","basicConstraints=critical,CA:TRUE","-addext","keyUsage=critical,keyCertSign,cRLSign","-keyout","ca.key","-out","ca.pem"]);
 run(["req","-new","-newkey","rsa:2048","-nodes","-subj","/CN=SIGAPRO QA signer","-keyout","leaf.key","-out","leaf.csr"]);
 run(["ca","-batch","-config","ca.cnf","-in","leaf.csr","-out","leaf.pem","-notext"]);
 run(["ca","-config","ca.cnf","-gencrl","-out","ca.crl"]);
 root=read("ca.pem");leaf=read("leaf.pem");crl=read("ca.crl");
 writeFileSync(join(dir,"input.bin"),content);
 const sign=(name:string,extra:string[])=>{
   run(["cms","-sign","-binary","-in","input.bin","-signer","leaf.pem","-inkey","leaf.key","-outform","DER","-out",name,...extra]);
   return readFileSync(join(dir,name));
 };
 signature=sign("detached.der",["-md","sha256"]);attached=sign("attached.der",["-md","sha256","-nodetach"]);sha1=sign("sha1.der",["-md","sha1"]);
},30000);
afterAll(()=>{if(dir)rmSync(dir,{recursive:true,force:true});});
function input(){
 const trust:CmsTrustBundle={mode:"govbr",environment:"sandbox",rootsPem:root,rootsSha256:sha(root),intermediatesPem:"",crlsPem:crl};
 return {mode:"govbr" as const,coveredBytes:content,expectedByteRangeSha256:sha(content),cmsDer:signature,expectedProviderCertificatePem:leaf,trust};
}
describe("CMS independent crypto preflight with real ephemeral QA certificates",()=>{
 it("verifies detached SHA-256 signature, pinned chain and CRL, without authorizing issuance",()=>{
  const result=verifySandboxDetachedCms(input());
  expect(result.cryptographicPreflightPassed).toBe(true);
  expect(result.issuanceAuthorized).toBe(false);
  expect(result.identityVerified).toBe(false);
  expect(result.coveredBytesSha256).toBe(sha(content));
 });
 it("rejects attached content, weak digest and trailing DER",()=>{
  expect(()=>assertDetachedSha256Cms(attached)).toThrow("CMS_NOT_DETACHED");
  expect(()=>assertDetachedSha256Cms(sha1)).toThrow("CMS_DIGEST_NOT_SHA256");
  expect(()=>assertDetachedSha256Cms(Buffer.concat([signature,Buffer.from([0])]))).toThrow("CMS_DER_INVALID");
 });
 it("rejects tampering even when attacker recalculates the content hash",()=>{
  const changed=Buffer.from("modified bytes");
  expect(()=>verifySandboxDetachedCms({...input(),coveredBytes:changed,expectedByteRangeSha256:sha(changed)})).toThrow("CMS_SIGNATURE_OR_CHAIN_INVALID");
  expect(()=>verifySandboxDetachedCms({...input(),expectedByteRangeSha256:"0".repeat(64)})).toThrow("CMS_DOCUMENT_HASH_MISMATCH");
 });
 it("rejects trust substitution, missing CRL and wrong modality",()=>{
  const v=input();
  expect(()=>verifySandboxDetachedCms({...v,trust:{...v.trust,rootsSha256:"0".repeat(64)}})).toThrow("CMS_TRUST_INVALID");
  expect(()=>verifySandboxDetachedCms({...v,trust:{...v.trust,crlsPem:""}})).toThrow("CMS_TRUST_INVALID");
  expect(()=>verifySandboxDetachedCms({...v,mode:"icp_brasil"})).toThrow("CMS_TRUST_INVALID");
 });
 it("validates ICP natural-person CPF from real certificate DER, not its common name",()=>{
  const expected=assertIcpPersonCertificateIdentity(leaf,"529.982.247-25");
  expect(expected.identityVerified).toBe(true);
  expect(Object.keys(expected).sort()).toEqual(["certificateSha256","identityVerified"]);
  expect(()=>assertIcpPersonCertificateIdentity(leaf,"111.444.777-35")).toThrow("CMS_CERT_IDENTITY_MISMATCH");
  expect(()=>assertIcpPersonCertificateIdentity(leaf,"00000000000")).toThrow("CMS_CPF_INVALID");
  const v=input();
  const result=verifySandboxIcpPersonCms({...v,mode:"icp_brasil",trust:{...v.trust,mode:"icp_brasil"},expectedProfileCpf:"52998224725"});
  expect(result.identityVerified).toBe(true);
  expect(result.pdfPolicyVerified).toBe(false);
  expect(result.issuanceAuthorized).toBe(false);
  expect(()=>verifySandboxIcpPersonCms({...v,expectedProfileCpf:"52998224725"})).toThrow("CMS_CERT_IDENTITY_PROFILE_UNSUPPORTED");
 });
 it("rejects common-name-only and corporate certificate identity",()=>{
  for(const [name,extension] of [["cn-only",null],["corporate","subjectAltName=otherName:2.16.76.1.3.4;UTF8:010119905299822472500000000000000000000000000000000000"]]){
    run(["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=52998224725","-addext","basicConstraints=critical,CA:FALSE",...(extension?["-addext",extension]:[]),"-keyout",name+".key","-out",name+".pem"]);
    expect(()=>assertIcpPersonCertificateIdentity(read(name+".pem"),"52998224725")).toThrow(/CMS_CERT_(IDENTITY|PERSON_TYPE)/);
  }
 });
 it("integrates actual OAuth transport, authenticated session adapter, real CMS/CRL and verified archive with synthetic external services",async()=>{
  const city="11111111-1111-4111-8111-111111111111",profile="22222222-2222-4222-8222-222222222222";
  const processId="33333333-3333-4333-8333-333333333333",requestId="44444444-4444-4444-8444-444444444444";
  const config={municipalityId:city,clientId:"synthetic-client",clientSecret:"synthetic-secret",redirectUri:"https://example.invalid/callback"};
  const authorization=createItiSandboxAuthorization(config,"icp_brasil");
  const authUrl=new URL(authorization.url);
  expect(authUrl.searchParams.get("scope")).toBe("sign icp_brasil");
  expect(authUrl.searchParams.get("state")).toBe(authorization.state);
  // Complete synthetic PDF with catalog, page, form field, signature dictionary and xref.
  const objects=[
   "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /SigFlags 3 >> >>",
   "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
   "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Annots [4 0 R] >>",
   "<< /Type /Annot /Subtype /Widget /FT /Sig /T (QA Synthetic) /Rect [0 0 0 0] /P 3 0 R /V 5 0 R /F 4 >>",
   "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents <"+"0".repeat(16384)+"> >>"
  ];
  let raw="%PDF-1.7\n";const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(raw.length);raw+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";}
  const xref=raw.length;
  raw+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(x=>String(x).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  const first=raw.indexOf("/Contents <")+10,end=first+16386;
  const range:PreparedSignatureRange=[0,first,end,raw.length-end];
  const pdf=Buffer.from(raw.replace("0000000000 0000000000 0000000000 0000000000",range.map(n=>String(n).padStart(10,"0")).join(" ")),"ascii");
  const covered=Buffer.concat([pdf.subarray(0,first),pdf.subarray(end)]);
  const preparedPdfSha256=sha(pdf),byteRangeSha256=sha(covered);
  writeFileSync(join(dir,"workflow-covered.bin"),covered);
  run(["cms","-sign","-binary","-in","workflow-covered.bin","-signer","leaf.pem","-inkey","leaf.key","-outform","DER","-out","workflow.der","-md","sha256"]);
  const cms=readFileSync(join(dir,"workflow.der"));
  const binding={state:authorization.state,municipalityId:city,profileId:profile,preparedPdfSha256,byteRangeSha256};
  const start={...binding,nonce:authorization.nonce,processId,requestId,artifactType:"construction_permit" as const,signerSlot:"diretoria" as const};
  const session={...start,mode:"icp_brasil" as const,environment:"sandbox" as const};
  const req={headers:{authorization:"Bearer synthetic-token"}} as ApiReq;
  const api="https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";
  const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",VITE_NEON_DATA_API_URL:api,R2_AUTH_DATA_API_URL:api,VITE_NEON_AUTH_URL:"https://ep-misty-breeze-b4ri8ig0.neonauth.c-6.us-east-2.aws.neon.tech/synthetic/auth",SIGAPRO_BANK_CHARGE_SIGNING_SECRET:"1".repeat(64),SIGAPRO_QA_CERTIFIED_ARCHIVE_ENABLED:"true",SIGAPRO_QA_CERTIFIED_BUCKET:"sigapro-qa-certified-fixture",SIGAPRO_QA_CERTIFIED_R2_ACCOUNT_ID:"a".repeat(32),SIGAPRO_QA_CERTIFIED_R2_ACCESS_KEY_ID:"synthetic-qa-id",SIGAPRO_QA_CERTIFIED_R2_SECRET_ACCESS_KEY:"synthetic-qa-secret"};
  const events:string[]=[];
  let began=false,consumed=false;
  const provider=vi.fn(async(input:URL|string|Request,init?:RequestInit)=>{
   const url=new URL(String(input));
   if(url.href===api+"/rpc/certified_icp_session_command_v1"){
    const packet=JSON.parse(String(init?.body));const body=JSON.parse(Buffer.from(packet._payload,"base64").toString("utf8"));
    expect(body).toMatchObject(binding);expect(packet._mac).toMatch(/^[a-f0-9]{64}$/);
    const action=packet._action;events.push("neon:"+action);
    if(action==="begin"&&!began){began=true;return Response.json({ok:true,environment:"sandbox",issuanceAuthorized:false});}
    if(action==="consume"&&began&&!consumed){consumed=true;return Response.json(session);}
    if(action==="reauthorize"&&consumed)return Response.json({municipalityId:city,profileId:profile,cpf:"52998224725"});
    return Response.json({message:"synthetic rejection"},{status:403});
   }
   if(url.hostname==="cas.staging.iti.br"&&url.pathname.endsWith("/token")){
    events.push("iti:token");const form=new URLSearchParams(String(init?.body));expect(form.get("code")).toBe("synthetic-code");return Response.json({access_token:"synthetic-access",token_type:"bearer"});
   }
   if(url.hostname==="assinatura-api.staging.iti.br"&&url.pathname.endsWith("/certificadoPublico")){events.push("iti:certificate");return new Response(leaf);}
   if(url.hostname==="assinatura-api.staging.iti.br"&&url.pathname.endsWith("/assinarPKCS7")){
    events.push("iti:cms");expect(JSON.parse(String(init?.body)).hashBase64).toBe(Buffer.from(byteRangeSha256,"hex").toString("base64"));return new Response(new Uint8Array(cms));
   }
   throw Error("Unexpected network destination: "+url.hostname);
  });
  let stored:Buffer|undefined;
  const client={send:vi.fn(async(cmd:{constructor:{name:string};input:Record<string,unknown>})=>{
   if(cmd.constructor.name==="PutObjectCommand"){
    events.push("archive:put");expect(cmd.input.IfNoneMatch).toBe("*");
    if(stored)throw Object.assign(Error("existing"),{$metadata:{httpStatusCode:412}});
    stored=Buffer.from(cmd.input.Body as Uint8Array);return {};
   }
   if(cmd.constructor.name==="GetObjectCommand"){events.push("archive:get");return {ContentLength:stored!.length,ContentType:"application/pdf",Body:(async function*(){yield stored!;})()};}
   throw Error("Unexpected storage action");
  })} as unknown as S3Client;
  try{
   for(const [k,v] of Object.entries(env))vi.stubEnv(k,v);
   vi.stubGlobal("fetch",provider);
   await beginIcpSandboxSession(req,start);
   const deps={...bindIcpSandboxSession(req,binding),readPreparedPdf:async()=>({bytes:pdf,range}),readMunicipalSandboxConfig:async()=>config,readTrustBundle:async():Promise<CmsTrustBundle>=>({mode:"icp_brasil",environment:"sandbox",rootsPem:root,rootsSha256:sha(root),intermediatesPem:"",crlsPem:crl})};
   const candidate=await completeIcpSandboxCandidate(deps,{...binding,code:"synthetic-code"});
   const archive=await archiveIcpSandboxCandidate(candidate,env,client);
   expect(archive).toMatchObject({archiveVerified:true,issuanceAuthorized:false,pdfPolicyVerified:false});
   expect(sha(stored!)).toBe(archive.sha256);
   const storedCovered=Buffer.concat([stored!.subarray(0,first),stored!.subarray(end)]);
   expect(storedCovered).toEqual(covered);
   const embedded=Buffer.from(stored!.subarray(first+1,first+1+cms.length*2).toString("ascii"),"hex");
   expect(embedded).toEqual(cms);
   expect(verifySandboxIcpPersonCms({mode:"icp_brasil",coveredBytes:storedCovered,expectedByteRangeSha256:byteRangeSha256,cmsDer:embedded,expectedProviderCertificatePem:leaf,trust:await deps.readTrustBundle(),expectedProfileCpf:"52998224725"}).identityVerified).toBe(true);
   expect(events).toEqual(["neon:begin","neon:consume","neon:reauthorize","iti:token","iti:certificate","iti:cms","neon:reauthorize","archive:put","archive:get"]);
   const replay=bindIcpSandboxSession(req,binding);
   await expect(completeIcpSandboxCandidate({...deps,...replay},{...binding,code:"synthetic-code"})).rejects.toThrow("ITI_SESSION_NOT_AUTHORIZED");
   expect(events.filter(x=>x==="iti:cms")).toHaveLength(1);
   expect(await archiveIcpSandboxCandidate(candidate,env,client)).toEqual(archive);
  }finally{vi.unstubAllGlobals();vi.unstubAllEnvs();}
 },30000);
 it("rejects a revoked leaf even when cryptographic signature still matches",()=>{
  run(["ca","-config","ca.cnf","-revoke","leaf.pem"]);
  run(["ca","-config","ca.cnf","-gencrl","-out","revoked.crl"]);
  const v=input();
  expect(()=>verifySandboxDetachedCms({...v,trust:{...v.trust,crlsPem:read("revoked.crl")}})).toThrow("CMS_REVOCATION_OR_CHAIN_INVALID");
 });
});
