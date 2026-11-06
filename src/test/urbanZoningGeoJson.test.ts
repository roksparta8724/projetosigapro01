import {describe,expect,it} from "vitest";
import {parseZoningGeoJson,parseParcelGeoJson,batchesOfZoneFeatures} from "@/lib/urbanZoningGeoJson";
import {buildUrbanTerritorialReadiness} from "@/lib/urbanTerritorialReadiness";
const box=(x1:number,y1:number,x2:number,y2:number)=>({
  type:"Polygon",coordinates:[[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]],
});
const officialFeature=(zone:string,id:string,geometry=box(-46.8,-23.25,-46.7,-23.2))=>({
  type:"Feature",id,properties:{zone_code:zone},geometry,
});
const fakeHash="a".repeat(64), parcelHash="b".repeat(64);
describe("SIGAPRO GIS: fonte e segmentação",()=>{
  it("rejeita polígonos sem nome legal de zona, mesmo com cores",()=>{
    expect(()=>parseZoningGeoJson({type:"FeatureCollection",
      features:[{type:"Feature",properties:{color:"#aaa"},geometry:box(-46,-23,-45,-22)}]}))
      .toThrow(/zone_code/);
  });
  it("recusa CRS não WGS84 e multipolígonos não identificados",()=>{
    expect(()=>parseZoningGeoJson({type:"FeatureCollection",
      crs:{type:"name",properties:{name:"EPSG:31983"}},
      features:[officialFeature("ZM-MA","01")]})).toThrow(/EPSG:4326/);
    expect(()=>parseParcelGeoJson({type:"FeatureCollection",
      features:[officialFeature("ZM-MA","a"),officialFeature("ZM-MB","b")]}))
      .toThrow(/exatamente uma/);
  });
  it("gera lotes de importação determinísticos sem alterar feições",()=>{
    const features=parseZoningGeoJson({type:"FeatureCollection",
      features:Array.from({length:113},(_,i)=>officialFeature("ZM-MA",String(i+1)))});
    expect(batchesOfZoneFeatures(features,50).map(x=>x.length)).toEqual([50,50,13]);
    expect(features[0].feature_key).toBe("1");
    expect(features[112].zone_code).toBe("ZM-MA");
  });
  it("recusa feições duplicadas e não inventa identificadores jurídicos",()=>{
    expect(()=>parseZoningGeoJson({type:"FeatureCollection",
      features:[officialFeature("A","same"),officialFeature("B","same")]})).toThrow(/único/);
  });
  it("somente fonte espacial verificada reconhece zona; geocódigo não basta",()=>{
    const property={id:"QA",address:"Rua Fictícia",iptu_code:"QA001",zone_code:"ZM-MA"};
    const base=buildUrbanTerritorialReadiness("linked",property);
    expect(base.zoneVerified).toBe(false);
    const ready=buildUrbanTerritorialReadiness("linked",property,{
      status:"verified",zoneVerified:true,zoneCode:"ZM-MA",
      mapVersion:"LC379-AnexoI",legalReference:"LC 379/2009 - Anexo I",
      mapSha256:fakeHash,parcelSha256:parcelHash,sourceUrl:"https://prefeitura.example/geojson",
    });
    expect(ready.zoneVerified).toBe(true);
    expect(ready.zoneCode).toBe("ZM-MA");
    expect(ready.legalConformity).toBe("not_evaluated");
    const invalid=buildUrbanTerritorialReadiness("linked",property,{
      status:"verified",zoneVerified:true,zoneCode:"ZM-MA",mapSha256:"invalid",parcelSha256:parcelHash,
    });
    expect(invalid.zoneVerified).toBe(false);
    expect(invalid.zoneCode).toBe("");
  });
  it("se vínculo não for municipalmente validado, descarta dados espaciais",()=>{
    const status=buildUrbanTerritorialReadiness("unverified",{id:"foreign",address:"segredo"},{
      status:"verified",zoneVerified:true,zoneCode:"ZM-MA",
      mapSha256:fakeHash,parcelSha256:parcelHash,
    });
    expect(status.zoneVerified).toBe(false);
    expect(status.address).toBe("");
    expect(status.zoneCode).toBe("");
  });
});
