import {useEffect,useState} from "react";
/** Keep real institutional chrome, never render previous department data. */
export function MunicipalTransitionSurface({departmentName}:{departmentName:string}){
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const timer=window.setTimeout(()=>setSlow(true),15000);return()=>window.clearTimeout(timer);},[]);
 return <div data-sigapro-department-transition="true" className="sigapro-workspace-pending min-h-[max(280px,calc(100dvh-280px))] w-full" aria-busy="true">
   <div className="sigapro-pending-line" aria-hidden="true"><span/></div>
   <div role="status" aria-live="polite" className="sigapro-pending-status">
     <span className="sigapro-pending-dot" aria-hidden="true"/>
     <span className="min-w-0"><strong className="block">Abrindo {departmentName}</strong><span className="mt-1 block text-xs">{slow?"Confirmando a conexão com o banco oficial.":"Sincronizando o ambiente autorizado."}</span></span>
   </div>
 </div>;
}
