/** A bank guide's due date is a Brazilian CIVIL DATE, not a UTC instant.
 * This is only for display, never confirmation or modification of payment. */
function brazilCivilToday(now:Date):string|null {
  if(!Number.isFinite(now.getTime()))return null;
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  return [part("year"),part("month"),part("day")].join("-");
}
/** Accept exact ISO civil dates, ISO timestamps and dd/mm/yyyy. Never guess. */
export function parseGuideCivilDueDate(raw:string|null|undefined):string|null {
  const s=String(raw||"").trim();
  const iso=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s);
  const br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if(!iso&&!br)return null;
  const year=Number(iso?.[1]||br?.[3]);
  const month=Number(iso?.[2]||br?.[2]);
  const day=Number(iso?.[3]||br?.[1]);
  if(year<1900||year>9999||month<1||month>12||day<1||day>31)return null;
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
  return [String(year).padStart(4,"0"),String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
}
export function isGuideOverdueOnBrazilDate(dueDate:string|null|undefined,now:Date=new Date()):boolean {
  const due=parseGuideCivilDueDate(dueDate);
  const today=brazilCivilToday(now);
  return Boolean(due&&today&&due<today);
}
