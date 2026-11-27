import {useSyncExternalStore} from "react";
import type {MunicipalStaffAssignment} from "./municipalStaffAssignments";
type Transition={profileId:string;municipalityId:string;assignmentId:string;departmentName:string;epoch:number};
let active:Transition|null=null;
const epochs=new Map<string,number>();
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(fn=>fn());
export const isMunicipalContextBusy=(id:string|null|undefined)=>Boolean(id&&active?.profileId===id);
export const contextEpoch=(id:string|null|undefined)=>epochs.get(id||"")??0;
export function beginMunicipalContextTransition(assignment:MunicipalStaffAssignment):Transition|null{
 if(active?.profileId===assignment.profileId)return null;
 const epoch=contextEpoch(assignment.profileId)+1;
 epochs.set(assignment.profileId,epoch);
 active={profileId:assignment.profileId,municipalityId:assignment.municipalityId,assignmentId:assignment.id,departmentName:assignment.departmentName,epoch};
 notify();return active;
}
export function finishMunicipalContextTransition(transition:Transition){
 if(active===transition){active=null;notify();}
}
export function isCurrentMunicipalContextTransition(transition:Transition){return active===transition;}
export function cancelForeignMunicipalTransition(profileId:string|null){
 if(active&&active.profileId!==profileId){const old=active;epochs.set(old.profileId,contextEpoch(old.profileId)+1);active=null;notify();}
}
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const snapshot=()=>active;
export function useMunicipalContextTransition(profileId:string){
 const current=useSyncExternalStore(subscribe,snapshot,snapshot);
 return current?.profileId===profileId?current:null;
}
