/**
 * Browser-only recovery of SIGAPRO technical checklist drafts.
 * No database writes. Scope to exact municipality/process/legacy analyst key.
 */
export type ChecklistLocalCandidate = {
  key: string;
  source: "local" | "backup" | "legacy";
  evaluated: number;
  observations: number;
  savedAt: string | null;
  payload: Record<string, unknown>;
};

function validChecklistItems(items: unknown): items is Record<string, {status?: string; observation?: string}> {
  return Boolean(items && typeof items === "object" && !Array.isArray(items) &&
    Object.entries(items).length <= 160 &&
    Object.entries(items).every(([k,v]) => /^[a-z0-9_-]{1,100}$/i.test(k) &&
      v && typeof v === "object" && !Array.isArray(v) &&
      (v as {status?:unknown}).status !== undefined &&
      ["","A","AP","C","NA"].includes(String((v as {status?:unknown}).status)) &&
      typeof (v as {observation?:unknown}).observation === "string"));
}

export function findAnalysisSheetLocalCandidates(
  storage: Pick<Storage, "getItem">,
  municipalityId: string,
  processId: string,
  analystId: string,
): ChecklistLocalCandidate[] {
  if (![municipalityId,processId,analystId].every(v=>typeof v==="string" && v.length>0)) return [];
  const current = "sigapro:urban-analysis-checklist:v2:" + municipalityId + ":" + processId;
  const keys: Array<[string,ChecklistLocalCandidate["source"]]> = [
    [current, "local"],
    [current + ":backup-anterior-a-leitura-oficial", "backup"],
    ["sigapro:urban-analysis-checklist:v1:" + processId + ":" + analystId, "legacy"],
  ];
  const results: ChecklistLocalCandidate[] = [];
  for (const [key, source] of keys) {
    try {
      const raw = storage.getItem(key);
      if (!raw || raw.length > 300000) continue;
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          (value.processId && value.processId !== processId) ||
          !validChecklistItems(value.items)) continue;
      const entries=Object.values(value.items);
      const evaluated=entries.filter(v=>Boolean(v.status)).length;
      const observations=entries.filter(v=>Boolean(v.observation?.trim())).length;
      const hasConclusion=typeof value.conclusion==="string" && Boolean(value.conclusion.trim());
      if (!evaluated && !observations && !hasConclusion) continue;
      results.push({
        key, source, evaluated, observations,
        savedAt: typeof value.savedAt==="string" && value.savedAt ? value.savedAt : null,
        payload: value,
      });
    } catch { /* Corrupt browser data must not break the analysis page. */ }
  }
  return results;
}

export function rescueChecklistEditableFields(
  payload: Record<string, unknown>,
  knownIds: readonly string[],
): {
  items: Record<string, { status: ""|"A"|"AP"|"C"|"NA"; observation: string }>;
  conclusion: string; routing: ""|"expediente"|"topografia"|"outro";
  routingOther: string; communiquePages: string;
  analysisDate: string; sheetNumber: string;
} {
  const prior = payload.items as Record<string, {status?:string;observation?:string}>;
  if (!validChecklistItems(prior)) throw new Error("Rascunho local inválido.");
  const items: Record<string, {status:""|"A"|"AP"|"C"|"NA";observation:string}> = {};
  for(const id of knownIds) {
    const row=prior[id];
    const status=row?.status;
    items[id]={
      status: status && ["A","AP","C","NA"].includes(status) ? status as "A"|"AP"|"C"|"NA" : "",
      observation: typeof row?.observation==="string" ? row.observation.slice(0,5000) : "",
    };
  }
  const text=(field:string,max=5000)=>typeof payload[field]==="string" ? (payload[field] as string).slice(0,max) : "";
  const routing=text("routing");
  return {
    items,
    conclusion:text("conclusion"), routing: ["expediente","topografia","outro"].includes(routing)
      ? routing as "expediente"|"topografia"|"outro" : "",
    routingOther:text("routingOther",250), communiquePages:text("communiquePages",250),
    analysisDate:/^\d{4}-\d{2}-\d{2}$/.test(text("analysisDate")) ? text("analysisDate") : "",
    sheetNumber:text("sheetNumber",50) || "1",
  };
}
