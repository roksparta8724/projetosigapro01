import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {describe,it,expect,vi,afterEach} from "vitest";
import {govbrQaLoginConfig,createGovbrLoginChallenge,verifyGovbrLoginTokens,completeGovbrQaLogin,govbrQaLogoutUrl} from "./govbr-signing-login";
const municipalityId="11111111-1111-4111-8111-111111111111",cpf="52998224725",now=Date.now(),sec=Math.floor(now/1000);
const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",SIGAPRO_QA_GOVBR_LOGIN_ENABLED:"true",SIGAPRO_QA_GOVBR_LOGIN_MUNICIPALITY_ID:municipalityId,SIGAPRO_QA_GOVBR_LOGIN_CLIENT_ID:"fixture-client",SIGAPRO_QA_GOVBR_LOGIN_CLIENT_SECRET:"fixture-secret",SIGAPRO_QA_GOVBR_LOGIN_REDIRECT_URI:"https://qa.example.invalid/login-callback",SIGAPRO_QA_GOVBR_LOGIN_LOGOUT_URI:"https://qa.example.invalid/logout-callback"};
const config=govbrQaLoginConfig(municipalityId,env);
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const jwks={keys:[{...publicKey.export({format:"jwk"}),kid:"fixture",alg:"RS256",use:"sig"}]};
function jwt(claims:Record<string,unknown>,header:Record<string,unknown>={alg:"RS256",kid:"fixture"}){
 const raw=Buffer.from(JSON.stringify(header)).toString("base64url")+"."+Buffer.from(JSON.stringify(claims)).toString("base64url");
 return raw+"."+sign("RSA-SHA256",Buffer.from(raw),privateKey).toString("base64url");
}
const claims={iss:"https://sso.staging.acesso.gov.br/",aud:config.clientId,sub:cpf,iat:sec,exp:sec+60};
const nonce="n".repeat(43);
const accessToken=jwt(claims);
const idToken=(change:Record<string,unknown>={})=>jwt({...claims,nonce,reliability_info:{level:"silver"},...change});
const input={idToken:idToken(),accessToken,jwks,clientId:config.clientId,nonce,expectedCpf:cpf,now};
afterEach(()=>vi.unstubAllGlobals());
describe("Official Login Unico transport and verified account level (QA only)",()=>{
 it("creates a PKCE S256 challenge and refuses production or another municipality",()=>{
  const {authorizationUrl,challenge}=createGovbrLoginChallenge(config,now);const url=new URL(authorizationUrl);
  expect(url.origin).toBe("https://sso.staging.acesso.gov.br");
  expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(challenge.verifier).digest("base64url"));
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe(challenge.state);
  expect(url.searchParams.get("nonce")).toBe(challenge.nonce);
  expect(authorizationUrl).not.toContain(config.clientSecret);expect(authorizationUrl).not.toContain(challenge.verifier);
  expect(()=>govbrQaLoginConfig(municipalityId,{...env,VERCEL_ENV:"production"})).toThrow();
  expect(()=>govbrQaLoginConfig("22222222-2222-4222-8222-222222222222",env)).toThrow();
  expect(govbrQaLogoutUrl(config)).toContain("https://sso.staging.acesso.gov.br/logout?");
 });
 it("verifies signed ID/access JWTs, exact identity, nonce and silver/gold only",()=>{
  expect(verifyGovbrLoginTokens(input)).toEqual({identityVerified:true,level:"silver",environment:"sandbox",issuanceAuthorized:false});
  expect(verifyGovbrLoginTokens({...input,idToken:idToken({reliability_info:{level:"gold"}})}).level).toBe("gold");
  for(const bad of [idToken({reliability_info:{level:"bronze"}}),idToken({reliability_info:{level:"unknown"}}),idToken({nonce:"wrong"}),idToken({aud:"wrong"}),idToken({iss:"https://evil.invalid/"}),idToken({exp:sec-1}),idToken({sub:"11144477735"}),idToken({cnpj:"corporate"}),jwt({...claims,nonce,reliability_info:{level:"silver"}},{alg:"none",kid:"fixture"})])expect(()=>verifyGovbrLoginTokens({...input,idToken:bad})).toThrow();
  expect(()=>verifyGovbrLoginTokens({...input,accessToken:jwt({...claims,sub:"11144477735"})})).toThrow();
  expect(()=>verifyGovbrLoginTokens({...input,jwks:{keys:[{...jwks.keys[0],kid:"wrong"}]}})).toThrow();
 });
 it("exchanges only at the documented staging endpoints and never repeats on bad state",async()=>{
  const {challenge}=createGovbrLoginChallenge(config);
  const n=jwt({...claims,nonce:challenge.nonce,reliability_info:{level:"gold"}});
  const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({access_token:accessToken,id_token:n,token_type:"Bearer"})).mockResolvedValueOnce(Response.json(jwks));
  vi.stubGlobal("fetch",fetchMock);
  await expect(completeGovbrQaLogin(config,challenge,{code:"fixture",state:"wrong"},cpf)).rejects.toThrow("GOVBR_LOGIN_SESSION_INVALID");
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(completeGovbrQaLogin(config,challenge,{code:"fixture",state:challenge.state},cpf)).resolves.toMatchObject({identityVerified:true,level:"gold",issuanceAuthorized:false});
  expect(String(fetchMock.mock.calls[0][0])).toBe("https://sso.staging.acesso.gov.br/token");
  expect(fetchMock.mock.calls[0][1].body.get("code_verifier")).toBe(challenge.verifier);
  expect(String(fetchMock.mock.calls[1][0])).toBe("https://sso.staging.acesso.gov.br/jwk");
 });
});
