import {createHash} from "node:crypto";
import {buildConstructionPermitPdfBlob,type ConstructionPermitPdfInput} from "../src/lib/constructionPermitPdf.js";
import {buildHabiteSePermitPdfBlob,type HabiteSePermitPdfInput} from "../src/lib/habiteSePermitPdf.js";
import {prepareFirstPermitCertificateRevision} from "./certified-pdf-incremental-revision.js";
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
type TrustedDraft = {municipalityId:string;processId:string;snapshotSha256:string;createdAt:string;logoDataUrl?:string|null}&(
 {artifactType:"construction_permit";data:ConstructionPermitPdfInput}|
 {artifactType:"habite_se_permit";data:HabiteSePermitPdfInput}
);
/** Only for the trusted, authorized municipal snapshot adapter, NOT an HTTP
 * request contract. A persisted snapshot digest must come from that adapter.
 * Uses the existing full permit layouts (including continuation pages),
 * no browser or remote image fetch, and explicitly nonofficial draft flags.
 * The result cannot authorize issuance. The snapshot retrieval/attestation
 * and persistence of the signed artifact remain separate responsibilities. */
export async function renderCertifiedPermitDraft(snapshot:TrustedDraft){
 const {data}=snapshot;
 if(!/^[a-f0-9]{64}$/.test(snapshot.snapshotSha256)||!snapshot.municipalityId||!snapshot.processId||
   data.process.id!==snapshot.processId||data.permit.processId!==snapshot.processId||
   (data.process.municipalityId||data.process.tenantId)!==snapshot.municipalityId||data.permit.municipalityId!==snapshot.municipalityId)
  throw Error("CERTIFIED_PERMIT_RENDER_SCOPE_MISMATCH");
 if(data.permit.status!=="aguardando_diretor")throw Error("CERTIFIED_PERMIT_RENDER_STATE_INVALID");
 const certifiedDraft={createdAt:snapshot.createdAt,fileId:snapshot.snapshotSha256.slice(0,32),logoDataUrl:snapshot.logoDataUrl??null};
 const blob=snapshot.artifactType==="construction_permit"
  ?await buildConstructionPermitPdfBlob({...snapshot.data,certifiedDraft})
  :await buildHabiteSePermitPdfBlob({...snapshot.data,certifiedDraft});
 if(blob.size<64||blob.size>30*1024*1024||blob.type!=="application/pdf")throw Error("CERTIFIED_PERMIT_RENDER_INVALID");
 const originalBytes=Buffer.from(await blob.arrayBuffer()),originalSha256=sha(originalBytes);
 const prepared=prepareFirstPermitCertificateRevision({originalBytes,expectedOriginalSha256:originalSha256,slot:"diretoria"});
 return {...prepared,originalBytes,municipalityId:snapshot.municipalityId,processId:snapshot.processId,artifactType:snapshot.artifactType,snapshotSha256:snapshot.snapshotSha256,renderedFromMunicipalDraft:true as const,officialPermit:false as const};
}
