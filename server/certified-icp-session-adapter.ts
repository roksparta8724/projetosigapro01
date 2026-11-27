import {createHmac} from "node:crypto";
import {callDataApiRpc,readBearer,readEnv,type ApiReq} from "./municipal-storage.js";
import type {IcpSandboxWorkerDependencies} from "./certified-icp-sandbox-worker.js";
type SessionBinding={state:string;municipalityId:string;profileId:string;preparedPdfSha256:string;byteRangeSha256:string};
type StartBinding=SessionBinding&{snapshotSha256:string;nonce:string;processId:string;requestId:string;artifactType:"construction_permit"|"habite_se_permit";signerSlot:"diretoria"|"secretaria"};
type PrepareBinding=Pick<StartBinding,"municipalityId"|"profileId"|"processId"|"requestId"|"artifactType"|"signerSlot">;
type Session=Awaited<ReturnType<IcpSandboxWorkerDependencies["consumeSession"]>>;
type Actor=Awaited<ReturnType<IcpSandboxWorkerDependencies["reauthorizeSigner"]>>;
type ArchiveProof=Awaited<ReturnType<typeof import("./certified-icp-candidate-archive.js").archiveIcpSandboxCandidate>>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash=/^[0-9a-f]{64}$/;
function checkBinding(binding:SessionBinding){
 if(!uuid.test(binding.municipalityId)||!uuid.test(binding.profileId)||!/^[A-Za-z0-9_-]{43}$/.test(binding.state)||!hash.test(binding.preparedPdfSha256)||!hash.test(binding.byteRangeSha256))throw Error("ITI_SESSION_BINDING_INVALID");
}
async function command<T>(req:ApiReq,action:"prepare"|"begin"|"consume"|"reauthorize"|"record",binding:SessionBinding|StartBinding|PrepareBinding|(SessionBinding&{archive:ArchiveProof})){
 if(action!=="prepare")checkBinding(binding as SessionBinding);
 if(!readBearer(req))throw Error("ITI_AUTHENTICATION_REQUIRED");
 const root=readEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET");
 if(!hash.test(root))throw Error("ITI_SERVER_ATTESTATION_UNAVAILABLE");
 const key=createHmac("sha256",Buffer.from(root,"hex")).update("sigapro-certified-session-domain-v1","utf8").digest();
 const payload=Buffer.from(JSON.stringify(binding),"utf8").toString("base64");
 const epoch=String(Math.floor(Date.now()/1000));
 const mac=createHmac("sha256",key).update(["sigapro-certified-session-v1",binding.municipalityId,action,payload,epoch].join("\n"),"utf8").digest("hex");
 const result=await callDataApiRpc<T>(req,"certified_icp_session_command_v1",{_municipality_id:binding.municipalityId,_action:action,_payload:payload,_epoch:epoch,_mac:mac});
 // Never expose the provider or database error body, which might include identity information.
 if(!result.ok||!result.payload)throw Error("ITI_SESSION_NOT_AUTHORIZED");
 return result.payload;
}
export async function prepareIcpSandboxSnapshot(req:ApiReq,binding:PrepareBinding){
 if(![binding.municipalityId,binding.profileId,binding.processId,binding.requestId].every(x=>uuid.test(x))||
   !["construction_permit","habite_se_permit"].includes(binding.artifactType)||!["diretoria","secretaria"].includes(binding.signerSlot))throw Error("ITI_SESSION_START_INVALID");
 const result=await command<{snapshotSha256:string}>(req,"prepare",binding);
 if(!hash.test(result.snapshotSha256))throw Error("ITI_SNAPSHOT_INVALID");
 return result.snapshotSha256;
}
/** Trusted server use only: prepared bytes must have been generated from the
 * authorized persisted snapshot. Never sign a browser-supplied PDF hash. */
export async function beginIcpSandboxSession(req:ApiReq,binding:StartBinding){
 if(!hash.test(binding.snapshotSha256)||!uuid.test(binding.processId)||!uuid.test(binding.requestId)||!["construction_permit","habite_se_permit"].includes(binding.artifactType)||!["diretoria","secretaria"].includes(binding.signerSlot)||!/^[A-Za-z0-9_-]{43}$/.test(binding.nonce)||binding.nonce===binding.state)throw Error("ITI_SESSION_START_INVALID");
 const result=await command<{ok:boolean;environment:string;issuanceAuthorized:boolean}>(req,"begin",binding);
 if(result.ok!==true||result.environment!=="sandbox"||result.issuanceAuthorized!==false)throw Error("ITI_SESSION_START_NOT_CONFIRMED");
 return {ok:true as const};
}
/** Adapter bound to the authenticated HTTP request and the one-time state.
 * Only returns the actor to the worker, never to the browser. */
