import {useEffect,useState} from "react";
/** Keep the institutional shell; never render previous department data.
 * The reserved body height prevents the footer jumping into the workspace.
 * A normal switch has no toast or generic timeout recovery card.
 */
export function MunicipalTransitionSurface({departmentName}:{departmentName:string}){
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const timer=window.setTimeout(()=>setSlow(true),15000);return()=>window.clearTimeout(timer);},[]);
 return <div data-sigapro-department-transition="true" className="relative min-h-[max(320px,calc(100dvh-280px))] w-full" aria-busy="true">
   <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden rounded-full bg-sky-500/10" aria-hidden="true">
     <div className="h-full w-1/3 rounded-full bg-sky-500/80 motion-safe:animate-pulse dark:bg-sky-300/80"/>
   </div>
   <span role="status" aria-live="polite" className="sr-only">Abrindo {departmentName}</span>
   {slow?<p className="absolute right-0 top-3 max-w-[calc(100%-12px)] text-right text-xs text-slate-600 dark:text-slate-300">Sincronizando {departmentName}…</p>:null}
 </div>;
}
