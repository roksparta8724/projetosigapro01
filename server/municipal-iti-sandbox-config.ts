import {createCipheriv,createDecipheriv,createHmac,randomBytes} from "node:crypto";
import {callDataApiRpc,readBearer,readEnv,type ApiReq} from "./municipal-storage.js";
import {currentQaPreview} from "./qa-runtime-scope.js";
import {archiveConfig} from "./certified-icp-candidate-archive.js";
import type {ItiSandboxConfig} from "./iti-signature-sandbox.js";
type Env=Record<string,string|undefined>;
type Selection={processId:string;requestId:string;artifactType:string;signerSlot:string};
type ConfigRow={configured:boolean;revision?:string;updatedAt?:string;ciphertext?:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function key(domain:string,env:Env=process.env){
 const root=env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET||"";
 if(!/^[a-f0-9]{64}$/.test(root))throw Error("ITI_CONFIGURATION_UNAVAILABLE");
 return createHmac("sha256",Buffer.from(root,"hex")).update(domain).digest();
}
function aad(city:string){if(!uuid.test(city))throw Error("ITI_MUNICIPALITY_INVALID");return Buffer.from("sigapro-iti-sandbox-credentials-v1\n"+city);}
function validateCredentials(config:ItiSandboxConfig){
 const url=new URL(config.redirectUri);
 if(!uuid.test(config.municipalityId)||!config.clientId.trim()||!config.clientSecret.trim()||config.clientId.length>512||config.clientSecret.length>2048||/[\r\n]/.test(config.clientId+config.clientSecret)||url.protocol!=="https:"||url.pathname!=="/api/certified-icp-sandbox"||url.username||url.password||url.port||url.search||url.hash)throw Error("ITI_CREDENTIALS_INVALID");
 return config;
}
export function encryptItiCredentials(config:ItiSandboxConfig,env:Env=process.env){
 validateCredentials(config);
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key("sigapro-iti-config-encryption-v1",env),iv);
 cipher.setAAD(aad(config.municipalityId));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(config),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptItiCredentials(city:string,ciphertext:string,env:Env=process.env){
 const [v,iv,tag,data,...rest]=ciphertext.split(".");
 if(v!=="v1"||!iv||!tag||!data||rest.length||Buffer.from(iv,"base64url").length!==12||Buffer.from(tag,"base64url").length!==16)throw Error("ITI_CREDENTIALS_INVALID");
 const decipher=createDecipheriv("aes-256-gcm",key("sigapro-iti-config-encryption-v1",env),Buffer.from(iv,"base64url"));
 decipher.setAAD(aad(city));decipher.setAuthTag(Buffer.from(tag,"base64url"));
 const config=JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8")) as ItiSandboxConfig;
 if(config.municipalityId!==city)throw Error("ITI_MUNICIPALITY_INVALID");
 return validateCredentials(config);
}
async function command(req:ApiReq,city:string,action:"get"|"save"|"resolve",body:Record<string,unknown>){
 if(!currentQaPreview(process.env)||!readBearer(req)||!uuid.test(city))throw Error("ITI_CONFIGURATION_UNAVAILABLE");
 const payload=Buffer.from(JSON.stringify(body)).toString("base64"),epoch=String(Math.floor(Date.now()/1000));
 const mac=createHmac("sha256",key("sigapro-iti-config-command-v1")).update(["sigapro-iti-config-v1",city,action,payload,epoch].join("\n")).digest("hex");
 const result=await callDataApiRpc<ConfigRow>(req,"municipal_iti_sandbox_config_command_v1",{_municipality_id:city,_action:action,_payload:payload,_epoch:epoch,_mac:mac});
 if(!result.ok||!result.payload||typeof result.payload.configured!=="boolean")throw Error("ITI_CONFIGURATION_NOT_CONFIRMED");
 return result.payload;
}
export function publicItiConfigStatus(row:ConfigRow,env:Env=process.env){
 let archiveReady=false;try{archiveConfig(env);archiveReady=true;}catch{/* not configured */}
 return {configured:row.configured,updatedAt:row.updatedAt||null,environment:"sandbox",archiveConfigured:archiveReady,trustConfigured:Boolean(env.SIGAPRO_QA_ICP_ROOTS_PEM&&env.SIGAPRO_QA_ICP_ROOTS_SHA256&&env.SIGAPRO_QA_ICP_CRLS_PEM),runtimeEnabled:env.SIGAPRO_QA_ICP_HTTP_ENABLED==="true",issuanceAuthorized:false};
}
export async function getItiConfigStatus(req:ApiReq,city:string){return publicItiConfigStatus(await command(req,city,"get",{}));}
export async function saveItiConfig(req:ApiReq,config:ItiSandboxConfig){
 // exact registered callback remains an infrastructure-level restriction
 if(config.redirectUri!==readEnv("SIGAPRO_QA_ICP_REDIRECT_URI"))throw Error("ITI_REDIRECT_NOT_REGISTERED");
 const row=await command(req,config.municipalityId,"save",{ciphertext:encryptItiCredentials(config)});
 if(!row.configured)throw Error("ITI_CONFIGURATION_NOT_CONFIRMED");
 return publicItiConfigStatus(row);
}
export async function resolveItiConfig(req:ApiReq,city:string,selection:Selection){
 const row=await command(req,city,"resolve",selection);
 if(!row.configured||!row.ciphertext||!row.revision||!uuid.test(row.revision))throw Error("ITI_SANDBOX_NOT_CONFIGURED");
 return {config:decryptItiCredentials(city,row.ciphertext),revision:row.revision};
}
