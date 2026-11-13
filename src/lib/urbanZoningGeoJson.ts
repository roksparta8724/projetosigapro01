/** GIS import is intentionally strict: no CRS guessing, geometry invention or
 * zone_code inferred from color/legend/filename. PostGIS revalidates all polygons.
 */
export type ZoningGeoFeature = {
  feature_key:string;zone_code:string;
  geometry:{type:"Polygon"|"MultiPolygon";coordinates:unknown};
};
type JsonObject=Record<string,unknown>;
const object=(value:unknown):JsonObject|null=>
  value!==null&&typeof value==="object"&&!Array.isArray(value)?value as JsonObject:null;
function geo(value:unknown):ZoningGeoFeature["geometry"]{
  const obj=object(value);
  if(!obj||!["Polygon","MultiPolygon"].includes(String(obj.type))||
    !Array.isArray(obj.coordinates) ||
    JSON.stringify(obj.coordinates).length>190000)
    throw new Error("GeoJSON não possui polígono ou multipolígono verificável.");
  return {type:obj.type as "Polygon"|"MultiPolygon",coordinates:obj.coordinates};
}
function requireCrs(obj:JsonObject){
  if(obj.crs!==undefined&&obj.crs!==null){
    const crs=object(obj.crs);
    const value=object(crs?.properties)?.name;
    if(value!=="EPSG:4326"&&value!=="urn:ogc:def:crs:OGC:1.3:CRS84")
      throw new Error("Envie um GeoJSON em EPSG:4326 (WGS84). Não converta coordenadas automaticamente.");
  }
}
export function parseZoningGeoJson(raw:unknown):ZoningGeoFeature[]{
  const root=object(raw);
  if(!root||root.type!=="FeatureCollection"||!Array.isArray(root.features)||
    root.features.length<1||root.features.length>3000)
    throw new Error("Envie FeatureCollection com 1 a 3000 zonas cartográficas.");
  requireCrs(root);
  const keys=new Set<string>();
  const result:ZoningGeoFeature[]=[];
  for(const [i,item] of root.features.entries()){
    const feature=object(item);
    if(feature?.type!=="Feature")throw new Error("A camada deve conter somente GeoJSON Feature.");
    const props=object(feature.properties);
    const zone=typeof props?.zone_code==="string"?props.zone_code.trim().toUpperCase():"";
    const id=typeof feature.id==="string"||typeof feature.id==="number"
      ?String(feature.id):typeof props?.feature_key==="string"
        ?props.feature_key:"feature-"+(i+1);
    const featureKey=id.trim();
    if(!/^[A-Z0-9][A-Z0-9_(). /-]{0,79}$/.test(zone)||
      featureKey.length<1||featureKey.length>120||keys.has(featureKey))
      throw new Error("Toda feição deve ter zone_code válido e identificador único; linha "+(i+1)+".");
    keys.add(featureKey);
    result.push({feature_key:featureKey,zone_code:zone,geometry:geo(feature.geometry)});
  }
  return result;
}
export function parseParcelGeoJson(raw:unknown):ZoningGeoFeature["geometry"]{
  const root=object(raw);
  if(!root)throw new Error("Arquivo cadastral GeoJSON inválido.");
  requireCrs(root);
  if(root.type==="FeatureCollection"){
    if(!Array.isArray(root.features)||root.features.length!==1)
      throw new Error("O perímetro de um imóvel deve conter exatamente uma feição.");
    return parseParcelGeoJson(root.features[0]);
  }
  return geo(root.type==="Feature"?root.geometry:root);
}
export function batchesOfZoneFeatures(features:ZoningGeoFeature[],size=50){
  if(!Number.isInteger(size)||size<1||size>100)throw new Error("Lote GIS inválido.");
  const batches:ZoningGeoFeature[][]=[];
  for(let i=0;i<features.length;i+=size)batches.push(features.slice(i,i+size));
  return batches;
}
