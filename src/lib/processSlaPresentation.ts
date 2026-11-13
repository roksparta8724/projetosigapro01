/** Prevent a stale QA SLA snapshot from showing positive hours after its due date. */
function parseCalendarDate(value:string):Date|null{
  const br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso=/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if(!br&&!iso)return null;
  const year=Number(br?br[3]:iso![1]);
  const month=Number(br?br[2]:iso![2]);
  const day=Number(br?br[1]:iso![3]);
  const parsed=new Date(year,month-1,day);
  return parsed.getFullYear()===year&&parsed.getMonth()===month-1&&
    parsed.getDate()===day?parsed:null;
}
export function formatProcessSlaDeadline(
  dueDate:unknown,hoursRemaining:unknown,now=new Date(),
):string{
  const date=typeof dueDate==="string"?dueDate.trim():"";
  if(!date||date==="-")return "Prazo não informado";
  const parsed=parseCalendarDate(date);
  if(!parsed)return "Prazo "+date+" · verificar data cadastrada";
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(parsed.getTime()<today.getTime())
    return "Prazo "+date+" · data vencida (conferir SLA)";
  const hours=typeof hoursRemaining==="number"?hoursRemaining:Number(hoursRemaining);
  if(!Number.isFinite(hours)||hours<0)return "Prazo "+date+" · conferir SLA";
  return "Prazo "+date+" · "+Math.ceil(hours)+"h restantes";
}
