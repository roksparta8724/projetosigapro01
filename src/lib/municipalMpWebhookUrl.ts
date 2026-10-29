/** Public webhook endpoints; municipal UUID identifies the tenant, not authentication.
 * Incoming POST still requires the original tenant-specific Mercado Pago HMAC.
 */
export const QA_MP_WEBHOOK_ORIGIN="https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";
export const OFFICIAL_MP_WEBHOOK_ORIGIN="https://sigapromunicipal.com.br";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function municipalMpWebhookUrl(municipalityId:string,env:"test"|"production"):string{
 if(!uuid.test(municipalityId))return "";
 const url=new URL("/api/mercadopago-webhook",env==="test"?QA_MP_WEBHOOK_ORIGIN:OFFICIAL_MP_WEBHOOK_ORIGIN);
 url.searchParams.set("municipality_id",municipalityId);
 return url.toString();
}
