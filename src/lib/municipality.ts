import {
  defaultApprovalRateProfiles,
  defaultIssRateProfiles,
  type Tenant,
  type TenantSettings,
} from "@/lib/platform";

export interface Municipality {
  id: string;
  name: string;
  state: string;
  slug: string;
  subdomain: string;
  customDomain: string;
  status: string;
  secretariatName: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export interface MunicipalityBranding {
  id: string;
  municipalityId: string;
  // URL única (logo principal — compatibilidade legada)
  logoUrl: string;
  // URLs separadas por variante — preenchidas quando salvas via fluxo de branding
  headerLogoUrl: string;
  footerLogoUrl: string;
  // Object keys no R2 por variante
  headerLogoObjectKey: string;
  footerLogoObjectKey: string;
  // Nome do arquivo por variante
  headerLogoFileName: string;
  footerLogoFileName: string;
  // Mime types por variante
  headerLogoMimeType: string;
  footerLogoMimeType: string;
  // Metadados de storage
  logoStorageProvider: string;
  logoBucket: string;
  logoObjectKey: string;
  logoFileName: string;
  logoMimeType: string;
  logoFileSize: number | null;
  coatOfArmsUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  officialHeaderText: string;
  officialFooterText: string;
  createdAt: string;
  updatedAt: string;
}

export interface MunicipalitySettings {
  id: string;
  municipalityId: string;
  protocolPrefix: string;
  guidePrefix: string;
  timezone: string;
  locale: string;
  requireProfessionalRegistration: boolean;
  allowDigitalProtocol: boolean;
  allowWalkinProtocol: boolean;
  generalSettings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MunicipalityTheme {
  primary: string;
  accent: string;
}

export interface MunicipalityBundle {
  municipality: Municipality | null;
  branding: MunicipalityBranding | null;
  settings: MunicipalitySettings | null;
}

function mapMunicipalityStatusToTenantStatus(
  status: string | null | undefined,
): Tenant["status"] {
  switch (status) {
    case "inactive":
      return "suspenso";
    case "implementation":
      return "implantacao";
    default:
      return "ativo";
  }
}

function buildFallbackTenantSettings(tenantId: string): TenantSettings {
  return {
    tenantId,
    cnpj: "",
    endereco: "",
    telefone: "",
    email: "",
    site: "",
    secretariaResponsavel: "",
    diretoriaResponsavel: "",
    diretoriaTelefone: "",
    diretoriaEmail: "",
    horarioAtendimento: "",
    brasaoUrl: "",
    bandeiraUrl: "",
    logoUrl: "",
    imagemHeroUrl: "",
    resumoPlanoDiretor: "",
    resumoUsoSolo: "",
    leisComplementares: "",
    linkPortalCliente: "",
    protocoloPrefixo: "PM",
    guiaPrefixo: "DAM",
    chavePix: "",
    beneficiarioArrecadacao: "",
    taxaProtocolo: 35.24,
    taxaIssPorMetroQuadrado: 0,
    issRateProfiles: defaultIssRateProfiles,
    taxaAprovacaoFinal: 0,
    approvalRateProfiles: defaultApprovalRateProfiles,
    registroProfissionalObrigatorio: true,
    contractNumber: "",
    contractStart: "",
    contractEnd: "",
    monthlyFee: 0,
    setupFee: 0,
    signatureMode: "eletronica",
    clientDeliveryLink: "",
    logoScale: 1,
    logoOffsetX: 0,
    logoOffsetY: 0,
    headerLogoScale: 1,
    headerLogoOffsetX: 0,
    headerLogoOffsetY: 0,
    footerLogoScale: 1,
    footerLogoOffsetX: 0,
    footerLogoOffsetY: 0,
    logoAlt: "Logo institucional",
    logoUpdatedAt: "",
    logoUpdatedBy: "",
    logoFrameMode: "soft-square",
    logoFitMode: "contain",
    headerLogoFrameMode: "soft-square",
    headerLogoFitMode: "contain",
    footerLogoFrameMode: "soft-square",
    footerLogoFitMode: "contain",
    planoDiretorArquivoNome: "",
    planoDiretorArquivoUrl: "",
    usoSoloArquivoNome: "",
    usoSoloArquivoUrl: "",
    leisArquivoNome: "",
    leisArquivoUrl: "",
  };
}

export function getMunicipalityTheme(
  branding: MunicipalityBranding | null | undefined,
  tenant: Tenant | null | undefined,
): MunicipalityTheme {
  return {
    primary: branding?.primaryColor || tenant?.theme.primary || "#0F2A44",
    accent: branding?.accentColor || tenant?.theme.accent || "#5ee8d9",
  };
}

export function buildTenantSettingsFromMunicipality(
  municipality: Municipality | null | undefined,
  branding: MunicipalityBranding | null | undefined,
  settings: MunicipalitySettings | null | undefined,
  fallbackTenantSettings: TenantSettings | null | undefined,
): TenantSettings | null {
  const base =
    fallbackTenantSettings ??
    (municipality?.id ? buildFallbackTenantSettings(municipality.id) : null);

  if (!base) return null;

  const general = settings?.generalSettings ?? {};

  // Resolve logo por variante: prefere URL específica, cai para logo_url geral
  const headerLogoUrl =
    branding?.headerLogoUrl || branding?.logoUrl || base.logoUrl || "";
  const footerLogoUrl =
    branding?.footerLogoUrl || branding?.logoUrl || base.logoUrl || "";

  return {
    ...base,
    tenantId: municipality?.id || base.tenantId,
    cnpj: (typeof general.cnpj === "string" && general.cnpj) || base.cnpj,
    endereco: municipality?.address || base.endereco,
    telefone: municipality?.phone || base.telefone,
    email: municipality?.email || base.email,
    site:
      municipality?.customDomain ||
      (typeof general.site === "string" && general.site) ||
      base.site,
    secretariaResponsavel:
      municipality?.secretariatName || base.secretariaResponsavel,
    diretoriaResponsavel:
      (typeof general.directorship === "string" && general.directorship) ||
      base.diretoriaResponsavel,
    diretoriaTelefone:
      (typeof general.directorship_phone === "string" &&
        general.directorship_phone) ||
      base.diretoriaTelefone,
    diretoriaEmail:
      (typeof general.directorship_email === "string" &&
        general.directorship_email) ||
      base.diretoriaEmail,
    horarioAtendimento:
      (typeof general.office_hours === "string" && general.office_hours) ||
      base.horarioAtendimento,
    brasaoUrl: branding?.coatOfArmsUrl || base.brasaoUrl,
    // logoUrl aponta para header por compatibilidade legada
    logoUrl: headerLogoUrl,
    // campos específicos por variante
    headerLogoUrl,
    footerLogoUrl,
    headerLogoObjectKey: branding?.headerLogoObjectKey || branding?.logoObjectKey || "",
    footerLogoObjectKey: branding?.footerLogoObjectKey || branding?.logoObjectKey || "",
    logoStorageProvider: branding?.logoStorageProvider || "",
    logoBucket: branding?.logoBucket || "",
    logoObjectKey: branding?.logoObjectKey || "",
    logoFileName: branding?.logoFileName || "",
    logoMimeType: branding?.logoMimeType || "",
    logoFileSize: branding?.logoFileSize ?? undefined,
    resumoPlanoDiretor:
      (typeof general.resumo_plano_diretor === "string" &&
        general.resumo_plano_diretor) ||
      base.resumoPlanoDiretor,
    resumoUsoSolo:
      (typeof general.resumo_uso_solo === "string" && general.resumo_uso_solo) ||
      base.resumoUsoSolo,
    leisComplementares:
      (typeof general.leis_complementares === "string" &&
        general.leis_complementares) ||
      base.leisComplementares,
    linkPortalCliente:
      (typeof general.link_portal_cliente === "string" &&
        general.link_portal_cliente) ||
      base.linkPortalCliente,
    protocoloPrefixo: settings?.protocolPrefix || base.protocoloPrefixo,
    guiaPrefixo: settings?.guidePrefix || base.guiaPrefixo,
    chavePix:
      (typeof general.chave_pix === "string" && general.chave_pix) ||
      (typeof general.pix_key === "string" && general.pix_key) ||
      base.chavePix,
    beneficiarioArrecadacao:
      (typeof general.beneficiario_arrecadacao === "string" &&
        general.beneficiario_arrecadacao) ||
      (typeof general.settlement_beneficiary === "string" &&
        general.settlement_beneficiary) ||
      base.beneficiarioArrecadacao,
    taxaProtocolo:
      typeof general.taxa_protocolo === "number"
        ? general.taxa_protocolo
        : typeof general.fee_protocol === "number"
          ? general.fee_protocol
          : base.taxaProtocolo,
    taxaIssPorMetroQuadrado:
      typeof general.taxa_iss_por_metro_quadrado === "number"
        ? general.taxa_iss_por_metro_quadrado
        : typeof general.fee_iss_m2 === "number"
          ? general.fee_iss_m2
          : base.taxaIssPorMetroQuadrado,
    issRateProfiles:
      Array.isArray(general.iss_rate_profiles) &&
      general.iss_rate_profiles.length > 0
        ? (general.iss_rate_profiles as TenantSettings["issRateProfiles"])
        : base.issRateProfiles,
    taxaAprovacaoFinal:
      typeof general.taxa_aprovacao_final === "number"
        ? general.taxa_aprovacao_final
        : typeof general.fee_final_approval === "number"
          ? general.fee_final_approval
          : base.taxaAprovacaoFinal,
    approvalRateProfiles:
      Array.isArray(general.approval_rate_profiles) &&
      general.approval_rate_profiles.length > 0
        ? (general.approval_rate_profiles as TenantSettings["approvalRateProfiles"])
        : base.approvalRateProfiles,
    registroProfissionalObrigatorio:
      settings?.requireProfessionalRegistration ??
      base.registroProfissionalObrigatorio,
    // escalas por variante vindas do general_settings
    logoScale:
      typeof general.logo_scale === "number" ? general.logo_scale : base.logoScale,
    logoOffsetX:
      typeof general.logo_offset_x === "number"
        ? general.logo_offset_x
        : base.logoOffsetX,
    logoOffsetY:
      typeof general.logo_offset_y === "number"
        ? general.logo_offset_y
        : base.logoOffsetY,
    headerLogoScale:
      typeof general.header_logo_scale === "number"
        ? general.header_logo_scale
        : base.headerLogoScale,
    headerLogoOffsetX:
      typeof general.header_logo_offset_x === "number"
        ? general.header_logo_offset_x
        : base.headerLogoOffsetX,
    headerLogoOffsetY:
      typeof general.header_logo_offset_y === "number"
        ? general.header_logo_offset_y
        : base.headerLogoOffsetY,
    footerLogoScale:
      typeof general.footer_logo_scale === "number"
        ? general.footer_logo_scale
        : base.footerLogoScale,
    footerLogoOffsetX:
      typeof general.footer_logo_offset_x === "number"
        ? general.footer_logo_offset_x
        : base.footerLogoOffsetX,
    footerLogoOffsetY:
      typeof general.footer_logo_offset_y === "number"
        ? general.footer_logo_offset_y
        : base.footerLogoOffsetY,
  };
}

export const buildInstitutionSettingsFromMunicipality =
  buildTenantSettingsFromMunicipality;

export function buildTenantFromMunicipalityBundle(
  municipality: Municipality | null | undefined,
  branding: MunicipalityBranding | null | undefined,
  settings: MunicipalitySettings | null | undefined,
  fallbackTenant: Tenant | null | undefined,
): Tenant | null {
  if (!municipality && !fallbackTenant) return null;

  const general = settings?.generalSettings ?? {};
  const primary =
    branding?.primaryColor || fallbackTenant?.theme.primary || "#0F2A44";
  const accent =
    branding?.accentColor || fallbackTenant?.theme.accent || "#5ee8d9";

  return {
    id: municipality?.id || fallbackTenant?.id || "",
    name: municipality?.name || fallbackTenant?.name || "Prefeitura",
    city: fallbackTenant?.city || municipality?.name || "",
    state: municipality?.state || fallbackTenant?.state || "",
    status: municipality
      ? mapMunicipalityStatusToTenantStatus(municipality.status)
      : fallbackTenant?.status || "ativo",
    plan:
      (typeof general.plan === "string" && general.plan) ||
      fallbackTenant?.plan ||
      "Plano institucional",
    userCount: fallbackTenant?.userCount || 0,
    activeProcessCount: fallbackTenant?.activeProcessCount || 0,
    monthlyRevenue:
      (typeof general.monthly_fee === "number" && general.monthly_fee) ||
      fallbackTenant?.monthlyRevenue ||
      0,
    subdomain:
      municipality?.subdomain || fallbackTenant?.subdomain || "",
    theme: {
      primary,
      accent,
    },
  };
}

export const buildInstitutionFromMunicipalityBundle =
  buildTenantFromMunicipalityBundle;
