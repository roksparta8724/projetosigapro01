import {createHash,createPublicKey,randomBytes,verify} from "node:crypto";
import {currentQaPreview} from "./qa-runtime-scope.js";
type Env=Record<string,string|undefined>;
type Config={municipalityId:string;clientId:string;clientSecret:string;redirectUri:string;logoutRedirectUri:string};
type Challenge={state:string;nonce:string;verifier:string;expiresAt:number};
const issuer="https://sso.staging.acesso.gov.br/";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const random=()=>randomBytes(32).toString("base64url");
const digest=(v:string)=>createHash("sha256").update(v,"ascii").digest("base64url");
function checkedUrl(raw:string){
 const u=new URL(raw);
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||u.href!==raw)throw Error("GOVBR_LOGIN_CONFIG_INVALID");
 return u;
}
/** Separate Login Unico credentials, never reuse the ITI signature credentials.
 * QA only; a single explicitly scoped municipal integration may be provisioned. */
export function govbrQaLoginConfig(municipalityId:string,env:Env=process.env):Config{
 if(!currentQaPreview(env)||env.SIGAPRO_QA_GOVBR_LOGIN_ENABLED!=="true"||!uuid.test(municipalityId)||env.SIGAPRO_QA_GOVBR_LOGIN_MUNICIPALITY_ID!==municipalityId)throw Error("GOVBR_LOGIN_NOT_CONFIGURED");
 const clientId=env.SIGAPRO_QA_GOVBR_LOGIN_CLIENT_ID||"",clientSecret=env.SIGAPRO_QA_GOVBR_LOGIN_CLIENT_SECRET||"";
 if(!clientId||!clientSecret||clientId.length>512||clientSecret.length>2048||/[\s:]/.test(clientId)||/[\r\n]/.test(clientSecret))throw Error("GOVBR_LOGIN_CONFIG_INVALID");
 const redirect=checkedUrl(env.SIGAPRO_QA_GOVBR_LOGIN_REDIRECT_URI||""),logout=checkedUrl(env.SIGAPRO_QA_GOVBR_LOGIN_LOGOUT_URI||"");
 if(redirect.origin!==logout.origin)throw Error("GOVBR_LOGIN_CONFIG_INVALID");
 return {municipalityId,clientId,clientSecret,redirectUri:redirect.href,logoutRedirectUri:logout.href};
}
/** The trusted caller must store the verifier/state/nonce in a one-use
 * server session bound to the existing authenticated municipal profile. */
export function createGovbrLoginChallenge(config:Config,now=Date.now()){
 const challenge:Challenge={state:random(),nonce:random(),verifier:random(),expiresAt:now+5*60_000};
 const url=new URL("authorize",issuer);
 url.search=new URLSearchParams({response_type:"code",client_id:config.clientId,scope:"openid profile govbr_confiabilidades govbr_confiabilidades_idtoken",redirect_uri:checkedUrl(config.redirectUri).href,state:challenge.state,nonce:challenge.nonce,code_challenge:digest(challenge.verifier),code_challenge_method:"S256"}).toString();
 return {authorizationUrl:url.href,challenge};
}
function object(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("GOVBR_LOGIN_INVALID_RESPONSE");
 return v as Record<string,unknown>;
}
function decode(part:string){
 if(!/^[A-Za-z0-9_-]+$/.test(part)||part.length>32768)throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 return object(JSON.parse(Buffer.from(part,"base64url").toString("utf8")));
}
function cpf(raw:unknown){
 if(typeof raw!=="string"||!/^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{9}-\d{2}$/.test(raw))throw Error("GOVBR_LOGIN_IDENTITY_MISMATCH");
 const v=raw.replace(/\D/g,"");
 if(/^(\d)\1{10}$/.test(v))throw Error("GOVBR_LOGIN_IDENTITY_MISMATCH");
 for(const n of [9,10]){let s=0;for(let i=0;i<n;i++)s+=Number(v[i])*(n+1-i);const d=(s*10)%11;if((d===10?0:d)!==Number(v[n]))throw Error("GOVBR_LOGIN_IDENTITY_MISMATCH");}
 return v;
}
function verifiedJwt(token:unknown,jwks:unknown,clientId:string,now:number){
 if(typeof token!=="string"||token.length>65536)throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const parts=token.split(".");
 if(parts.length!==3||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const header=decode(parts[0]),claims=decode(parts[1]),keys=object(jwks).keys;
 if(header.alg!=="RS256"||typeof header.kid!=="string"||header.crit!==undefined||header.jku!==undefined||header.jwk!==undefined||!Array.isArray(keys)||keys.length>32)throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const matches=keys.map(object).filter(k=>k.kid===header.kid);
 if(matches.length!==1)throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const k=matches[0];
 if(k.kty!=="RSA"||k.alg!=="RS256"||(k.use!==undefined&&k.use!=="sig")||typeof k.n!=="string"||typeof k.e!=="string"||!(/^[A-Za-z0-9_-]+$/).test(k.n)||!(/^[A-Za-z0-9_-]+$/).test(k.e))throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const key=createPublicKey({key:{kty:"RSA",n:k.n,e:k.e},format:"jwk"});
 if((key.asymmetricKeyDetails?.modulusLength||0)<2048||!verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),key,Buffer.from(parts[2],"base64url")))throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const sec=Math.floor(now/1000);
 if(claims.iss!==issuer||claims.aud!==clientId||typeof claims.exp!=="number"||!Number.isSafeInteger(claims.exp)||claims.exp<=sec||typeof claims.iat!=="number"||!Number.isSafeInteger(claims.iat)||claims.iat>sec+30||(claims.nbf!==undefined&&(typeof claims.nbf!=="number"||!Number.isSafeInteger(claims.nbf)||claims.nbf>sec)))throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 return claims;
}
/** Validate both signed tokens, exact issuer/audience/nonce, municipal CPF
 * and the current account level. No credentials or personal data are returned.
 * This verifies Login Unico identity, not the PDF signature or official issuance. */
