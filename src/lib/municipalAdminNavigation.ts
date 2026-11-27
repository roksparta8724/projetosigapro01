import {isMunicipalOverviewSubpagePath} from "@/lib/municipalOverviewSubpages";
export const MUNICIPAL_ADMIN_SECTIONS = [
 {value:"fila",label:"Fila operacional",helper:"Protocolos e prioridades",to:"/prefeitura?secao=fila"},
 {value:"usuarios",label:"Usuários",helper:"Equipe e acessos",to:"/prefeitura?secao=usuarios"},
 {value:"organograma",label:"Organograma",helper:"Estrutura e lotação",to:"/prefeitura?secao=organograma"},
 {value:"historico",label:"Histórico",helper:"Atividades recentes",to:"/prefeitura?secao=historico"},
 {value:"visao-geral",label:"Visão geral",helper:"Resumo executivo",to:"/prefeitura/visao-geral/processos"},
] as const;
const normalize=(path:string)=>path.replace(/\/+$/,"")||"/";
export function municipalAdminSection(pathname:string,search=""){
 const path=normalize(pathname);
 if(path==="/prefeitura/usuarios/novo")return "usuarios";
 if(path==="/prefeitura/organograma")return "organograma";
 if(isMunicipalOverviewSubpagePath(path))return "visao-geral";
 if(path!=="/prefeitura")return null;
 const section=new URLSearchParams(search).get("secao");
 return MUNICIPAL_ADMIN_SECTIONS.find(s=>s.value===section)?.value??"fila";
}
export function sidebarRouteActive(pathname:string,search:string,to:string){
 const current=normalize(pathname);
 const [rawTarget,query=""]=to.split("?",2),target=normalize(rawTarget);
 const requested=new URLSearchParams(query).get("secao");
 if(target==="/prefeitura"&&requested)return municipalAdminSection(current,search)===requested;
 if(isMunicipalOverviewSubpagePath(target))return municipalAdminSection(current,search)==="visao-geral";
 if(target==="/prefeitura")return municipalAdminSection(current,search)!==null;
 if(target==="/dashboard")return current===target||current.startsWith(target+"/");
 return current===target&&(!query||[...new URLSearchParams(query)].every(([k,v])=>new URLSearchParams(search).get(k)===v));
}
export function sidebarParentActive(pathname:string,search:string,item:{to:string;children?:ReadonlyArray<{to:string}>}){
 if(item.children?.some(child=>sidebarRouteActive(pathname,search,child.to)))return true;
 if(item.to==="/prefeitura")return municipalAdminSection(pathname,search)!==null;
 const current=normalize(pathname),target=normalize(item.to.split("?")[0]);
 return sidebarRouteActive(pathname,search,item.to)||current.startsWith(target+"/");
}
