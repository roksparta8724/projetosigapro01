import type {MunicipalIdentityBadge} from "@/lib/municipalAuthorityDesignations";
export function MunicipalIdentityPrefix({badge,dark=false}:{badge?:MunicipalIdentityBadge;dark?:boolean}){
 const code=badge?.code.trim();
 if(!code)return null;
 return <span data-municipal-identity-prefix="true" data-fixed-organogram={badge?.fixed?"true":"false"} title={badge?.name} aria-label={code+" — "+badge?.name} className={"inline-flex h-5 max-w-[76px] shrink-0 items-center truncate rounded-md border px-1.5 text-[10px] font-bold leading-none tracking-[0.035em] "+(dark?"border-sky-300/35 bg-sky-400/15 !text-sky-100":"border-sky-200 bg-sky-50 !text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:!text-sky-100")}>{code}</span>;
}
