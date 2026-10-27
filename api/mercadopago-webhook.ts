import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyMercadoPagoOrderWebhook, type MPOrderNotice } from "../server/mp-webhook-signature.js";

type Req = IncomingMessage & { body?: unknown; query?: Record<string,string> };
type Res = ServerResponse;

function send(res: Res,status:number,data: Record<string,unknown>) {
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(JSON.stringify(data));
}

async function readBody(req:Req):Promise<MPOrderNotice> {
  if (req.body && typeof req.body==="object") return req.body as MPOrderNotice;
  let size=0;
  const chunks:Buffer[]=[];
  for await (const chunk of req) {
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);
    size+=bytes.length;
    if (size>32*1024) throw new Error("Webhook excede tamanho permitido.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as MPOrderNotice;
}

/**
 * Isolated TEST webhook receiver. No blind settlement. An ACK is deliberately
 * withheld until durable queue + verified, authorized bank reconciliation exist.
 * Never point the Mercado Pago console at this endpoint until that is implemented.
 */
export default async function handler(req:Req,res:Res) {
  if (req.method==="GET") {
    const branchReady=process.env.VERCEL_ENV==="preview" &&
      process.env.VITE_SIGAPRO_NEON_ISOLATED==="true" &&
      process.env.VERCEL_GIT_COMMIT_REF==="qa/sigapro-ia-logo-integrado-20261023";
    return send(res,200,{
      ok:true,environment:"qa",receiverDeployed:branchReady,
      secretConfigured:branchReady && Boolean(process.env.SIGAPRO_QA_MP_WEBHOOK_SECRET),
      durableReconciliation:false,
    });
  }
  if (req.method!=="POST") return send(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
  if (process.env.VERCEL_ENV!=="preview" ||
      process.env.VITE_SIGAPRO_NEON_ISOLATED!=="true" ||
      process.env.VERCEL_GIT_COMMIT_REF!=="qa/sigapro-ia-logo-integrado-20261023") {
    return send(res,503,{ok:false,code:"ISOLATED_QA_ONLY"});
  }
  const secret=String(process.env.SIGAPRO_QA_MP_WEBHOOK_SECRET||"").trim();
  if (secret.length<16) return send(res,503,{ok:false,code:"WEBHOOK_SECRET_NOT_CONFIGURED"});
  try {
    const url=new URL(req.url||"/", "https://qa.sigapro.invalid");
    const rawQueryId=url.searchParams.get("data.id");
    const queryTopic=url.searchParams.get("type");
    const notification=await readBody(req);
    const validated=verifyMercadoPagoOrderWebhook({
      rawQueryId,queryTopic,notification,secret,
      headerSignature:String(req.headers["x-signature"]||""),
      requestId:String(req.headers["x-request-id"]||""),
    });
    if (!validated.ok) return send(res,401,{ok:false,code:"INVALID_WEBHOOK_SIGNATURE"});
    // The notification is not settlement proof. We must refetch /v1/orders/
    // with the correct municipal account, check guide/order/amount and append
    // an auditable event before acknowledging. A stateless 200 here would
    // silently drop legitimate notifications and make reconciliation unsafe.
    return send(res,503,{ok:false,code:"WEBHOOK_PERSISTENCE_NOT_READY"});
  } catch {
    return send(res,400,{ok:false,code:"MALFORMED_WEBHOOK"});
  }
}
