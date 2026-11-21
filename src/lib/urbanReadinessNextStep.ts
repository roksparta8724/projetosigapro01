import type { UrbanReadinessCheck, UrbanReadinessSummary } from "@/lib/urbanAiReadiness";

/**
 * Guide only tasks that can advance, without hiding the original legal audit.
 *
 * A Quadro I row with a recorded documentary reservation is already treated
 * for OCR workflow purposes. It remains legally pending, but sending the user
 * back to review the same line cannot resolve a legal-source ambiguity.
 */
export function nextUrbanReadinessAction(
  report: Pick<UrbanReadinessSummary, "reading" | "checks">,
): UrbanReadinessCheck | null {
  const reading = report.reading;
  const recordedOnly = reading.total > 0 &&
    reading.untreated === 0 &&
    reading.needsCorrection > 0 &&
    reading.verified + reading.needsCorrection === reading.total;
  return report.checks.find((check) =>
    !check.passed && !(recordedOnly && check.code === "quadro-i")) ?? null;
}
