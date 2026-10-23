import { useState } from "react";
import { CheckCircle2, Ruler, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UrbanDrawingSuggestion } from "@/lib/urbanDrawingMeasurements";

export function UrbanDrawingMeasurementDesk({
  suggestions, readOnly, onConfirm,
}: {
  suggestions: UrbanDrawingSuggestion[];
  readOnly: boolean;
  onConfirm: (candidate: UrbanDrawingSuggestion) => void;
}) {
  const [chosenId, setChosenId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const chosen = suggestions.find(x=>x.id===chosenId);
  const hasConflicts = chosen &&
    suggestions.filter(x=>x.target===chosen.target && x.value!==chosen.value).length > 0;
  if(readOnly) return null;
  return (
    <section data-urban-drawing-measurements="true"
      className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50/70 p-4 text-slate-900 dark:border-sky-700 dark:bg-[#10283f] dark:text-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <Ruler className="h-5 w-5 text-sky-700 dark:text-sky-300"/>
        <h5 className="text-sm font-extrabold text-slate-950 dark:text-white">SIGAPRO IA — Cotas e áreas da planta</h5>
        <span className="rounded-full border border-sky-300 px-2.5 py-1 text-[10px] font-bold text-sky-950 dark:border-sky-600 dark:text-sky-100">
          {suggestions.length} possível(is) medida(s)
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
        Pré-leitura de números expressos na camada de texto da planta. Não mede distâncias ou áreas no desenho,
        não lê cotas rasterizadas e não prova a escala. A seleção abaixo exige conferência na prancha original.
      </p>
      {!suggestions.length ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-600 dark:bg-[#0a1f34] dark:text-slate-200">
          Nenhuma medida explícita identificada. Confira manualmente as cotas, quadros de áreas e unidades.
        </p>
      ) : (
        <div className="mt-3 max-h-64 space-y-2 overflow-auto">
          {suggestions.map(candidate=>(
            <div key={candidate.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-[#0a1f34]">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Página {candidate.page} · {candidate.label}: {candidate.value.toLocaleString("pt-BR",{maximumFractionDigits:3})}{candidate.unit ? " "+candidate.unit : ""}
                </p>
                <p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">{candidate.excerpt}</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="shrink-0"
                aria-pressed={chosenId===candidate.id}
                onClick={()=>{setChosenId(candidate.id);setConfirmed(false);}}>
                {chosenId===candidate.id ? "Selecionada" : "Conferir cota"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {chosen ? (
        <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-600/40 dark:bg-[#392b18]">
          {hasConflicts ? (
            <p role="alert" className="flex items-start gap-2 text-xs font-semibold text-amber-950 dark:text-amber-100">
              <ShieldAlert className="h-4 w-4 shrink-0"/> Há outras medidas para este mesmo parâmetro.
              Confirme qual pertence ao imóvel, ao pavimento ou à revisão analisada.
            </p>
          ) : null}
          <p className="mt-1 text-xs font-bold text-amber-950 dark:text-amber-100">
            Confirmação necessária: {chosen.label} · {chosen.value} {chosen.unit} · página {chosen.page}
          </p>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-800 dark:text-slate-100">
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5"/>
            Abri a prancha original, conferi cota, unidade, escala e se a medida corresponde ao imóvel
            e ao parâmetro correto. Sei que não é validação geométrica automática.
          </label>
          <Button type="button" disabled={!confirmed} className="mt-3 rounded-xl bg-sky-700 text-white hover:bg-sky-800"
            onClick={()=>{onConfirm(chosen);setConfirmed(false);setChosenId("");}}>
            <CheckCircle2 className="mr-2 h-4 w-4"/> Preencher medida conferida
          </Button>
        </div>
      ) : null}
    </section>
  );
}
