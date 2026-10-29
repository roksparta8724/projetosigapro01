/** Prevent responses for a different municipality or process from mutating the visible analysis. */
export function isCurrentUrbanRequest(
  requested: { processId: string; municipalityId: string; generation: number },
  current: { processId: string; municipalityId: string; generation: number },
): boolean {
  return requested.processId === current.processId &&
    requested.municipalityId === current.municipalityId &&
    requested.generation === current.generation;
}
