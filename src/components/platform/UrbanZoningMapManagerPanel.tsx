import {useEffect,useState} from "react";
import {FileJson2,MapPinned,ShieldCheck,AlertTriangle,Loader2} from "lucide-react";
import {backendClient} from "@/integrations/backend/databaseClient";
import {batchesOfZoneFeatures,parseParcelGeoJson,parseZoningGeoJson} from "@/lib/urbanZoningGeoJson";

type MapRecord={
  id:string;version_label:string;legal_reference:string;status:string;
  official_source_url:string;official_source_sha256:string;effective_from:string;
  effective_until:string|null;feature_count:number;
};
type PropertyRecord={id:string;address:string;iptu_code:string;registry_code:string|null};
const field="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-[#17283d] dark:text-white";
const label="block min-w-0 text-xs font-bold leading-5 text-slate-800 dark:text-slate-100";
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  const result=await backendClient.rpc(name,args);
  if(result.error)throw new Error(result.error.message||"Operação espacial não concluída.");
  return result.data as T;
}
async function readGeoFile(file:File){
  if(file.size<20||file.size>3*1024*1024||!/\.geojson$|\.json$/i.test(file.name))
    throw new Error("Envie somente arquivo .geojson ou .json válido com até 3 MB.");
  const data=await file.arrayBuffer();
  const hash=await crypto.subtle.digest("SHA-256",data);
  const sha=Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");
  const source=JSON.parse(new TextDecoder().decode(data)) as unknown;
  return {source,sha};
}

/** Only municipal legal administrator can stage/verify GIS. No automatic
 * activation, no geocoding and no change to existing process or cadastral IPTU.
 */
