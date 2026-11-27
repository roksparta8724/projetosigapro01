import {renderCertifiedPermitDraft,hashCertifiedPermitRenderPayload} from "./certified-permit-draft-renderer.js";
import {archiveCertifiedPermitDraft,readArchivedCertifiedPermitDraft,type CertifiedDraftArchiveManifest} from "./certified-permit-draft-archive.js";
type Snapshot=Parameters<typeof renderCertifiedPermitDraft>[0];
type Scope=Parameters<typeof readArchivedCertifiedPermitDraft>[1];
type Env=Record<string,string|undefined>;
type Registry={
 /** Implementations must enforce a unique immutable manifest for this exact
  * snapshot, and return the committed manifest, not just a successful flag. */
 read(scope:Scope):Promise<CertifiedDraftArchiveManifest|null>;
 recordOnce(manifest:CertifiedDraftArchiveManifest):Promise<CertifiedDraftArchiveManifest>;
};
type Storage={
 archive:typeof archiveCertifiedPermitDraft;
 read:typeof readArchivedCertifiedPermitDraft;
};
const defaultStorage:Storage={archive:archiveCertifiedPermitDraft,read:readArchivedCertifiedPermitDraft};
const fields=["municipalityId","processId","requestId","artifactType","snapshotSha256","renderPayloadSha256","originalSha256","originalSize","preparedPdfSha256","preparedSize","byteRangeSha256","originalKey","preparedKey","environment","issuanceAuthorized"] as const;
function equal(a:CertifiedDraftArchiveManifest,b:CertifiedDraftArchiveManifest){
 return fields.every(k=>a[k]===b[k]);
}
/** Internal worker, after authorization and retrieval of a trusted persisted
 * snapshot. Never exposed as a browser endpoint. A registry implementation
 * must be connected to the existing authorized municipal database before
 * this worker is used by the external signing route.
 * Existing manifests are always read and verified, never replaced.
 * Both storage writes and registry commit precede delivery to the signer.
 * No official permit state or signing-session state is modified here. */
export async function prepareArchivedMunicipalDraft(input:{
 snapshot:Snapshot;requestId:string;expectedRenderPayloadSha256:string;
 registry:Registry;env?:Env;storage?:Storage;
}){
 const {snapshot,requestId,registry}=input,env=input.env??process.env,storage=input.storage??defaultStorage;
 const scope:Scope={municipalityId:snapshot.municipalityId,processId:snapshot.processId,artifactType:snapshot.artifactType,snapshotSha256:snapshot.snapshotSha256,renderPayloadSha256:input.expectedRenderPayloadSha256,requestId};
 if(hashCertifiedPermitRenderPayload(snapshot)!==input.expectedRenderPayloadSha256)throw Error("CERTIFIED_PERMIT_RENDER_PAYLOAD_HASH_MISMATCH");
 const existing=await registry.read(scope);
 if(existing){
  const doc=await storage.read(existing,scope,env);
  return {manifest:existing,document:doc,registryConfirmed:true as const,reused:true,issuanceAuthorized:false as const};
 }
 const rendered=await renderCertifiedPermitDraft(snapshot,input.expectedRenderPayloadSha256);
 const archived=await storage.archive(rendered,requestId,env);
 const committed=await registry.recordOnce(archived);
 if(!committed||!equal(archived,committed))throw Error("CERTIFIED_DRAFT_REGISTRY_COMMIT_MISMATCH");
 const doc=await storage.read(committed,scope,env);
 if(doc.preparedPdfSha256!==rendered.preparedPdfSha256||doc.byteRangeSha256!==rendered.byteRangeSha256)throw Error("CERTIFIED_DRAFT_REGISTRY_DOCUMENT_MISMATCH");
 return {manifest:committed,document:doc,registryConfirmed:true as const,reused:false,issuanceAuthorized:false as const};
}