export function verifyGovbrLoginTokens(input:{idToken:string;accessToken:string;jwks:unknown;clientId:string;nonce:string;expectedCpf:string;now?:number}){
 const now=input.now??Date.now(),id=verifiedJwt(input.idToken,input.jwks,input.clientId,now),access=verifiedJwt(input.accessToken,input.jwks,input.clientId,now);
 const expected=cpf(input.expectedCpf);
 if(id.nonce!==input.nonce||cpf(id.sub)!==expected||cpf(access.sub)!==expected||id.cnpj||access.cnpj)throw Error("GOVBR_LOGIN_IDENTITY_MISMATCH");
 if(id.at_hash!==undefined&&id.at_hash!==createHash("sha256").update(input.accessToken,"ascii").digest().subarray(0,16).toString("base64url"))throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const level=object(id.reliability_info).level;
 if(level==="bronze")throw Error("GOVBR_LOGIN_BRONZE");
 if(level!=="silver"&&level!=="gold")throw Error("GOVBR_LOGIN_LEVEL_UNVERIFIED");
 return {identityVerified:true as const,level,environment:"sandbox" as const,issuanceAuthorized:false as const};
}
async function readJson(response:Response){
 if(!response.ok||!response.body||!response.headers.get("content-type")?.toLowerCase().includes("application/json"))throw Error("GOVBR_LOGIN_PROVIDER_UNAVAILABLE");
 const reader=response.body.getReader();let n=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.byteLength;if(n>128*1024){await reader.cancel();throw Error("GOVBR_LOGIN_RESPONSE_LIMIT");}chunks.push(r.value);}}
 finally{reader.releaseLock();}
 return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
/** Call only after atomic consumption of the one-use challenge by the server.
 * Expected CPF must come from the currently authorized municipal profile. */
export async function completeGovbrQaLogin(config:Config,challenge:Challenge,returned:{code:string;state:string},expectedCpf:string,now=Date.now()){
 if(!/^[A-Za-z0-9_-]{43}$/.test(challenge.state)||!(/^[A-Za-z0-9_-]{43}$/).test(challenge.nonce)||!(/^[A-Za-z0-9_-]{43}$/).test(challenge.verifier)||challenge.expiresAt<=now||challenge.expiresAt>now+300000||returned.state!==challenge.state||!returned.code||returned.code.length>8192||/[\r\n]/.test(returned.code))throw Error("GOVBR_LOGIN_SESSION_INVALID");
 const options={redirect:"error" as const,cache:"no-store" as const,signal:AbortSignal.timeout(10000)};
 const token=await readJson(await fetch(new URL("token",issuer),{...options,method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+Buffer.from(config.clientId+":"+config.clientSecret).toString("base64"),Accept:"application/json"},body:new URLSearchParams({grant_type:"authorization_code",code:returned.code,redirect_uri:config.redirectUri,code_verifier:challenge.verifier})}));
 if(typeof token.id_token!=="string"||typeof token.access_token!=="string"||String(token.token_type).toLowerCase()!=="bearer")throw Error("GOVBR_LOGIN_TOKEN_INVALID");
 const jwks=await readJson(await fetch(new URL("jwk",issuer),{...options,method:"GET",headers:{Accept:"application/json"}}));
 return verifyGovbrLoginTokens({idToken:token.id_token,accessToken:token.access_token,jwks,clientId:config.clientId,nonce:challenge.nonce,expectedCpf,now:Date.now()});
}
export function govbrQaLogoutUrl(config:Config){
 const url=new URL("logout",issuer);url.searchParams.set("post_logout_redirect_uri",checkedUrl(config.logoutRedirectUri).href);return url.href;
}
