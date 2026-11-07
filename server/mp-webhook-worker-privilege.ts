/**
 * Production Mercado Pago worker must be a least-privilege role.
 * A deliberately isolated worker must not bypass RLS or inherit Neon admin
 * privileges. This is a runtime control in addition to HMAC, bank observation,
 * database idempotency and per-municipality credentials.
 *
 * This function does not attempt grants, revokes or migrations in production.
 */
export type MpWorkerPrivilegeEvidence={
  role_name:unknown;
  bypass_rls:unknown;
  superuser:unknown;
  admin_membership:unknown;
  profiles_update:unknown;
  document_delete:unknown;
};
export const MP_WORKER_ROLE="sigapro_prod_webhook_worker";
export function workerHasLeastPrivilege(raw:MpWorkerPrivilegeEvidence|null|undefined):boolean{
  return raw?.role_name===MP_WORKER_ROLE &&
    raw.bypass_rls===false &&
    raw.superuser===false &&
    raw.admin_membership===false &&
    raw.profiles_update===false &&
    raw.document_delete===false;
}

/**
 * Use the same restricted SQL login that subsequently handles the webhook.
 * A missing catalog/privilege response fails closed; never silently fall back
 * to a database owner for money movements.
 */
export const MP_WORKER_PRIVILEGE_AUDIT_SQL=String.raw`SELECT current_user::text AS role_name,
 COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),true) AS bypass_rls,
 COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true) AS superuser,
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neon_superuser'
   AND pg_has_role(current_user,oid,'MEMBER')) AS admin_membership,
 has_table_privilege(current_user,'public.profiles','UPDATE') AS profiles_update,
 has_table_privilege(current_user,'public.process_documents','DELETE') AS document_delete`;

export async function assertMpWorkerLeastPrivilege(
  db:{query(sql:string,args:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>},
):Promise<void>{
  const result=await db.query(MP_WORKER_PRIVILEGE_AUDIT_SQL,[]);
  if(!workerHasLeastPrivilege(result.rows[0] as MpWorkerPrivilegeEvidence|undefined))
    throw new Error("MP_WORKER_EXCESSIVE_PRIVILEGES");
}
