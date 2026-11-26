import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { verifySandboxDetachedCms,assertDetachedSha256Cms,type CmsTrustBundle } from "./certified-cms-preflight";
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
 it("rejects a revoked leaf even when cryptographic signature still matches",()=>{
  run(["ca","-config","ca.cnf","-revoke","leaf.pem"]);
  run(["ca","-config","ca.cnf","-gencrl","-out","revoked.crl"]);
  const v=input();
  expect(()=>verifySandboxDetachedCms({...v,trust:{...v.trust,crlsPem:read("revoked.crl")}})).toThrow("CMS_REVOCATION_OR_CHAIN_INVALID");
 });
});
