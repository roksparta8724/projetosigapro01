/** Paid guides are immutable even if a delayed webhook left a stale status. */
export function isPersistedGuideSettled(
  guide: { status?: string | null; paid?: boolean | null },
): boolean {
  return guide.paid === true ||
    ["compensada", "paid", "pago", "confirmed", "confirmado"].includes(
      String(guide.status ?? "").trim().toLowerCase(),
    );
}
