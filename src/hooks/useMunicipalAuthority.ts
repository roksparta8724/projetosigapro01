import {useEffect,useMemo,useState} from "react";
import {getRemoteMunicipalAuthorityCapabilities,listRemoteMunicipalIdentityBadges} from "@/integrations/backend/platform";
import {noMunicipalAuthority,type MunicipalAuthorityCapabilities,type MunicipalIdentityBadge} from "@/lib/municipalAuthorityDesignations";
export const MUNICIPAL_AUTHORITY_UPDATED="sigapro:municipal-authority-updated";
export function useMunicipalIdentityBadges(municipalityId:string,viewerId:string,profileIds:readonly string[],contextKey=""){
 const idKey=JSON.stringify([...new Set(profileIds)].sort());
 const scope=JSON.stringify([municipalityId,viewerId,idKey]);
 const [state,setState]=useState<{scope:string;contextKey:string;rows:MunicipalIdentityBadge[]}|null>(null);
 useEffect(()=>{
  const ids=JSON.parse(idKey) as string[];
  if(!municipalityId||!viewerId||viewerId==="unknown"||!ids.length)return;
  let active=true;let epoch=0;
  const refresh=()=>{const request=++epoch;void listRemoteMunicipalIdentityBadges(municipalityId,ids).then(rows=>{if(active&&request===epoch)setState({scope,contextKey,rows});}).catch(()=>{if(active&&request===epoch)setState({scope,contextKey,rows:[]});});};
  refresh();window.addEventListener(MUNICIPAL_AUTHORITY_UPDATED,refresh);window.addEventListener("focus",refresh);
  return()=>{active=false;window.removeEventListener(MUNICIPAL_AUTHORITY_UPDATED,refresh);window.removeEventListener("focus",refresh);};
 },[municipalityId,viewerId,idKey,scope,contextKey]);
 return useMemo(()=>new Map((state?.scope===scope?state.rows.filter(row=>state.contextKey===contextKey||row.fixed):[]).map(row=>[row.profileId,row])),[scope,state,contextKey]);
}
export function useMunicipalAuthorityCapabilities(processId:string,viewerId:string,contextKey:string,enabled=true){
 const scope=JSON.stringify([processId,viewerId,contextKey,enabled]);
 const [state,setState]=useState<{scope:string;value:MunicipalAuthorityCapabilities}|null>(null);
 useEffect(()=>{
  if(!enabled||!processId||!viewerId||viewerId==="unknown")return;
  let active=true;let epoch=0;
  const refresh=()=>{const request=++epoch;void getRemoteMunicipalAuthorityCapabilities(processId).then(value=>{if(active&&request===epoch)setState({scope,value});}).catch(()=>{if(active&&request===epoch)setState({scope,value:noMunicipalAuthority});});};
  refresh();window.addEventListener(MUNICIPAL_AUTHORITY_UPDATED,refresh);window.addEventListener("focus",refresh);
  const timer=window.setInterval(refresh,30000);
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener(MUNICIPAL_AUTHORITY_UPDATED,refresh);window.removeEventListener("focus",refresh);};
 },[enabled,processId,viewerId,scope]);
 return state?.scope===scope?state.value:noMunicipalAuthority;
}
