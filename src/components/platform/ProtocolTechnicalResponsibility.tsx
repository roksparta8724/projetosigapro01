import { UserRoundCheck } from "lucide-react";
import { SectionCard } from "@/components/platform/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProtocolDraftForm } from "@/lib/protocolDraft";
import { inferProfessionalCouncil, professionalActivityOptions, professionalCouncilOptions, technicalResponsibilityLabel } from "@/lib/professionalResponsibility";

interface Props {
  form: ProtocolDraftForm;
  setField: (key: keyof ProtocolDraftForm, value: string) => void;
  setToggle: (key: "execucaoMesmoResponsavel" | "protocolanteMesmoResponsavel", value: boolean) => void;
  counterMode?: boolean;
  clerkName?: string;
}
function ActivityChoice({value,onChange}:{value:string;onChange:(value:string)=>void}){
  return <Select value={value||""} onValueChange={onChange}>
    <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue placeholder="Engenheiro, arquiteto ou técnico" /></SelectTrigger>
    <SelectContent>
      {value && !professionalActivityOptions.some((entry)=>entry===value) ? <SelectItem value={value}>{value}</SelectItem> : null}
      {professionalActivityOptions.map((entry)=><SelectItem key={entry} value={entry}>{entry}</SelectItem>)}
    </SelectContent>
  </Select>;
}
function CouncilChoice({value,onChange}:{value:string;onChange:(value:string)=>void}){
  return <Select value={value||""} onValueChange={onChange}>
    <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue placeholder="CREA, CAU ou CFT/CRT" /></SelectTrigger>
    <SelectContent>{professionalCouncilOptions.map((entry)=><SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent>
  </Select>;
}
export function ProtocolTechnicalResponsibility({form,setField,setToggle,counterMode=false,clerkName}:Props) {
  const projectCouncil=form.conselhoProfissional || inferProfessionalCouncil(form.tipoProfissional);
  const executionCouncil=form.execucaoMesmoResponsavel!==false ? projectCouncil : (form.execucaoConselho || inferProfessionalCouncil(form.execucaoTipoProfissional));
  return <SectionCard title="Responsabilidades técnicas e protocolo"
    description="Defina projeto, execução e protocolante, com ART/CREA, RRT/CAU ou TRT/CFT-CRT conforme a habilitação."
    icon={UserRoundCheck} contentClassName="space-y-5">
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>{technicalResponsibilityLabel(projectCouncil)} do projeto</Label>
        <Input value={form.responsabilidadeProjeto||""} onChange={(e)=>setField("responsabilidadeProjeto",e.target.value)} placeholder="Número do registro de responsabilidade do projeto" /></div>
      <div className="space-y-2"><Label>{technicalResponsibilityLabel(executionCouncil)} da execução</Label>
        <Input value={form.responsabilidadeExecucao||""} onChange={(e)=>setField("responsabilidadeExecucao",e.target.value)} placeholder="Número da responsabilidade pela execução, quando aplicável" /></div>
    </div>
    <label className="flex items-start gap-3 border-t border-slate-200 pt-4 text-sm font-medium text-slate-800 dark:border-white/10 dark:text-slate-100">
      <input type="checkbox" checked={form.execucaoMesmoResponsavel!==false} onChange={e=>setToggle("execucaoMesmoResponsavel",e.target.checked)} className="mt-1 h-4 w-4 accent-sky-700" />
      O responsável pela execução é o mesmo profissional responsável pelo projeto
    </label>
    {form.execucaoMesmoResponsavel===false ? <div data-execution-responsible="true" className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04] md:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-2"><Label>Responsável técnico pela execução *</Label><Input value={form.execucaoNome||""} onChange={e=>setField("execucaoNome",e.target.value)}/></div>
      <div className="space-y-2"><Label>CPF/CNPJ *</Label><Input value={form.execucaoDocumento||""} onChange={e=>setField("execucaoDocumento",e.target.value)}/></div>
      <div className="space-y-2"><Label>Atividade profissional *</Label><ActivityChoice value={form.execucaoTipoProfissional||""} onChange={v=>{setField("execucaoTipoProfissional",v);setField("execucaoConselho",inferProfessionalCouncil(v));}}/></div>
      <div className="space-y-2"><Label>Conselho</Label><CouncilChoice value={executionCouncil} onChange={v=>setField("execucaoConselho",v)}/></div>
      <div className="space-y-2"><Label>Registro profissional *</Label><Input value={form.execucaoRegistro||""} onChange={e=>setField("execucaoRegistro",e.target.value)}/></div>
      <div className="space-y-2"><Label>Inscrição municipal</Label><Input value={form.execucaoInscricaoMunicipal||""} onChange={e=>setField("execucaoInscricaoMunicipal",e.target.value)}/></div>
      <div className="space-y-2"><Label>Telefone</Label><Input value={form.execucaoTelefone||""} onChange={e=>setField("execucaoTelefone",e.target.value)}/></div>
      <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.execucaoEmail||""} onChange={e=>setField("execucaoEmail",e.target.value)}/></div>
    </div> : null}
    {counterMode ? (
      <div data-counter-clerk-identity="true" className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
        <p className="font-bold">Atendimento presencial registrado pelo servidor</p>
        <p>Servidor autenticado: {clerkName || "Identificado na sessão institucional"}</p>
        <p className="text-xs">O servidor é o autor do registro no SIGAPRO. Os dados do profissional habilitado acima são independentes e não concedem acesso nem assinatura a terceiros.</p>
      </div>
    ) : (
      <>
    <label className="flex items-start gap-3 border-t border-slate-200 pt-4 text-sm font-medium text-slate-800 dark:border-white/10 dark:text-slate-100">
      <input type="checkbox" checked={form.protocolanteMesmoResponsavel!==false} onChange={e=>setToggle("protocolanteMesmoResponsavel",e.target.checked)} className="mt-1 h-4 w-4 accent-sky-700" />
      O protocolante é o mesmo responsável técnico pelo projeto
    </label>
    {form.protocolanteMesmoResponsavel===false ? <div data-protocol-requester="true" className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04] md:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-2"><Label>Nome do protocolante *</Label><Input value={form.protocolanteNome||""} onChange={e=>setField("protocolanteNome",e.target.value)}/></div>
      <div className="space-y-2"><Label>CPF/CNPJ *</Label><Input value={form.protocolanteDocumento||""} onChange={e=>setField("protocolanteDocumento",e.target.value)}/></div>
      <div className="space-y-2"><Label>Atividade/função</Label><Input value={form.protocolanteTipoProfissional||""} onChange={e=>setField("protocolanteTipoProfissional",e.target.value)} placeholder="Profissional, representante ou procurador"/></div>
      <div className="space-y-2"><Label>Conselho, quando houver</Label><CouncilChoice value={form.protocolanteConselho||""} onChange={v=>setField("protocolanteConselho",v)}/></div>
      <div className="space-y-2"><Label>Registro profissional</Label><Input value={form.protocolanteRegistro||""} onChange={e=>setField("protocolanteRegistro",e.target.value)}/></div>
      <div className="space-y-2"><Label>Inscrição municipal</Label><Input value={form.protocolanteInscricaoMunicipal||""} onChange={e=>setField("protocolanteInscricaoMunicipal",e.target.value)}/></div>
      <div className="space-y-2"><Label>Telefone</Label><Input value={form.protocolanteTelefone||""} onChange={e=>setField("protocolanteTelefone",e.target.value)}/></div>
      <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.protocolanteEmail||""} onChange={e=>setField("protocolanteEmail",e.target.value)}/></div>
    </div> : null}
      </>
    )}
    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
      Os dados técnicos acompanham o processo, mas não substituem a identidade autenticada, a validação das atribuições profissionais ou as assinaturas oficiais.
    </p>
  </SectionCard>;
}
