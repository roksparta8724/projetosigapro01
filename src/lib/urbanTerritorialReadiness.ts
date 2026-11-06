/** Read-only territorial evidence for an architectural PDF.
 * Never infer a legal zone from the street address, a self-declared code or a picture.
 * Verification requires the official cadastre plus a legally effective zoning map.
 */
export type UrbanTerritorialReadiness = {
  cadastralLink: "linked" | "missing" | "unverified";
  address: string;
  registration: string;
  iptu: string;
  lot: string;
  block: string;
  useDeclared: string;
  zoneCandidate: string;
  zoneVerified: boolean;
  zoneCode: string;
  geoStatus: string;
  mapVersion: string;
  mapLegalReference: string;
  mapSha256: string;
  parcelSha256: string;
  mapSourceUrl: string;
  legalConformity: "not_evaluated";
  reasons: string[];
};

export type UrbanSpatialResolution = {
  status?: unknown;
  zoneVerified?: unknown;
  zoneCode?: unknown;
  mapVersion?: unknown;
  legalReference?: unknown;
  mapSha256?: unknown;
  parcelSha256?: unknown;
  sourceUrl?: unknown;
};
type PropertyCandidate = {
  id?: unknown;
  address?: unknown;
  registry_code?: unknown;
  iptu_code?: unknown;
  lot?: unknown;
  block?: unknown;
  usage_type?: unknown;
  zone_code?: unknown;
};
const safe = (input: unknown, max = 180) =>
  typeof input === "string" ? input.replace(/[\r\n\t]+/g," ").trim().slice(0,max) : "";

export function buildUrbanTerritorialReadiness(
  cadastralLink: UrbanTerritorialReadiness["cadastralLink"],
  property?: PropertyCandidate | null,
  spatial?: UrbanSpatialResolution | null,
): UrbanTerritorialReadiness {
  const linked = cadastralLink === "linked" && !!property?.id;
  const status: UrbanTerritorialReadiness["cadastralLink"] =
    linked ? "linked" : cadastralLink === "missing" ? "missing" : "unverified";
  const address=linked?safe(property?.address):"";
  const registration=linked?safe(property?.registry_code,100):"";
  const iptu=linked?safe(property?.iptu_code,80):"";
  const lot=linked?safe(property?.lot,60):"";
  const block=linked?safe(property?.block,60):"";
  const useDeclared=linked?safe(property?.usage_type,80):"";
  const zoneCandidate=linked?safe(property?.zone_code,80):"";
  const zoneVerified=linked && spatial?.status==="verified" &&
    spatial.zoneVerified===true &&
    typeof spatial.zoneCode==="string" && /^[A-Z0-9][A-Z0-9_(). /-]{0,79}$/.test(spatial.zoneCode) &&
    typeof spatial.mapSha256==="string" && /^[0-9a-f]{64}$/.test(spatial.mapSha256) &&
    typeof spatial.parcelSha256==="string" && /^[0-9a-f]{64}$/.test(spatial.parcelSha256);
  const zoneCode=zoneVerified?safe(spatial?.zoneCode,80):"";
  const geoStatus=safe(spatial?.status,80)||"unverified";
  const mapVersion=zoneVerified?safe(spatial?.mapVersion,100):"";
  const mapLegalReference=zoneVerified?safe(spatial?.legalReference,400):"";
  const mapSha256=zoneVerified?safe(spatial?.mapSha256,64):"";
  const parcelSha256=zoneVerified?safe(spatial?.parcelSha256,64):"";
  const mapSourceUrl=zoneVerified?safe(spatial?.sourceUrl,500):"";
  const reasons:string[]=[];
  if(status==="missing")reasons.push("Processo sem vinculo com cadastro municipal de imovel (property_id).");
  if(status==="unverified")reasons.push("Nao foi possivel verificar o vinculo cadastral com seguranca.");
  if(linked&&!address)reasons.push("Endereco cadastral do imovel nao informado.");
  if(linked&&!registration&&!iptu)reasons.push("Inscricao ou identificador cadastral do lote nao informado.");
  if(linked&&!zoneCandidate&&!zoneVerified)reasons.push("Zona do imovel nao consta no cadastro.");
  if(linked&&zoneCandidate&&!zoneVerified)reasons.push("Zona cadastrada e apenas indicativa; falta prova cartografica da sua delimitacao.");
  if(!zoneVerified) reasons.push("Mapa oficial de zoneamento, geometria verificada do lote e vigencia cartografica ainda nao foram conciliados ("+geoStatus+").");
  reasons.push("A conferencia juridica por uso, parametro, artigo, pagina e vigencia permanece independente da verificacao cartografica.");
  return {cadastralLink:status,address,registration,iptu,lot,block,
    useDeclared,zoneCandidate,zoneVerified:Boolean(zoneVerified),zoneCode,geoStatus,
    mapVersion,mapLegalReference,mapSha256,parcelSha256,mapSourceUrl,
    legalConformity:"not_evaluated",reasons};
}
