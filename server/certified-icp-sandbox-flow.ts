import {resolveItiConfig} from "./municipal-iti-sandbox-config.js";
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createItiSandboxAuthorization,type ItiSandboxConfig} from "./iti-signature-sandbox.js";
import {prepareIcpSandboxSnapshot,beginIcpSandboxSession,bindIcpSandboxSession,recordIcpSandboxArchive,readIcpSandboxArchive} from "./certified-icp-session-adapter.js";
import {archiveConfig,completeAndArchiveIcpSandboxCandidate,verifyRecordedIcpArchive} from "./certified-icp-candidate-archive.js";
import {inspectPreparedPdfSignature,type PreparedSignatureRange} from "./certified-pdf-byte-range.js";
import type {CmsTrustBundle} from "./certified-cms-preflight.js";
import {readBearer,type ApiReq} from "./municipal-storage.js";
type Env=Record<string,string|undefined>;
type Selection=Parameters<typeof prepareIcpSandboxSnapshot>[1];
type Ticket=Selection&{configRevision?:string;callbackSha256?:string;state:string;snapshotSha256:string;preparedPdfSha256:string;byteRangeSha256:string;expiresAt:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const sha=(b:Uint8Array|string)=>createHash("sha256").update(b).digest("hex");
function validSelection(x:Selection){
 return [x.municipalityId,x.profileId,x.processId,x.requestId].every(v=>uuid.test(v))&&
 ["construction_permit","habite_se_permit"].includes(x.artifactType)&&["diretoria","secretaria"].includes(x.signerSlot);
}
export function createSandboxEvidencePdf(selection:Selection,snapshot:string,state:string){
 if(!validSelection(selection)||!hash.test(snapshot)||!/^[A-Za-z0-9_-]{43}$/.test(state))throw Error("ITI_SNAPSHOT_INVALID");
 // This is deliberately a NON-OFFICIAL evidence PDF, not the municipality's permit.
 // Deterministic bytes bind the authorized snapshot and one-use session.
 const lines=["SIGAPRO - HOMOLOGACAO ICP-BRASIL","SEM VALIDADE DE ALVARA - NAO EMITIDO","Municipio: "+selection.municipalityId,"Processo: "+selection.processId,"Solicitacao: "+selection.requestId,"Tipo: "+selection.artifactType,"Funcao: "+selection.signerSlot,"SHA-256 da versao autorizada:",snapshot,"Vinculo da sessao: "+sha(state)];
 const stream="BT /F1 12 Tf 50 790 Td 20 TL\n"+lines.map((line,i)=>(i?"T* ":"")+"("+line+") Tj").join("\n")+"\nET\n";
 const objects=[
 "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /SigFlags 3 >> >>",
 "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
 "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R /Annots [4 0 R] >>",
 "<< /Type /Annot /Subtype /Widget /FT /Sig /T (QA Signature) /Rect [0 0 0 0] /P 3 0 R /V 5 0 R /F 4 >>",
 "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents <"+"0".repeat(262144)+"> >>",
 "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
 "<< /Length "+stream.length+" >>\nstream\n"+stream+"endstream"];
 let raw="%PDF-1.7\n";const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(raw.length);raw+=(i+1)+" 0 obj\n"+o+"\nendobj\n";});
 const xref=raw.length;
 raw+="xref\n0 8\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
 const first=raw.indexOf("/Contents <")+10,end=first+262146;
 const range:PreparedSignatureRange=[0,first,end,raw.length-end];
 const bytes=Buffer.from(raw.replace("0000000000 0000000000 0000000000 0000000000",range.map(n=>String(n).padStart(10,"0")).join(" ")),"ascii");
 const inspected=inspectPreparedPdfSignature(bytes,range,sha(bytes));
 return {bytes,range,preparedPdfSha256:inspected.preparedPdfSha256,byteRangeSha256:inspected.byteRangeSha256};
}
function ticketMac(encoded:string,env:Env){
 const root=env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET||"";
 if(!hash.test(root))throw Error("ITI_SERVER_ATTESTATION_UNAVAILABLE");
 const key=createHmac("sha256",Buffer.from(root,"hex")).update("sigapro-icp-sandbox-ticket-v1").digest();
 return createHmac("sha256",key).update(encoded).digest("hex");
}
export function sealSandboxTicket(ticket:Ticket,env:Env){
 const encoded=Buffer.from(JSON.stringify(ticket)).toString("base64url");
 return encoded+"."+ticketMac(encoded,env);
}
export function openSandboxTicket(value:string,env:Env,now=Date.now()):Ticket{
 if(value.length>4096||!/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(value))throw Error("ITI_TICKET_INVALID");
 const [encoded,mac]=value.split(".");
 if(!timingSafeEqual(Buffer.from(mac,"hex"),Buffer.from(ticketMac(encoded,env),"hex")))throw Error("ITI_TICKET_INVALID");
 const t=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as Ticket;
 if(!validSelection(t)||![t.snapshotSha256,t.preparedPdfSha256,t.byteRangeSha256].every(v=>hash.test(v))||!/^[A-Za-z0-9_-]{43}$/.test(t.state)||!Number.isSafeInteger(t.expiresAt)||t.expiresAt<=now||t.expiresAt>now+300000)throw Error("ITI_TICKET_EXPIRED_OR_INVALID");
 return t;
}
export function sandboxConfig(municipalityId:string,env:Env,municipalConfig?:ItiSandboxConfig){
 archiveConfig(env);
 if(env.SIGAPRO_QA_ICP_HTTP_ENABLED!=="true"||(!municipalConfig&&env.SIGAPRO_QA_ICP_MUNICIPALITY_ID!==municipalityId))throw Error("ITI_SANDBOX_NOT_CONFIGURED");
 const config:ItiSandboxConfig=municipalConfig??{municipalityId,clientId:env.SIGAPRO_QA_ICP_CLIENT_ID||"",clientSecret:env.SIGAPRO_QA_ICP_CLIENT_SECRET||"",redirectUri:env.SIGAPRO_QA_ICP_REDIRECT_URI||""};
 const url=new URL(config.redirectUri);
 if(config.municipalityId!==municipalityId||config.redirectUri!==env.SIGAPRO_QA_ICP_REDIRECT_URI||!config.clientId||!config.clientSecret||url.protocol!=="https:"||url.pathname!=="/api/certified-icp-sandbox"||url.search||url.hash||url.username||url.password||url.port)throw Error("ITI_SANDBOX_NOT_CONFIGURED");
 const trust:CmsTrustBundle={mode:"icp_brasil",environment:"sandbox",rootsPem:env.SIGAPRO_QA_ICP_ROOTS_PEM||"",rootsSha256:env.SIGAPRO_QA_ICP_ROOTS_SHA256||"",intermediatesPem:env.SIGAPRO_QA_ICP_INTERMEDIATES_PEM||"",crlsPem:env.SIGAPRO_QA_ICP_CRLS_PEM||""};
 if(!hash.test(trust.rootsSha256)||sha(trust.rootsPem)!==trust.rootsSha256||!trust.crlsPem.includes("-----BEGIN X509 CRL-----"))throw Error("ITI_SANDBOX_TRUST_NOT_CONFIGURED");
 try{if(!/^OpenSSL 3\./.test(execFileSync("openssl",["version"],{encoding:"utf8",timeout:2000})))throw Error("version");}catch{throw Error("ITI_OPENSSL_UNAVAILABLE");}
 return {config,trust};
}
export async function startSandboxFlow(req:ApiReq,selection:Selection,env:Env=process.env){
 if(!readBearer(req)||!validSelection(selection))throw Error("ITI_AUTHENTICATION_REQUIRED");
 const resolved=await resolveItiConfig(req,selection.municipalityId,selection);
 const {config}=sandboxConfig(selection.municipalityId,env,resolved.config);
 const authorization=createItiSandboxAuthorization(config,"icp_brasil");
 const snapshotSha256=await prepareIcpSandboxSnapshot(req,selection);
 const doc=createSandboxEvidencePdf(selection,snapshotSha256,authorization.state);
 const ticket:Ticket={...selection,configRevision:resolved.revision,callbackSha256:sha(config.redirectUri),state:authorization.state,snapshotSha256,preparedPdfSha256:doc.preparedPdfSha256,byteRangeSha256:doc.byteRangeSha256,expiresAt:authorization.expiresAt};
 await beginIcpSandboxSession(req,{...selection,state:ticket.state,nonce:authorization.nonce,snapshotSha256,preparedPdfSha256:ticket.preparedPdfSha256,byteRangeSha256:ticket.byteRangeSha256});
 return {authorizationUrl:authorization.url,ticket:sealSandboxTicket(ticket,env),state:ticket.state,expiresAt:ticket.expiresAt,environment:"sandbox",issuanceAuthorized:false};
}
export async function finishSandboxFlow(req:ApiReq,input:{ticket:string;state:string;code:string},env:Env=process.env){
 if(!readBearer(req))throw Error("ITI_AUTHENTICATION_REQUIRED");
 const t=openSandboxTicket(input.ticket,env);
 if(t.state!==input.state)throw Error("ITI_SESSION_BINDING_MISMATCH");
 const resolved=await resolveItiConfig(req,t.municipalityId,t);
 if(!t.configRevision||resolved.revision!==t.configRevision)throw Error("ITI_CONFIGURATION_CHANGED");
 const {config,trust}=sandboxConfig(t.municipalityId,env,resolved.config);
 if(t.callbackSha256!==sha(config.redirectUri))throw Error("ITI_CONFIGURATION_CHANGED");
 const doc=createSandboxEvidencePdf(t,t.snapshotSha256,t.state);
 if(doc.preparedPdfSha256!==t.preparedPdfSha256||doc.byteRangeSha256!==t.byteRangeSha256)throw Error("ITI_DOCUMENT_BINDING_MISMATCH");
 const binding={state:t.state,municipalityId:t.municipalityId,profileId:t.profileId,preparedPdfSha256:t.preparedPdfSha256,byteRangeSha256:t.byteRangeSha256};
 const archived=await completeAndArchiveIcpSandboxCandidate({...bindIcpSandboxSession(req,binding),readPreparedPdf:async()=>({bytes:doc.bytes,range:doc.range}),readMunicipalSandboxConfig:async()=>config,readTrustBundle:async()=>trust},{...binding,code:input.code},env);
 return recordIcpSandboxArchive(req,binding,archived);
}

