import { inspectPreparedPdfSignature,embedUnverifiedPkcs7,assertEmbeddedCmsBytes,type PreparedSignatureRange } from "./certified-pdf-byte-range.js";
import { assertIcpPersonCertificateIdentity,verifySandboxIcpPersonCms,type CmsTrustBundle } from "./certified-cms-preflight.js";
import { exchangeItiSandboxCode,readItiSandboxCertificate,requestItiSandboxPkcs7,type ItiSandboxConfig } from "./iti-signature-sandbox.js";

type Session = {
 municipalityId:string;processId:string;requestId:string;profileId:string;
 artifactType:"construction_permit"|"habite_se_permit";signerSlot:"diretoria"|"secretaria";
 mode:"govbr"|"icp_brasil";environment:"sandbox";preparedPdfSha256:string;byteRangeSha256:string;
};
export type IcpSandboxWorkerDependencies = {
 // These are trusted server adapters, not request fields. Consumption must be
 // atomic in Neon and recheck the exact municipality, actor and snapshot.
 consumeSession(input:{state:string;municipalityId:string;profileId:string;preparedPdfSha256:string;byteRangeSha256:string}):Promise<Session>;
 reauthorizeSigner(session:Session):Promise<{profileId:string;municipalityId:string;cpf:string}>;
 readPreparedPdf(session:Session):Promise<{bytes:Uint8Array;range:PreparedSignatureRange;requireCades?:boolean}>;
 readMunicipalSandboxConfig(municipalityId:string):Promise<ItiSandboxConfig>;
 readTrustBundle():Promise<CmsTrustBundle>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
/** Single-use ICP sandbox candidate pipeline. No route, archive or issuance
 * is enabled here. A future restricted worker supplies the authenticated
 * adapters; the browser may only present the OAuth code/state.
 * A failure consumes the session and requires new consent, never retries a
 * signature with the same token. Candidate bytes remain non-official. */
export async function completeIcpSandboxCandidate(deps:IcpSandboxWorkerDependencies,input:{
 state:string;code:string;municipalityId:string;profileId:string;preparedPdfSha256:string;byteRangeSha256:string;
}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.state)||!input.code||input.code.length>8192||/[\r\n]/.test(input.code)||
   !uuid.test(input.municipalityId)||!uuid.test(input.profileId)||!hash.test(input.preparedPdfSha256)||!hash.test(input.byteRangeSha256))
   throw Error("ITI_CALLBACK_INVALID");
 const session=await deps.consumeSession({state:input.state,municipalityId:input.municipalityId,profileId:input.profileId,preparedPdfSha256:input.preparedPdfSha256,byteRangeSha256:input.byteRangeSha256});
 if(session.mode!=="icp_brasil"||session.environment!=="sandbox"||session.municipalityId!==input.municipalityId||
    session.profileId!==input.profileId||session.preparedPdfSha256!==input.preparedPdfSha256||
    session.byteRangeSha256!==input.byteRangeSha256||!uuid.test(session.processId)||!uuid.test(session.requestId)||
    !["construction_permit","habite_se_permit"].includes(session.artifactType)||!["diretoria","secretaria"].includes(session.signerSlot))
   throw Error("ITI_SESSION_BINDING_MISMATCH");
 const actor=await deps.reauthorizeSigner(session);
 if(actor.profileId!==session.profileId||actor.municipalityId!==session.municipalityId||!actor.cpf)throw Error("ITI_SIGNER_CONTEXT_MISMATCH");
 const prepared=await deps.readPreparedPdf(session);
 const inspected=inspectPreparedPdfSignature(prepared.bytes,prepared.range,session.preparedPdfSha256);
 if(inspected.byteRangeSha256!==session.byteRangeSha256)throw Error("ITI_DOCUMENT_BINDING_MISMATCH");
 const config=await deps.readMunicipalSandboxConfig(session.municipalityId);
 const trust=await deps.readTrustBundle();
 if(config.municipalityId!==session.municipalityId||trust.mode!=="icp_brasil"||trust.environment!=="sandbox")throw Error("ITI_MUNICIPAL_CONFIGURATION_MISMATCH");
 // No external network call is made until the state, actor, document and
 // municipality are checked. No secret or CPF is returned in the result.
 const token=await exchangeItiSandboxCode(config,input.code);
 const certificate=await readItiSandboxCertificate(token);
 const identity=assertIcpPersonCertificateIdentity(certificate,actor.cpf);
 const cms=await requestItiSandboxPkcs7(token,inspected.digest);
 const covered=Buffer.concat([Buffer.from(prepared.bytes.subarray(0,prepared.range[1])),Buffer.from(prepared.bytes.subarray(prepared.range[2]))]);
 const evidence=verifySandboxIcpPersonCms({mode:"icp_brasil",coveredBytes:covered,expectedByteRangeSha256:session.byteRangeSha256,cmsDer:cms,expectedProviderCertificatePem:certificate,trust,expectedProfileCpf:actor.cpf,requireCades:prepared.requireCades===true});
 if(identity.certificateSha256!==evidence.certificateSha256)throw Error("ITI_CERTIFICATE_BINDING_MISMATCH");
 const candidate=embedUnverifiedPkcs7(prepared.bytes,prepared.range,session.preparedPdfSha256,session.byteRangeSha256,cms);
 const finalProof=assertEmbeddedCmsBytes({preparedBytes:prepared.bytes,signedBytes:candidate.bytes,range:prepared.range,preparedSha256:session.preparedPdfSha256,byteRangeSha256:session.byteRangeSha256,cmsDer:cms});
 if(finalProof.sha256!==candidate.sha256)throw Error("ITI_FINAL_PDF_HASH_MISMATCH");
 // Recheck competence after the provider request; a revoked assignment
 // cannot proceed. Storage/issuance must later do another atomic check.
 const current=await deps.reauthorizeSigner(session);
 if(current.profileId!==actor.profileId||current.municipalityId!==actor.municipalityId||current.cpf!==actor.cpf)throw Error("ITI_SIGNER_CONTEXT_CHANGED");
 return {municipalityId:session.municipalityId,processId:session.processId,requestId:session.requestId,
  profileId:session.profileId,artifactType:session.artifactType,signerSlot:session.signerSlot,
  bytes:candidate.bytes,sha256:candidate.sha256,byteRangeSha256:candidate.byteRangeSha256,
  certificateSha256:evidence.certificateSha256,cmsSha256:evidence.cmsSha256,
  identityVerified:true as const,cryptographicPreflightPassed:true as const,
  pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
}
