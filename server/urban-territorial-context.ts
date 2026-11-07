import type { IncomingMessage } from "node:http";
import { callDataApiRpc, getDataApiUrl, readBearer } from "./municipal-storage.js";
import {
  buildUrbanTerritorialReadiness,
  type UrbanTerritorialReadiness,
  type UrbanSpatialResolution,
} from "../src/lib/urbanTerritorialReadiness.js";

/** After the same-document authorization gate, read only the cadastral
 * relationship. This does not geocode, assume the zoning map or grant approval.
 */
export async function inspectProcessTerritory(
  req: IncomingMessage, municipalityId:string, processId:string,
):Promise<UrbanTerritorialReadiness> {
  const fallback=()=>buildUrbanTerritorialReadiness("unverified");
  try {
    const headers={
      Authorization:"Bearer "+readBearer(req),Accept:"application/json",
    };
    const processQuery=new URLSearchParams({
      id:"eq."+processId,municipality_id:"eq."+municipalityId,
      select:"id,municipality_id,property_id",limit:"1",
    });
    const response=await fetch(getDataApiUrl()+"/processes?"+processQuery,{
      method:"GET",headers,cache:"no-store",redirect:"error",
    });
    if(!response.ok)return fallback();
    const rows=await response.json() as Array<{id?:string;municipality_id?:string;property_id?:string|null}>;
    const process=Array.isArray(rows)?rows[0]:null;
    if(!process||process.id!==processId||process.municipality_id!==municipalityId)
      return fallback();
    if(!process.property_id)return buildUrbanTerritorialReadiness("missing");
    const propertyQuery=new URLSearchParams({
      id:"eq."+process.property_id,municipality_id:"eq."+municipalityId,
      select:"id,municipality_id,address,registry_code,iptu_code,lot,block,usage_type,zone_code",
      limit:"1",
    });
    const propertyResponse=await fetch(getDataApiUrl()+"/properties?"+propertyQuery,{
      method:"GET",headers,cache:"no-store",redirect:"error",
    });
    if(!propertyResponse.ok)return fallback();
    const properties=await propertyResponse.json() as Array<{
      id?:string;municipality_id?:string;address?:string;registry_code?:string;
      iptu_code?:string;lot?:string;block?:string;usage_type?:string;zone_code?:string;
    }>;
    const property=Array.isArray(properties)?properties[0]:null;
    if(!property||property.id!==process.property_id||property.municipality_id!==municipalityId)
      return fallback();
    // The spatial resolver executes in Neon with RLS-aware profile/municipality
    // guards, official source hashes, map effective dates and PostGIS geometry.
    // Never geocode from an address or trust the zone_code written in properties.
    const spatial=await callDataApiRpc<UrbanSpatialResolution>(
      req,"urban_zoning_resolve_process_v1",{_process_id:processId}
    );
    if(!spatial.ok||!spatial.payload){
      return buildUrbanTerritorialReadiness("linked",property,{status:"spatial_service_unavailable"});
    }
    return buildUrbanTerritorialReadiness("linked",property,spatial.payload);
  } catch {
    return fallback();
  }
}
