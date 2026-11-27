import {SecureRoutePending} from "@/components/platform/SecureRoutePending";
/** Never reopen previous department data while the new context is unconfirmed. */
export function MunicipalTransitionSurface({departmentName}:{departmentName:string}){
 return <div data-sigapro-department-transition="true" aria-busy="true">
  <SecureRoutePending surface="route" title={"Abrindo "+departmentName} detail="Confirmando a lotação e as permissões autorizadas."/>
 </div>;
}