/** Recover a committed response after a transient HTTP failure. A missing
 * manifest is not evidence of success and never triggers another signature. */
export async function recoverSandboxFlow(req:ApiReq,input:{ticket:string;state:string},env:Env=process.env){
 if(!readBearer(req))throw Error("ITI_AUTHENTICATION_REQUIRED");
 const t=openSandboxTicket(input.ticket,env);
 if(t.state!==input.state)throw Error("ITI_SESSION_BINDING_MISMATCH");
 const resolved=await resolveItiConfig(req,t.municipalityId,t);
 if(!t.configRevision||resolved.revision!==t.configRevision||t.callbackSha256!==sha(resolved.config.redirectUri))throw Error("ITI_CONFIGURATION_CHANGED");
 const binding={state:t.state,municipalityId:t.municipalityId,profileId:t.profileId,preparedPdfSha256:t.preparedPdfSha256,byteRangeSha256:t.byteRangeSha256};
 const proof=await readIcpSandboxArchive(req,binding);
 if(!proof)return null;
 const canonical=["sandbox-only","certified-candidates",t.municipalityId,t.processId,t.requestId,t.profileId,t.artifactType,t.signerSlot,proof.sha256+".pdf"].join("/");
 if(proof.objectKey!==canonical)throw Error("ITI_ARCHIVE_MANIFEST_NOT_CONFIRMED");
 await verifyRecordedIcpArchive(proof,env);
 return proof;
}
