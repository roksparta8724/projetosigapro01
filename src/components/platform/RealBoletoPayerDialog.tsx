import {useEffect,useState,type FormEvent} from "react";
import {Loader2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
  Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,
} from "@/components/ui/dialog";
import type {BoletoPayerForm} from "@/lib/mercadoPagoGuide";

const blank: BoletoPayerForm = {
  email:"",street_name:"",street_number:"",zip_code:"",
  neighborhood:"",city:"",state:"",
};
type Field=keyof BoletoPayerForm;
const fields: Array<{key:Field,label:string,placeholder:string,autocomplete?:string}> = [
  {key:"email",label:"E-mail do pagador",placeholder:"contato@exemplo.com",autocomplete:"email"},
  {key:"zip_code",label:"CEP",placeholder:"00000-000",autocomplete:"postal-code"},
  {key:"street_name",label:"Rua ou avenida",placeholder:"Endereço do pagador",autocomplete:"address-line1"},
  {key:"street_number",label:"Número",placeholder:"S/N"},
  {key:"neighborhood",label:"Bairro",placeholder:"Bairro"},
  {key:"city",label:"Cidade",placeholder:"Município",autocomplete:"address-level2"},
  {key:"state",label:"UF",placeholder:"SP",autocomplete:"address-level1"},
];
export function RealBoletoPayerDialog(props:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  guideCode:string;
  payerName:string;
  busy:boolean;
  onConfirm:(fields:BoletoPayerForm)=>Promise<void>;
  error?:string;
}){
  const [form,setForm]=useState<BoletoPayerForm>(blank);
  useEffect(()=>{if(!props.open)setForm(blank);},[props.open,props.guideCode]);
  const update=(key:Field,value:string)=>{
    setForm(current=>({...current,[key]:key==="state"?value.toUpperCase().slice(0,2):value}));
  };
  const submit=(event:FormEvent)=>{
    event.preventDefault();
    if(props.busy)return;
    void props.onConfirm({...form});
  };
  return <Dialog open={props.open} onOpenChange={open=>{if(!props.busy)props.onOpenChange(open);}}>
    <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto border-slate-200 bg-white text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50">
      <DialogHeader>
        <DialogTitle className="text-xl">Emitir boleto oficial</DialogTitle>
        <DialogDescription className="leading-relaxed">
          Guia {props.guideCode} · Titular cadastrado: {props.payerName||"Confira o cadastro"}.
          Os dados abaixo serão enviados ao banco somente depois da sua confirmação.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
        <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
        O CPF/CNPJ e o nome do titular são obtidos da guia registrada no SIGAPRO; não podem ser substituídos neste formulário.
      </div>
      <form onSubmit={submit} className="space-y-4" data-real-boleto-payer-form="true">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(({key,label,placeholder,autocomplete})=>(
            <div key={key} className={key==="street_name"||key==="email"?"sm:col-span-2":""}>
              <Label htmlFor={"boleto-payer-"+key} className="mb-1.5 block font-semibold">{label}</Label>
              <Input id={"boleto-payer-"+key} required
                value={form[key]} onChange={e=>update(key,e.target.value)}
                placeholder={placeholder} autoComplete={autocomplete}
                maxLength={key==="zip_code"?9:key==="state"?2:150}
                className="border-slate-300 bg-white text-slate-950 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                disabled={props.busy}/>
            </div>
          ))}
        </div>
        {props.error?<p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-medium text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100">{props.error}</p>:null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={props.busy} onClick={()=>props.onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={props.busy} className="bg-sky-700 text-white hover:bg-sky-800">
            {props.busy?<Loader2 className="mr-2 size-4 animate-spin"/>:null}
            Confirmar emissão bancária
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