export function bindIcpSandboxSession(req:ApiReq,binding:SessionBinding):Pick<IcpSandboxWorkerDependencies,"consumeSession"|"reauthorizeSigner">{
 checkBinding(binding);
 let consumed:Session|undefined;
 return {
  async consumeSession(input){
   if(consumed||input.state!==binding.state||input.municipalityId!==binding.municipalityId||input.profileId!==binding.profileId||input.preparedPdfSha256!==binding.preparedPdfSha256||input.byteRangeSha256!==binding.byteRangeSha256)throw Error("ITI_SESSION_BINDING_MISMATCH");
   const s=await command<Session>(req,"consume",binding);
   if(s.municipalityId!==binding.municipalityId||s.profileId!==binding.profileId||s.preparedPdfSha256!==binding.preparedPdfSha256||s.byteRangeSha256!==binding.byteRangeSha256||s.mode!=="icp_brasil"||s.environment!=="sandbox")throw Error("ITI_SESSION_BINDING_MISMATCH");
   consumed=s;return s;
  },
  async reauthorizeSigner(session){
   if(!consumed||session.requestId!==consumed.requestId||session.processId!==consumed.processId||session.profileId!==binding.profileId||session.municipalityId!==binding.municipalityId||session.signerSlot!==consumed.signerSlot||session.artifactType!==consumed.artifactType||session.preparedPdfSha256!==binding.preparedPdfSha256||session.byteRangeSha256!==binding.byteRangeSha256)throw Error("ITI_SESSION_BINDING_MISMATCH");
   const actor=await command<Actor>(req,"reauthorize",binding);
   if(actor.profileId!==binding.profileId||actor.municipalityId!==binding.municipalityId||typeof actor.cpf!=="string")throw Error("ITI_SIGNER_CONTEXT_MISMATCH");
   return actor;
  }
 };
}

/** Register only the server-verified bytes, after archive readback. */
export async function recordIcpSandboxArchive(req:ApiReq,binding:SessionBinding,archive:ArchiveProof){
 const stored=await command<ArchiveProof&{manifestRecorded:boolean}>(req,"record",{...binding,archive});
 if(stored.manifestRecorded!==true||stored.archiveVerified!==true||stored.pdfPolicyVerified!==false||stored.issuanceAuthorized!==false||stored.environment!=="sandbox"||
   stored.sha256!==archive.sha256||stored.objectKey!==archive.objectKey||stored.byteRangeSha256!==binding.byteRangeSha256||
   stored.fileSizeBytes!==archive.fileSizeBytes||stored.cmsSha256!==archive.cmsSha256||stored.certificateSha256!==archive.certificateSha256)
   throw Error("ITI_ARCHIVE_MANIFEST_NOT_CONFIRMED");
 return stored;
}

/** Read-only recovery. The signed server ticket and current authenticated
 * actor must match the recorded session. Never send the OAuth code here. */
export async function readIcpSandboxArchive(req:ApiReq,binding:SessionBinding){
 checkBinding(binding);
 if(!readBearer(req))throw Error("ITI_AUTHENTICATION_REQUIRED");
 const root=readEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET");
 if(!hash.test(root))throw Error("ITI_SERVER_ATTESTATION_UNAVAILABLE");
 const key=createHmac("sha256",Buffer.from(root,"hex")).update("sigapro-certified-manifest-status-domain-v1").digest();
 const payload=Buffer.from(JSON.stringify(binding),"utf8").toString("base64"),epoch=String(Math.floor(Date.now()/1000));
 const mac=createHmac("sha256",key).update(["sigapro-certified-manifest-status-v1",binding.municipalityId,payload,epoch].join("\n")).digest("hex");
 const response=await callDataApiRpc<ArchiveProof&{manifestRecorded:boolean}>(req,"certified_icp_manifest_status_v1",{_municipality_id:binding.municipalityId,_payload:payload,_epoch:epoch,_mac:mac});
 const p=response.payload;
 if(!response.ok||!p||p.environment!=="sandbox"||p.issuanceAuthorized!==false)throw Error("ITI_MANIFEST_STATUS_NOT_AUTHORIZED");
 if(p.manifestRecorded===false)return null;
 if(p.manifestRecorded!==true||p.archiveVerified!==true||p.pdfPolicyVerified!==false||p.byteRangeSha256!==binding.byteRangeSha256||
 ![p.sha256,p.cmsSha256,p.certificateSha256].every(x=>hash.test(x))||!Number.isSafeInteger(p.fileSizeBytes)||p.fileSizeBytes<64||p.fileSizeBytes>33554432||typeof p.objectKey!=="string"||!p.objectKey.startsWith("sandbox-only/certified-candidates/"+binding.municipalityId+"/")||!p.objectKey.endsWith("/"+p.sha256+".pdf"))throw Error("ITI_ARCHIVE_MANIFEST_NOT_CONFIRMED");
 return p;
}
