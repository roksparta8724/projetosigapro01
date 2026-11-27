import {currentQaPreview} from "./qa-runtime-scope.js";
import {getItiConfigStatus,saveItiConfig} from "./municipal-iti-sandbox-config.js";
import {readBearer,type ApiReq} from "./municipal-storage.js";
type Res=import("node:http").ServerResponse;
function json(res:Res,status:number,data:unknown){res.statusCode=status;res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");res.end(JSON.stringify(data));}
export default async function handler(req:ApiReq,res:Res){
 if(!currentQaPreview(process.env)){json(res,404,{ok:false});return;}
 if(req.method!=="POST"){json(res,405,{ok:false});return;}
 if(!readBearer(req)){json(res,401,{ok:false});return;}
 if(req.headers.origin!=="https://"+req.headers.host){json(res,403,{ok:false});return;}
 try{
  const raw=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});
  if(raw.length>12000)throw Error("size");
  const body=JSON.parse(raw);
  if(typeof body.municipalityId!=="string")throw Error("municipality");
  if(body.action==="get"){json(res,200,{ok:true,...await getItiConfigStatus(req,body.municipalityId)});return;}
  if(body.action==="save"&&[body.clientId,body.clientSecret,body.redirectUri].every(x=>typeof x==="string")){
   json(res,200,{ok:true,...await saveItiConfig(req,{municipalityId:body.municipalityId,clientId:body.clientId,clientSecret:body.clientSecret,redirectUri:body.redirectUri})});return;
  }
  json(res,400,{ok:false});
 }catch{json(res,409,{ok:false,message:"Configuração não confirmada. Verifique a permissão e o endereço de retorno registrado na homologação."});}
}
