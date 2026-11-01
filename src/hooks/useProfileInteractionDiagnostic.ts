/** QA-only, local browser interaction measurement.
 * No PII, user identifiers, URLs, or network transmission.
 * A logged reading is diagnostic; a green build does not prove INP <= 200 ms.
 */
import { useEffect } from "react";
export function useProfileInteractionDiagnostic() {
 useEffect(()=>{
   if(import.meta.env.PROD && import.meta.env.VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED!=="true")return;
   if(typeof PerformanceObserver==="undefined")return;
   if(!PerformanceObserver.supportedEntryTypes?.includes("event"))return;
   const observer=new PerformanceObserver(list=>{
     for(const raw of list.getEntries()){
       const entry=raw as PerformanceEntry & {
         duration:number;processingStart?:number;processingEnd?:number;
         target?:EventTarget|null;name:string;
       };
       const target=entry.target;
       if(!(target instanceof Element))continue;
       if(!target.closest(".sig-topbar-profile-trigger"))continue;
       const delay=Math.max(0,(entry.processingStart??entry.startTime)-entry.startTime);
       const processing=Math.max(0,(entry.processingEnd??entry.startTime)-(entry.processingStart??entry.startTime));
       console.debug("[SIGAPRO QA] Profile interaction",{
         type:entry.name,durationMs:Math.round(entry.duration),
         inputDelayMs:Math.round(delay),handlerMs:Math.round(processing),
         paintWaitMs:Math.round(Math.max(0,entry.duration-delay-processing)),
         needsImprovement:entry.duration>200,
       });
     }
   });
   try {observer.observe({type:"event",buffered:true,durationThreshold:104});}
   catch {observer.disconnect();return;}
   return ()=>observer.disconnect();
 },[]);
}
