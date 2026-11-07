/**
 * The Mercado Pago settlement worker must have only the permissions needed
 * for the dedicated, audited RPCs and the signed-receipt read model.
 *
 * A correct username is not sufficient: Neon can inherit privileged roles,
 * and direct table/column grants can expose another municipality's files or
 * allow a settlement to bypass the bank's immutable ledger.
 *
 * This is deliberately fail-closed. Changing Neon grants requires a separate,
 * isolated QA validation and an approved production change.
 */
export type MpWorkerPrivilegeEvidence = {
  role_name: unknown;
  bypass_rls: unknown;
  superuser: unknown;
  admin_membership: unknown;
  profiles_update: unknown;
  document_delete: unknown;
  sensitive_table_access: unknown;
  sensitive_column_access: unknown;
  direct_financial_write: unknown;
};

export const MP_WORKER_ROLE = "sigapro_prod_webhook_worker";

export function workerHasLeastPrivilege(
  raw: MpWorkerPrivilegeEvidence | null | undefined,
): boolean {
  return raw?.role_name === MP_WORKER_ROLE &&
    raw.bypass_rls === false &&
    raw.superuser === false &&
    raw.admin_membership === false &&
    raw.profiles_update === false &&
    raw.document_delete === false &&
    raw.sensitive_table_access === false &&
    raw.sensitive_column_access === false &&
    raw.direct_financial_write === false;
}

/**
 * Run on the exact connection that will handle settlement, before reading
 * municipality credentials. SELECT on signed receipts is intentionally not
 * forbidden: reconcileAfterPdf needs that read-only audit view.
 *
 * has_any_column_privilege catches column-level grants missed by table-level
 * checks. COALESCE(...,true) treats missing/indeterminate results as unsafe.
 * SQL errors (missing relation or denied catalog lookup) also fail closed.
 */
export const MP_WORKER_PRIVILEGE_AUDIT_SQL = String.raw`SELECT
 current_user::text AS role_name,
 COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),true) AS bypass_rls,
 COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),true) AS superuser,
 EXISTS (
  SELECT 1 FROM pg_roles
  WHERE rolname IN ('neon_superuser','pg_read_all_data','pg_write_all_data')
    AND pg_has_role(current_user,oid,'MEMBER')
 ) AS admin_membership,
 COALESCE(has_table_privilege(current_user,'public.profiles','UPDATE'),true) AS profiles_update,
 COALESCE(has_table_privilege(current_user,'public.process_documents','DELETE'),true) AS document_delete,
 (
  COALESCE(has_table_privilege(current_user,'public.profiles','SELECT,INSERT,UPDATE,DELETE'),true)
  OR COALESCE(has_table_privilege(current_user,'public.process_documents','SELECT,INSERT,UPDATE,DELETE'),true)
  OR COALESCE(has_table_privilege(current_user,'public.processes','SELECT,INSERT,UPDATE,DELETE'),true)
 ) AS sensitive_table_access,
 (
  COALESCE(has_any_column_privilege(current_user,'public.profiles','SELECT,INSERT,UPDATE'),true)
  OR COALESCE(has_any_column_privilege(current_user,'public.process_documents','SELECT,INSERT,UPDATE'),true)
  OR COALESCE(has_any_column_privilege(current_user,'public.processes','SELECT,INSERT,UPDATE'),true)
 ) AS sensitive_column_access,
 (
  COALESCE(has_table_privilege(current_user,'public.payment_guides','INSERT,UPDATE,DELETE'),true)
  OR COALESCE(has_table_privilege(current_user,'public.process_audit_entries','INSERT,UPDATE,DELETE'),true)
  OR COALESCE(has_table_privilege(current_user,'public.municipalities','INSERT,UPDATE,DELETE'),true)
 ) AS direct_financial_write`;

export async function assertMpWorkerLeastPrivilege(
  db: { query(sql: string, args: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> },
): Promise<void> {
  const result = await db.query(MP_WORKER_PRIVILEGE_AUDIT_SQL, []);
  if (result.rows.length !== 1 ||
      !workerHasLeastPrivilege(result.rows[0] as MpWorkerPrivilegeEvidence | undefined)) {
    throw new Error("MP_WORKER_EXCESSIVE_PRIVILEGES");
  }
}
