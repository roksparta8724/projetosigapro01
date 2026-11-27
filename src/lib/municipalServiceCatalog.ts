/**
 * Categorias de serviços existentes. Os tipos gravados no banco e os checklists
 * permanecem idênticos; novos fluxos administrativos não são liberados aqui.
 */
import { isOccupancyPermitProcessType, processTypeCatalog } from "./platform";

export type MunicipalServiceCategoryId =
  | "projetos_alvaras" | "parcelamento_urbanizacao" | "certidoes_consultas"
  | "fiscalizacao" | "servicos_administrativos";

export const municipalServiceCategories: ReadonlyArray<{
  id: MunicipalServiceCategoryId; label: string; description: string; available: boolean
}> = [
  {
    "id": "projetos_alvaras",
    "label": "Projetos e Alvarás",
    "description": "Obras, reformas, regularização e licenças",
    "available": true
  },
  {
    "id": "parcelamento_urbanizacao",
    "label": "Parcelamento e Urbanização",
    "description": "Lotes, glebas e intervenções no solo",
    "available": true
  },
  {
    "id": "certidoes_consultas",
    "label": "Certidões e Consultas",
    "description": "Numeração, uso do solo e consulta prévia",
    "available": true
  },
  {
    "id": "fiscalizacao",
    "label": "Fiscalização",
    "description": "Recursos, multas e notificações — em preparação",
    "available": false
  },
  {
    "id": "servicos_administrativos",
    "label": "Serviços Administrativos",
    "description": "Segunda via, prorrogação e desarquivamento — em preparação",
    "available": false
  }
];

type ActiveCategory = Exclude<MunicipalServiceCategoryId, "fiscalizacao" | "servicos_administrativos">;
type MunicipalService = { id: string; type: string; categoryId: ActiveCategory };
const existingServices: ReadonlyArray<MunicipalService> = [
  {
    "id": "projeto_residencial",
    "type": "Aprovação de Projeto Residencial",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_comercial",
    "type": "Aprovação de Projeto Comercial",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_industrial",
    "type": "Aprovação de Projeto Industrial",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_institucional",
    "type": "Aprovação de Projeto Institucional",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_multifamiliar",
    "type": "Projeto Multifamiliar",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_reforma",
    "type": "Projeto de Reforma",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_ampliacao",
    "type": "Projeto de Ampliacao",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_regularizacao",
    "type": "Projeto de Regularizacao",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_demolicao",
    "type": "Projeto de Demolicao",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "alvara_construcao",
    "type": "Alvara de Construcao",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "alvara_reforma",
    "type": "Alvara de Reforma",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "alvara_demolicao",
    "type": "Alvara de Demolicao",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "licenciamento_fachada",
    "type": "Licenciamento de Fachada",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "licenciamento_muro",
    "type": "Licenciamento de Muro e Fechamento",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "licenciamento_tapume",
    "type": "Licenciamento de Tapume",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_acessibilidade",
    "type": "Aprovação de Projeto de Acessibilidade",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_incendio",
    "type": "Aprovação de Projeto de Combate a Incêndio",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "projeto_condominio",
    "type": "Aprovação de Projeto de Condomínio",
    "categoryId": "projetos_alvaras"
  },
  {
    "id": "terraplenagem",
    "type": "Projeto de Terraplenagem",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "drenagem",
    "type": "Projeto de Drenagem",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "contencao",
    "type": "Projeto de Contencao",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "loteamento",
    "type": "Loteamento",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "desmembramento",
    "type": "Desmembramento",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "remembramento",
    "type": "Remembramento",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "desdobro",
    "type": "Desdobro de Lote",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "projeto_infraestrutura",
    "type": "Aprovação de Projeto de Infraestrutura",
    "categoryId": "parcelamento_urbanizacao"
  },
  {
    "id": "certidao_numeracao",
    "type": "Certidao de Numeracao Predial",
    "categoryId": "certidoes_consultas"
  },
  {
    "id": "certidao_uso_solo",
    "type": "Certidao de Uso do Solo",
    "categoryId": "certidoes_consultas"
  },
  {
    "id": "consulta_previa",
    "type": "Consulta Previa",
    "categoryId": "certidoes_consultas"
  }
];

export function getMunicipalService(type: string | null | undefined) {
  return existingServices.find((service) => service.type === type) ?? null;
}

export function getMunicipalServicesForCategory(categoryId: MunicipalServiceCategoryId | "") {
  if (!categoryId) return [];
  return existingServices.filter((service) =>
    service.categoryId === categoryId && processTypeCatalog.includes(service.type) &&
    !isOccupancyPermitProcessType(service.type));
}

export function activeMunicipalServices() {
  return existingServices.filter((service) =>
    processTypeCatalog.includes(service.type) && !isOccupancyPermitProcessType(service.type));
}
