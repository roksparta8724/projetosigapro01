import {useState} from "react";
import {AlertTriangle,Calculator} from "lucide-react";
import {Input} from "@/components/ui/input";
import {compareAiu2Interim,type Aiu2ProvisionalCriterion} from "@/lib/urbanAiu2Provisional";

/** Never saves a process, changes original OCR, or activates a legal rule. */
export function Aiu2ProvisionalComparison({criterion}:{criterion:Aiu2ProvisionalCriterion}){
  const [value,setValue]=useState("");
  const result=compareAiu2Interim(criterion,value);
  return <div data-aiu2-provisional-comparison="manual-qa-only"
    className="min-w-0 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
    <p className="flex items-center gap-2 text-xs font-extrabold">
      <Calculator className="h-4 w-4"/> Simulação técnica AIU(2) — CA mínimo provisório: 1,00
    </p>
    <label className="block text-xs font-semibold">
      CA do projeto informado pelo analista
      <Input type="text" inputMode="decimal" value={value} maxLength={12}
        onChange={event=>setValue(event.target.value)}
        className="mt-1 bg-white text-slate-950" placeholder="Ex.: 1,00"/>
    </label>
    {result==="invalid"?<p role="alert" className="text-xs font-bold">
      Informe um número válido, por exemplo 0,85 ou 1,00.
    </p>:null}
    {result==="meets_provisional"?<p role="status" className="text-xs font-bold">
      Atinge a referência operacional 1. Isto NÃO comprova conformidade jurídica.
    </p>:null}
    {result==="below_provisional"?<p role="status" className="text-xs font-bold">
      Abaixo da referência operacional 1. Encaminhar à revisão humana.
    </p>:null}
    <p className="flex gap-2 text-xs font-semibold leading-5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
      Referência técnica transitória da Prefeitura: CONCIDADE ainda não deliberou e a lei será revista.
      Simulação manual, sem aprovação automática e sem alterar parâmetros legais ativos.
    </p>
  </div>;
}
