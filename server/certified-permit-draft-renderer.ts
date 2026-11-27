import {createHash} from "node:crypto";
import {buildConstructionPermitPdfBlob,type ConstructionPermitPdfInput} from "../src/lib/constructionPermitPdf.js";
import {buildHabiteSePermitPdfBlob,type HabiteSePermitPdfInput} from "../src/lib/habiteSePermitPdf.js";
import {prepareFirstPermitCertificateRevision} from "./certified-pdf-incremental-revision.js";
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
type TrustedDraft = {municipalityId:string;processId:string;snapshotSha256:string;createdAt:string;logoDataUrl?:string|null}&(
 {artifactType:"construction_permit";data:ConstructionPermitPdfInput}|
 {artifactType:"habite_se_permit";data:HabiteSePermitPdfInput}
);
/** Deterministic JSON for a trusted persisted render payload. This checksum
 * is separate from the existing database signature-request snapshot hash;
 * the latter does not include all branding and process fields. Both must
 * be persisted by the future trusted snapshot adapter. */
function canonicalJson(value:unknown):string{
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"){if(!Number.isFinite(value))throw Error("CERTIFIED_PERMIT_RENDER_PAYLOAD_INVALID");return JSON.stringify(value);}
 if(Array.isArray(value))return "["+value.map(item=>canonicalJson(item)).join(",")+"]";
 if(typeof value!=="object"||Object.getPrototypeOf(value)!==Object.prototype)throw Error("CERTIFIED_PERMIT_RENDER_PAYLOAD_INVALID");
 const obj=value as Record<string,unknown>;
 return "{"+Object.keys(obj).sort().filter(key=>obj[key]!==undefined).map(key=>JSON.stringify(key)+":"+canonicalJson(obj[key])).join(",")+"}";
}
export function hashCertifiedPermitRenderPayload(snapshot:TrustedDraft){
 // Exclude caller-supplied renderer overrides: they are replaced below.
 const {certifiedDraft:_ignored,...data}=snapshot.data;
 return sha(canonicalJson({version:1,artifactType:snapshot.artifactType,municipalityId:snapshot.municipalityId,processId:snapshot.processId,snapshotSha256:snapshot.snapshotSha256,createdAt:snapshot.createdAt,logoDataUrl:snapshot.logoDataUrl??null,data}));
}
/** Only for the trusted, authorized municipal snapshot adapter, NOT an HTTP
 * request contract. A persisted snapshot digest must come from that adapter.
 * Uses the existing full permit layouts (including continuation pages),
 * no browser or remote image fetch, and explicitly nonofficial draft flags.
 * The result cannot authorize issuance. The snapshot retrieval/attestation
 * and persistence of the signed artifact remain separate responsibilities. */
export async function renderCertifiedPermitDraft(snapshot:TrustedDraft,expectedRenderPayloadSha256:string){
 if(!/^[a-f0-9]{64}$/.test(expectedRenderPayloadSha256)||hashCertifiedPermitRenderPayload(snapshot)!==expectedRenderPayloadSha256)throw Error("CERTIFIED_PERMIT_RENDER_PAYLOAD_HASH_MISMATCH");
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
 return {...prepared,originalBytes,municipalityId:snapshot.municipalityId,processId:snapshot.processId,artifactType:snapshot.artifactType,snapshotSha256:snapshot.snapshotSha256,renderPayloadSha256:expectedRenderPayloadSha256,renderedFromMunicipalDraft:true as const,officialPermit:false as const};
}