export function UrbanZoningMapManagerPanel({
  municipalityId,canEdit,
}:{municipalityId:string;canEdit:boolean}){
  const [maps,setMaps]=useState<MapRecord[]>([]);
  const [version,setVersion]=useState("");
  const [legal,setLegal]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [validFrom,setValidFrom]=useState("");
  const [validUntil,setValidUntil]=useState("");
  const [mapFile,setMapFile]=useState<File|null>(null);
  const [mapDraftId,setMapDraftId]=useState("");
  const [mapConfirm,setMapConfirm]=useState(false);
  const [reviewNote,setReviewNote]=useState("");
  const [propertyQuery,setPropertyQuery]=useState("");
  const [properties,setProperties]=useState<PropertyRecord[]>([]);
  const [chosenProperty,setChosenProperty]=useState("");
  const [parcelFile,setParcelFile]=useState<File|null>(null);
  const [parcelSource,setParcelSource]=useState("");
  const [parcelDraft,setParcelDraft]=useState("");
  const [parcelReviewNote,setParcelReviewNote]=useState("");
  const [parcelConfirm,setParcelConfirm]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [info,setInfo]=useState("");
  const [ready,setReady]=useState(false);
  const reload=async()=>{
    const result=await rpc<unknown>("urban_zoning_list_maps_v1",{_municipality_id:municipalityId});
    setMaps(Array.isArray(result)?result as MapRecord[]:[]);
  };
  useEffect(()=>{
    let live=true;
    setReady(false);setMaps([]);setError("");setInfo("");
    if(!canEdit||!municipalityId)return;
    void rpc<unknown>("urban_zoning_list_maps_v1",{_municipality_id:municipalityId})
      .then(result=>{if(live){setMaps(Array.isArray(result)?result as MapRecord[]:[]);setReady(true);}})
      .catch(e=>{if(live)setError(String((e as Error)?.message||e));});
    return()=>{live=false;};
  },[municipalityId,canEdit]);

  async function importMap(){
    if(!canEdit||busy||!mapFile||!municipalityId)return;
    setBusy("map");setError("");setInfo("");
    try{
      if(!/^https:\/\/[^\s]+$/.test(sourceUrl)||!validFrom||!legal.trim()||!version.trim())
        throw new Error("Informe versão, lei/anexo, URL oficial e data de vigência comprovada.");
      const {source,sha}=await readGeoFile(mapFile);
      const features=parseZoningGeoJson(source);
      const existing=maps.find(item=>item.id===mapDraftId);
      if(existing && existing.official_source_sha256!==sha)
        throw new Error("O arquivo difere do SHA-256 do mapa iniciado. Não é permitido misturar versões.");
      const id=mapDraftId||await rpc<string>("urban_zoning_create_map_draft_v1",{
        _municipality_id:municipalityId,
        _version_label:version.trim(),
        _legal_reference:legal.trim(),
        _source_url:sourceUrl.trim(),
        _source_sha256:sha,
        _effective_from:validFrom,
        _effective_until:validUntil||null,
      });
      setMapDraftId(id);
      let imported=0;
      for(const batch of batchesOfZoneFeatures(features,50)){
        imported+=await rpc<number>("urban_zoning_append_features_v1",{
          _map_id:id,_features:batch,
        });
        setInfo(imported+" de "+features.length+" polígonos registrados no rascunho. Ainda não ativado.");
      }
      setInfo("Importação concluída: "+imported+" geometrias de "+features.length+
        " feições, SHA-256 "+sha.slice(0,12)+"… . Revise a lei, o mapa e a topologia antes da conferência.");
      await reload();
    }catch(e){setError(String((e as Error)?.message||e)+" O rascunho existente foi preservado.");}
    finally{setBusy("");}
  }
  async function verifyMap(){
    if(!canEdit||!mapDraftId||!mapConfirm||reviewNote.trim().length<40)return;
    setBusy("verify-map");setError("");
    try{
      await rpc<boolean>("urban_zoning_verify_map_v1",{
        _map_id:mapDraftId,_verification_note:reviewNote.trim(),
      });
      setInfo("Mapa registrado como conferido pela Prefeitura. A regra urbanística por índice permanece independente.");
      setMapDraftId("");setMapConfirm(false);setReviewNote("");
      await reload();
    }catch(e){setError(String((e as Error)?.message||e));}
    finally{setBusy("");}
  }
  async function searchProperty(){
    if(propertyQuery.trim().length<3||busy)return;
    setBusy("lookup");setError("");
    try{
      const result=await rpc<unknown>("urban_zoning_lookup_properties_v1",{
        _municipality_id:municipalityId,_search:propertyQuery.trim(),
      });
      const found=Array.isArray(result)?result as PropertyRecord[]:[];
      setProperties(found);
      setChosenProperty("");
      if(!found.length)setInfo("Nenhum imóvel localizado. Confirme o cadastro municipal antes de associar o perímetro.");
    }catch(e){setError(String((e as Error)?.message||e));}
    finally{setBusy("");}
  }
  async function importParcel(){
    if(!chosenProperty||!parcelFile||!parcelSource.trim()||busy)return;
    setBusy("parcel");setError("");
    try{
      const {source,sha}=await readGeoFile(parcelFile);
      const geometry=parseParcelGeoJson(source);
      const id=await rpc<string>("urban_zoning_stage_parcel_v1",{
        _property_id:chosenProperty,_geojson:geometry,
        _cadastral_source:parcelSource.trim(),_sha256:sha,
      });
      setParcelDraft(id);
      setInfo("Perímetro cadastral registrado como rascunho ("+id.slice(0,8)+"). Nenhuma zona foi atribuída.");
    }catch(e){setError(String((e as Error)?.message||e));}
    finally{setBusy("");}
  }
  async function verifyParcel(){
    if(!parcelDraft||!chosenProperty||!parcelConfirm||parcelReviewNote.trim().length<40||busy)return;
    setBusy("verify-parcel");setError("");
    try{
      await rpc<boolean>("urban_zoning_verify_parcel_v1",{
        _property_id:chosenProperty,_verification_note:parcelReviewNote.trim(),
      });
      setInfo("Perímetro do imóvel conferido. O motor só identificará zona quando houver um mapa validado, sem ambiguidade.");
      setParcelDraft("");setParcelConfirm(false);setParcelReviewNote("");
    }catch(e){setError(String((e as Error)?.message||e));}
    finally{setBusy("");}
  }

  return <details data-sigapro-gis-zoning-manager="true"
    className="mt-5 min-w-0 rounded-2xl border border-sky-200 bg-white p-4 dark:border-sky-700 dark:bg-[#0b172a]">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
      <MapPinned className="h-5 w-5 text-sky-700 dark:text-sky-300"/>
      Georreferenciamento e zoneamento oficial (PostGIS)
    </summary>
    <p className="mt-3 text-xs leading-5 text-slate-700 dark:text-slate-200">
      SIGAPRO cruza perímetros de imóveis com polígonos de um mapa municipal vigente.
      Somente fontes vetoriais oficiais EPSG:4326, com SHA-256 e conferência da Prefeitura,
      podem alimentar a classificação. O PDF isolado do mapa ou o CEP não é georreferenciamento.
      Minutas da revisão da lei não devem ser ativadas como mapa vigente.
    </p>
    {!canEdit?<p className="mt-3 text-xs font-bold text-amber-700">
      Cadastro cartográfico restrito ao administrador da legislação municipal. A consulta técnica permanece disponível ao analista.
    </p>:<>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#17283d]">
        <strong className="text-xs text-slate-950 dark:text-white">Versões deste município</strong>
        {!ready?<p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Consultando catálogo geográfico...</p>:
          !maps.length?<p data-sigapro-gis-no-map="true" className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Nenhum mapa georreferenciado oficial importado. A zona continuará não verificada até haver base e perímetro.
          </p>:maps.map(map=><p key={map.id} className="mt-2 break-words text-xs text-slate-700 dark:text-slate-200">
            <strong>{map.version_label}</strong> · {map.status==="verified"?"Conferido":"Rascunho"} ·
            {map.feature_count} feições · vigência {map.effective_from} · {map.legal_reference}
            {map.status==="draft_unverified"?<button type="button"
              className="ml-2 rounded-md border border-sky-600 px-2 py-1 text-xs font-bold text-sky-900 dark:text-sky-200"
              onClick={()=>{
                setMapDraftId(map.id);setVersion(map.version_label);
                setLegal(map.legal_reference);setSourceUrl(map.official_source_url);
                setValidFrom(map.effective_from);setValidUntil(map.effective_until||"");
                setMapConfirm(false);setReviewNote("");
                setInfo("Rascunho retomado. Use o mesmo arquivo digital original, com SHA-256 "+map.official_source_sha256.slice(0,12)+"… .");
              }}>Retomar rascunho</button>:null}
          </p>)}
      </div>
      <section className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">1. Importar mapa vetorial oficial</h4>
        <label className={label}>Identificação da versão
          <input className={field} value={version} maxLength={100} onChange={e=>setVersion(e.target.value)}
            placeholder="Anexo I — mapa consolidado vigente"/>
        </label>
        <label className={label}>Lei/anexo e alterações vigentes
          <input className={field} value={legal} maxLength={400} onChange={e=>setLegal(e.target.value)}
            placeholder="LC 379/2009, Anexo I, alterações e revisão da vigência"/>
        </label>
        <label className={label}>URL oficial da base geoespacial digital
          <input type="url" className={field} value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}
            placeholder="https://portal-oficial/.../zoneamento.geojson"/>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={label}>Início da vigência comprovado
            <input type="date" className={field} value={validFrom} onChange={e=>setValidFrom(e.target.value)}/>
          </label>
          <label className={label}>Fim da vigência (opcional)
            <input type="date" className={field} value={validUntil} onChange={e=>setValidUntil(e.target.value)}/>
          </label>
        </div>
        <label className={label}>GeoJSON original da Prefeitura (com propriedades zone_code)
          <input type="file" accept=".geojson,.json,application/geo+json" className={field}
            onChange={e=>setMapFile(e.target.files?.[0]||null)} />
          <span className="mt-1 block text-[11px] font-normal">Fonte digital oficial em EPSG:4326, até 3 MB. Não envie uma imagem ou PDF como se fosse GeoJSON.</span>
        </label>
        <button type="button" className="min-h-11 rounded-xl bg-slate-950 px-3 py-2 text-xs font-extrabold !text-white disabled:opacity-50"
          disabled={Boolean(busy)||!mapFile} onClick={()=>void importMap()}>
          {busy==="map"?"Registrando geometrias…":"Importar como rascunho, sem ativação"}
        </button>
        {mapDraftId?<div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <strong>Rascunho cartográfico registrado — {mapDraftId}</strong>
          <label className="block font-bold">Termo de conferência da fonte, perímetro e lei (mínimo 40 caracteres)
            <textarea className={field} rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
              placeholder="Conferi a camada GeoJSON original, seu hash, a publicação, o mapa e a vigência..."/>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={mapConfirm} onChange={e=>setMapConfirm(e.target.checked)}/>
            Confirmo pessoalmente a correspondência cartográfica e a vigência. Não autorizo aprovação de projetos.
          </label>
          <button type="button" className="min-h-10 rounded-lg bg-sky-900 px-3 py-2 font-bold !text-white disabled:opacity-50"
            disabled={Boolean(busy)||!mapConfirm||reviewNote.trim().length<40}
            onClick={()=>void verifyMap()}>Registrar conferência humana do mapa</button>
        </div>:null}
      </section>
      <section className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">2. Vincular perímetro ao cadastro municipal de imóvel</h4>
        <label className={label}>Pesquisar inscrição/IPTU ou endereço municipal
          <div className="mt-1 flex flex-wrap gap-2">
            <input className={field+" flex-1"} value={propertyQuery} maxLength={90}
              onChange={e=>setPropertyQuery(e.target.value)} placeholder="Mínimo 3 caracteres"/>
            <button type="button" className="min-h-11 rounded-xl bg-sky-900 px-4 text-xs font-bold !text-white"
              disabled={Boolean(busy)||propertyQuery.trim().length<3}
              onClick={()=>void searchProperty()}>Buscar</button>
          </div>
        </label>
        {properties.length>0?<label className={label}>Selecionar imóvel cadastrado
          <select className={field} value={chosenProperty} onChange={e=>{setChosenProperty(e.target.value);setParcelDraft("");}}>
            <option value="">Selecione o imóvel exato (não atribuir por semelhança)</option>
            {properties.map(x=><option key={x.id} value={x.id}>{x.address} · IPTU {x.iptu_code}</option>)}
          </select>
        </label>:null}
        <label className={label}>Origem do levantamento cadastral do lote
          <input className={field} value={parcelSource} maxLength={400} onChange={e=>setParcelSource(e.target.value)}
            placeholder="Cadastro municipal, levantamento homologado ou matrícula georreferenciada"/>
        </label>
        <label className={label}>Polígono oficial do lote (um único GeoJSON)
          <input type="file" accept=".geojson,.json,application/geo+json" className={field}
            onChange={e=>setParcelFile(e.target.files?.[0]||null)}/>
        </label>
        <button type="button" className="min-h-11 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold !text-white disabled:opacity-50"
          disabled={Boolean(busy)||!chosenProperty||!parcelFile||parcelSource.trim().length<12}
          onClick={()=>void importParcel()}>Registrar perímetro do lote como rascunho</button>
        {parcelDraft?<div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <strong>Perímetro cadastral aguardando revisão</strong>
          <label className="block font-bold">Evidência de conferência do perímetro (mínimo 40 caracteres)
            <textarea className={field} rows={3} value={parcelReviewNote}
              onChange={e=>setParcelReviewNote(e.target.value)}/>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={parcelConfirm} onChange={e=>setParcelConfirm(e.target.checked)}/>
            Conferi o perímetro com a inscrição do imóvel e documentos cadastrais.
          </label>
          <button type="button" className="min-h-10 rounded-lg bg-sky-900 px-3 py-2 font-bold !text-white disabled:opacity-50"
            disabled={Boolean(busy)||!parcelConfirm||parcelReviewNote.trim().length<40}
            onClick={()=>void verifyParcel()}>Registrar conferência humana do lote</button>
        </div>:null}
      </section>
    </>}
    {busy?<p className="mt-3 flex items-center gap-2 text-xs text-sky-800 dark:text-sky-200">
      <Loader2 className="h-4 w-4 animate-spin"/>Processando etapa {busy}</p>:null}
    {error?<p role="alert" className="mt-3 flex gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 [overflow-wrap:anywhere]">
      <AlertTriangle className="h-4 w-4 shrink-0"/>{error}</p>:null}
    {info?<p role="status" className="mt-3 flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 [overflow-wrap:anywhere]">
      <ShieldCheck className="h-4 w-4 shrink-0"/>{info}</p>:null}
    <p className="mt-3 flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
      <FileJson2 className="h-4 w-4 shrink-0"/>A checagem espacial nunca altera o processo nem habilita automaticamente normas urbanísticas.
      Lotes sem perímetro, em divisas ou sem mapa revisado permanecem pendentes.</p>
  </details>;
}
