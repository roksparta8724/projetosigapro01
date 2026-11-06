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
  zoneVerified: false;
  legalConformity: "not_evaluated";
  reasons: string[];
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
  const reasons:string[]=[];
  if(status==="missing")reasons.push("Processo sem vinculo com cadastro municipal de imovel (property_id).");
  if(status==="unverified")reasons.push("Nao foi possivel verificar o vinculo cadastral com seguranca.");
  if(linked&&!address)reasons.push("Endereco cadastral do imovel nao informado.");
  if(linked&&!registration&&!iptu)reasons.push("Inscricao ou identificador cadastral do lote nao informado.");
  if(linked&&!zoneCandidate)reasons.push("Zona do imovel nao consta no cadastro.");
  if(linked&&zoneCandidate)reasons.push("Zona cadastrada e apenas indicativa; falta prova cartografica da sua delimitacao.");
  reasons.push("Mapa oficial de zoneamento, geometria do lote e vigencia legal nao foram conciliados neste processo.");
  reasons.push("Nenhuma norma municipal real foi homologada automaticamente por esta leitura.");
  return {cadastralLink:status,address,registration,iptu,lot,block,
    useDeclared,zoneCandidate,zoneVerified:false,legalConformity:"not_evaluated",reasons};
}
