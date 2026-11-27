import type { UrbanMatrixBatchEvent } from "@/integrations/backend/urbanPrecheckClient";

/**
 * A source can be archived and restored repeatedly. Its CURRENT state is
 * determined by the last event, not by whether an old archive event exists.
 * For equal timestamps, retain the first event returned by the backend.
 * This helper never updates records or overrides an analyst's decision.
 */
export function latestUrbanMatrixBatchEvent(
  events: readonly UrbanMatrixBatchEvent[], batchId: string,
): UrbanMatrixBatchEvent | null {
  let latest: UrbanMatrixBatchEvent | null = null;
  let latestTime = -Infinity;
  for (const event of events) {
    if (event.batch_id !== batchId) continue;
    const parsed = Date.parse(event.created_at);
    const timestamp = Number.isFinite(parsed) ? parsed : -Infinity;
    if (!latest || timestamp > latestTime) {
      latest = event;
      latestTime = timestamp;
    }
  }
  return latest;
}

export function isUrbanMatrixBatchArchived(
  events: readonly UrbanMatrixBatchEvent[], batchId: string,
): boolean {
  return latestUrbanMatrixBatchEvent(events, batchId)?.action === "archive";
}
