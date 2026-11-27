import { createHash, X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Mode = "govbr" | "icp_brasil";
export type CmsTrustBundle = {
  mode: Mode;
  environment: "sandbox";
  rootsPem: string;
  rootsSha256: string;
  intermediatesPem: string;
  crlsPem: string;
};
const MAX_PDF = 32 * 1024 * 1024;
const MAX_CMS = 1024 * 1024;
const MAX_PEM = 4 * 1024 * 1024;
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
type Tlv = { tag: number; value: Buffer };
function readTlv(bytes: Buffer, offset: number): { item: Tlv; next: number } {
  if (offset + 2 > bytes.length) throw Error("CMS_DER_INVALID");
  const tag = bytes[offset++];
  if ((tag & 31) === 31) throw Error("CMS_DER_INVALID");
  let len = bytes[offset++];
  if (len >= 128) {
    const count = len & 127;
    if (!count || count > 4 || offset + count > bytes.length || bytes[offset] === 0) throw Error("CMS_DER_INVALID");
    len = 0;
    for (let i = 0; i < count; i++) len = len * 256 + bytes[offset++];
    if (len < 128) throw Error("CMS_DER_INVALID");
  }
  const next = offset + len;
  if (next > bytes.length) throw Error("CMS_DER_INVALID");
  return { item: { tag, value: bytes.subarray(offset, next) }, next };
}
function children(item: Tlv, tag: number): Tlv[] {
  if (item.tag !== tag) throw Error("CMS_DER_INVALID");
  const out: Tlv[] = [];
  for (let i = 0; i < item.value.length;) {
    if (out.length >= 128) throw Error("CMS_DER_INVALID");
    const result = readTlv(item.value, i);
    out.push(result.item); i = result.next;
  }
  return out;
}
function oid(item: Tlv | undefined, hex: string) {
  return item?.tag === 6 && item.value.toString("hex") === hex;
}
function sha256Algorithm(item: Tlv) {
  const v = children(item, 48);
  return oid(v[0], "608648016503040201") && (v.length === 1 || (v.length === 2 && v[1].tag === 5 && !v[1].value.length));
}
/** Strict detached CMS profile: no attached payload, one signer, SHA-256 and
 * signed attributes. Does not parse or trust certificate identities. */
export function assertDetachedSha256Cms(input: Uint8Array) {
  if (!input.length || input.length > MAX_CMS) throw Error("CMS_SIZE_INVALID");
  const bytes = Buffer.from(input);
  const top = readTlv(bytes, 0);
  if (top.next !== bytes.length) throw Error("CMS_DER_INVALID");
  const outer = children(top.item, 48);
  if (outer.length !== 2 || !oid(outer[0], "2a864886f70d010702")) throw Error("CMS_TYPE_INVALID");
  const explicit = children(outer[1], 160);
  if (explicit.length !== 1) throw Error("CMS_DER_INVALID");
  const signed = children(explicit[0], 48);
  if (signed.length < 4 || signed[0].tag !== 2) throw Error("CMS_DER_INVALID");
  const digests = children(signed[1], 49);
  if (digests.length !== 1 || !sha256Algorithm(digests[0])) throw Error("CMS_DIGEST_NOT_SHA256");
  const encap = children(signed[2], 48);
  if (encap.length !== 1 || !oid(encap[0], "2a864886f70d010701")) throw Error("CMS_NOT_DETACHED");
  const infos = children(signed[signed.length - 1], 49);
  if (infos.length !== 1) throw Error("CMS_SIGNER_COUNT_INVALID");
  const signer = children(infos[0], 48);
  if (signer.length < 6 || !sha256Algorithm(signer[2]) || signer[3].tag !== 160) throw Error("CMS_SIGNER_PROFILE_INVALID");
}
function pemCertificates(pem: string, maxCount: number) {
  if (typeof pem !== "string" || Buffer.byteLength(pem) > MAX_PEM) throw Error("CMS_TRUST_INVALID");
  const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  if (!certs.length || certs.length > maxCount || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, "").trim()) throw Error("CMS_TRUST_INVALID");
  return certs.map(s => new X509Certificate(s));
}
function run(args: string[], stage: string) {
  try {
    return execFileSync("openssl", args, { timeout: 15000, maxBuffer: 256 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    // Never return OpenSSL diagnostics, certificate subjects or local file paths to the client.
    throw Error(stage);
  }
}
/** SERVER WORKER ONLY. Requires OpenSSL 3 and a deployment-controlled pinned
 * trust/CRL bundle specific to the mode and sandbox. No network fetching of CRLs.
 * The expected certificate must come from the authorized ITI token, not the browser.
 * This is an independent cryptographic preflight, NOT final PDF/identity/policy
 * validation or permission to issue an official document. */
export function verifySandboxDetachedCms(input: {
  mode: Mode;
  coveredBytes: Uint8Array;
  expectedByteRangeSha256: string;
  cmsDer: Uint8Array;
  expectedProviderCertificatePem: string;
  trust: CmsTrustBundle;
  /** Explicit CAdES certificate-binding gate, not a PAdES compliance claim. */
  requireCades?: boolean;
}) {
  const { trust } = input;
  if (trust.environment !== "sandbox" || trust.mode !== input.mode || !["govbr","icp_brasil"].includes(input.mode) ||
      !/^[a-f0-9]{64}$/.test(trust.rootsSha256) || sha(trust.rootsPem) !== trust.rootsSha256 ||
      typeof trust.crlsPem !== "string" || Buffer.byteLength(trust.crlsPem) > MAX_PEM ||
      !trust.crlsPem.includes("-----BEGIN X509 CRL-----")) throw Error("CMS_TRUST_INVALID");
  const roots = pemCertificates(trust.rootsPem, 20);
  if (roots.some(c => !c.ca)) throw Error("CMS_TRUST_INVALID");
  if (trust.intermediatesPem.trim() && pemCertificates(trust.intermediatesPem, 20).some(c => !c.ca)) throw Error("CMS_TRUST_INVALID");
  const expected = pemCertificates(input.expectedProviderCertificatePem, 1)[0];
  if (expected.ca) throw Error("CMS_SIGNER_CERTIFICATE_INVALID");
  if (!input.coveredBytes.length || input.coveredBytes.length > MAX_PDF ||
      !/^[a-f0-9]{64}$/.test(input.expectedByteRangeSha256) ||
      sha(input.coveredBytes) !== input.expectedByteRangeSha256) throw Error("CMS_DOCUMENT_HASH_MISMATCH");
  assertDetachedSha256Cms(input.cmsDer);
  const dir = mkdtempSync(join(tmpdir(), "sigapro-cms-"));
  try {
    const write = (name: string, content: string | Uint8Array) => {
      const path = join(dir, name); writeFileSync(path, content, { mode: 0o600 }); return path;
    };
    const data = write("content.bin", input.coveredBytes);
    const signature = write("signature.der", input.cmsDer);
    const leaf = write("leaf.pem", expected.toString());
    const chain = write("chain.pem", trust.intermediatesPem);
    const certs = write("candidates.pem", expected.toString() + "\n" + trust.intermediatesPem);
    const ca = write("roots.pem", trust.rootsPem);
    const crl = write("revocation.pem", trust.crlsPem);
    const signer = join(dir, "signer.pem"), output = join(dir, "verified.bin");
    const flags = ["-CAfile", ca, "-no-CApath", "-no-CAstore", "-purpose", "any", "-auth_level", "2"];
    const usage = run(["x509","-in",leaf,"-noout","-ext","keyUsage"],"CMS_KEY_USAGE_INVALID").toString("utf8");
    if (!/\bDigital Signature\b|\bNon Repudiation\b/.test(usage)) throw Error("CMS_KEY_USAGE_INVALID");
    // Only the certificate returned by the provider can be selected as signer;
    // exact leaf fingerprint is checked again below. Trust roots are pinned.
    run(["cms","-verify","-binary","-inform","DER","-in",signature,"-content",data,
      "-nointern","-certfile",certs,...flags,...(input.requireCades===true?["-cades"]:[]),"-signer",signer,"-out",output],input.requireCades===true?"CMS_CADES_SIGNATURE_OR_CHAIN_INVALID":"CMS_SIGNATURE_OR_CHAIN_INVALID");
    const actual = pemCertificates(readFileSync(signer,"utf8"),1)[0];
    if (!actual.raw.equals(expected.raw) || !readFileSync(output).equals(Buffer.from(input.coveredBytes))) throw Error("CMS_SIGNER_OR_CONTENT_MISMATCH");
    // OpenSSL verifies current validity, CRL signatures, CRL validity and
    // revocation for the entire chain. Missing/unavailable CRL fails closed.
    run(["verify",...flags,"-crl_check_all","-CRLfile",crl,
      ...(trust.intermediatesPem.trim() ? ["-untrusted",chain] : []),leaf],"CMS_REVOCATION_OR_CHAIN_INVALID");
    return {
      cryptographicPreflightPassed: true as const,
      environment: "sandbox" as const,
      mode: input.mode,
      certificateSha256: sha(actual.raw),
      coveredBytesSha256: input.expectedByteRangeSha256,
      cmsSha256: sha(input.cmsDer),
      identityVerified: false as const,
      pdfPolicyVerified: false as const,
      issuanceAuthorized: false as const,
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** DOC-ICP-04, subjectAltName otherName 2.16.76.1.3.1 (natural person).
 * No CN, email, textual OpenSSL output, corporate responsible-person CPF,
 * or fallback guess is accepted. The expected CPF must come from the
 * server-authorized municipal signer profile. This does not cover gov.br
 * advanced certificates with a different identity profile. */
function normalizeCpf(value:string){
  if(!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value))throw Error("CMS_CPF_INVALID");
  const cpf=value.replace(/\D/g,"");
  if(/^(\d)\1{10}$/.test(cpf))throw Error("CMS_CPF_INVALID");
  for(const length of [9,10]){
    let sum=0;for(let i=0;i<length;i++)sum+=Number(cpf[i])*(length+1-i);
    const check=(sum*10)%11;
    if((check===10?0:check)!==Number(cpf[length]))throw Error("CMS_CPF_INVALID");
  }
  return cpf;
}
export function assertIcpPersonCertificateIdentity(certificatePem:string,expectedProfileCpf:string){
  const expected=normalizeCpf(expectedProfileCpf);
  const cert=pemCertificates(certificatePem,1)[0];
  if(cert.ca)throw Error("CMS_SIGNER_CERTIFICATE_INVALID");
  const top=readTlv(cert.raw,0);
  if(top.next!==cert.raw.length)throw Error("CMS_CERT_IDENTITY_INVALID");
  const certificate=children(top.item,48);
  if(certificate.length!==3)throw Error("CMS_CERT_IDENTITY_INVALID");
  const tbs=children(certificate[0],48);
  const extensionBlocks=tbs.filter(t=>t.tag===163);
  if(extensionBlocks.length!==1)throw Error("CMS_CERT_IDENTITY_MISSING");
  const wrapper=children(extensionBlocks[0],163);
  if(wrapper.length!==1)throw Error("CMS_CERT_IDENTITY_INVALID");
  const sans=children(wrapper[0],48).map(t=>children(t,48)).filter(t=>oid(t[0],"551d11"));
  if(sans.length!==1)throw Error("CMS_CERT_IDENTITY_MISSING");
  const san=sans[0], octets=san.at(-1);
  if(!octets||octets.tag!==4||![2,3].includes(san.length)||(san.length===3&&san[1].tag!==1))throw Error("CMS_CERT_IDENTITY_INVALID");
  const decoded=readTlv(octets.value,0);
  if(decoded.next!==octets.value.length)throw Error("CMS_CERT_IDENTITY_INVALID");
  const identities:string[]=[];
  for(const name of children(decoded.item,48)){
    if(name.tag!==160)continue;
    const other=children(name,160);
    // 2.16.76.1.3.3 and .4 belong to legal entities; never substitute these.
    if(oid(other[0],"604c010303")||oid(other[0],"604c010304"))throw Error("CMS_CERT_PERSON_TYPE_INVALID");
    if(!oid(other[0],"604c010301"))continue;
    if(other.length!==2)throw Error("CMS_CERT_IDENTITY_INVALID");
    const value=children(other[1],160);
    if(value.length!==1||![4,12,19,22].includes(value[0].tag))throw Error("CMS_CERT_IDENTITY_INVALID");
    const encoded=value[0].value;
    if(encoded.length<19||encoded.length>128||encoded.some(b=>b<32||b>126))throw Error("CMS_CERT_IDENTITY_INVALID");
    const text=encoded.toString("ascii");
    if(!/^\d{19}/.test(text))throw Error("CMS_CERT_IDENTITY_INVALID");
    identities.push(normalizeCpf(text.slice(8,19)));
  }
  if(identities.length!==1)throw Error("CMS_CERT_IDENTITY_MISSING_OR_AMBIGUOUS");
  if(identities[0]!==expected)throw Error("CMS_CERT_IDENTITY_MISMATCH");
  // No CPF or other personal attribute is returned or logged.
  return {certificateSha256:sha(cert.raw),identityVerified:true as const};
}
/** Compose cryptographic and natural-person identity preflight for the
 * qualified sandbox route. A verified CPF is not PAdES validation or
 * authorization to issue; official trust and policy still apply. */
export function verifySandboxIcpPersonCms(input:Parameters<typeof verifySandboxDetachedCms>[0]&{expectedProfileCpf:string}){
  if(input.mode!=="icp_brasil")throw Error("CMS_CERT_IDENTITY_PROFILE_UNSUPPORTED");
  const preflight=verifySandboxDetachedCms(input);
  const identity=assertIcpPersonCertificateIdentity(input.expectedProviderCertificatePem,input.expectedProfileCpf);
  if(identity.certificateSha256!==preflight.certificateSha256)throw Error("CMS_SIGNER_OR_CONTENT_MISMATCH");
  return {...preflight,...identity};
}

/** Preflight for a future PAdES writer: the ESS signing-certificate binding
 * is checked by OpenSSL as well as the signature, chain, CRL and PDF digest.
 * Not sufficient for PAdES conformance or an official issuance transition. */
export function verifySandboxCadesBinding(input:Parameters<typeof verifySandboxDetachedCms>[0]){
 const result=verifySandboxDetachedCms({...input,requireCades:true});
 return {...result,cadesCertificateBindingVerified:true as const};
}
