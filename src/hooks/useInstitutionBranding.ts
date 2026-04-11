import { useEffect, useMemo, useState } from "react";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  can,
  defaultApprovalRateProfiles,
  defaultIssRateProfiles,
  type TenantSettings,
} from "@/lib/platform";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import { loadPlatformBranding } from "@/integrations/supabase/platform";
import { getInstitutionBranding } from "@/lib/institutionBranding";
import { getMasterInstitutionBranding, loadMasterBranding } from "@/lib/masterBranding";

const MASTER_SIGNED_CACHE_TTL_MS = 1000 * 60 * 15;
let cachedMasterHeaderSignedUrl = "";
let cachedMasterHeaderSignedAt = 0;
let cachedMasterFooterSignedUrl = "";
let cachedMasterFooterSignedAt = 0;

const isCacheValid = (ts: number) => Date.now() - ts < MASTER_SIGNED_CACHE_TTL_MS;

const getCachedMasterHeaderUrl = () =>
  cachedMasterHeaderSignedUrl && isCacheValid(cachedMasterHeaderSignedAt)
    ? cachedMasterHeaderSignedUrl
    : "";

const getCachedMasterFooterUrl = () =>
  cachedMasterFooterSignedUrl && isCacheValid(cachedMasterFooterSignedAt)
    ? cachedMasterFooterSignedUrl
    : "";

function buildEmptyTenantSettings(tenantId: string): TenantSettings {
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

export function useInstitutionBranding(tenantId?: string | null) {
  const { session } = usePlatformSession();
  const { municipality, branding: municipalityBranding, scopeId, tenantSettingsCompat } = useMunicipality();
  const { institutions, getInstitutionSettings } = usePlatformData();
  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const [masterBrandingState, setMasterBrandingState] = useState(() => loadMasterBranding());
  const [resolvedMasterHeaderLogoUrl, setResolvedMasterHeaderLogoUrl] = useState<string>(
    () => getCachedMasterHeaderUrl(),
  );
  const [resolvedMasterFooterLogoUrl, setResolvedMasterFooterLogoUrl] = useState<string>(
    () => getCachedMasterFooterUrl(),
  );
  const [platformBranding, setPlatformBranding] = useState<Awaited<ReturnType<typeof loadPlatformBranding>> | null>(null);

  const resolvedInstitutionId = isMaster
    ? ""
    : tenantId ?? municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? "";
  const shouldUseMasterBranding = isMaster;

  const institution = municipality
    ? {
        id: municipality.id,
        name: municipality.name,
      }
    : institutions.find((item) => item.id === resolvedInstitutionId) ?? null;

  const institutionSettings =
    tenantSettingsCompat ??
    getInstitutionSettings(resolvedInstitutionId) ??
    (resolvedInstitutionId ? buildEmptyTenantSettings(resolvedInstitutionId) : null);

  const officialHeaderText =
    municipalityBranding?.officialHeaderText ??
    municipality?.secretariatName ??
    institutionSettings?.secretariaResponsavel ??
    institution?.name ??
    "Instituição";

  const officialFooterText =
    municipalityBranding?.officialFooterText ??
    institutionSettings?.resumoPlanoDiretor ??
    "SIGAPRO — Sistema integrado de gestão e aprovação de projetos";

  const resolvedHeaderText = shouldUseMasterBranding
    ? "Sistema integrado de gestão e aprovação de projetos"
    : officialHeaderText;
  const resolvedFooterText = shouldUseMasterBranding
    ? masterBrandingState.footerText || "SIGAPRO — Sistema integrado de gestão e aprovação de projetos"
    : officialFooterText;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setMasterBrandingState(loadMasterBranding());
      if (shouldUseMasterBranding) {
        loadPlatformBranding().then(setPlatformBranding).catch(() => setPlatformBranding(null));
      }
    };
    window.addEventListener("sigapro-master-branding-updated", handler as EventListener);
    return () => window.removeEventListener("sigapro-master-branding-updated", handler as EventListener);
  }, [shouldUseMasterBranding]);

  useEffect(() => {
    if (!shouldUseMasterBranding) return;
    let active = true;
    const loadRemote = async () => {
      try {
        const remote = await loadPlatformBranding();
        if (active) setPlatformBranding(remote);
      } catch {
        if (active) setPlatformBranding(null);
      }
    };
    void loadRemote();
    return () => {
      active = false;
    };
  }, [shouldUseMasterBranding]);

  useEffect(() => {
    if (!shouldUseMasterBranding) return;
    const bucket =
      (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) || "sigapro-logos";
    const resolveLogo = async (raw: string, setter: (value: string) => void) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setter("");
        return;
      }
      if (trimmed.startsWith("http")) {
        // Para o Master, nunca usamos URL pública direta. Tentamos resolver o object_key.
        try {
          const url = new URL(trimmed);
          const objectKey = url.pathname.replace(/^\/+/, "");
          if (objectKey) {
            const signedUrl = await getSignedUrlForObjectStrict({ bucket, objectKey });
            setter(signedUrl || "");
            return;
          }
        } catch {
          // ignore
        }
        setter("");
        return;
      }

      try {
        const signedUrl = await getSignedUrlForObjectStrict({ bucket, objectKey: trimmed });
        setter(signedUrl || "");
      } catch {
        setter("");
      }
    };

    const headerRaw =
      platformBranding?.headerLogoObjectKey ||
      platformBranding?.headerLogoUrl ||
      masterBrandingState.headerLogoUrl ||
      masterBrandingState.logoUrl ||
      "";
    const footerRaw =
      platformBranding?.footerLogoObjectKey ||
      platformBranding?.footerLogoUrl ||
      masterBrandingState.footerLogoUrl ||
      masterBrandingState.logoUrl ||
      "";

    void resolveLogo(headerRaw, (value) => {
      if (value) {
        cachedMasterHeaderSignedUrl = value;
        cachedMasterHeaderSignedAt = Date.now();
      }
      setResolvedMasterHeaderLogoUrl(value || getCachedMasterHeaderUrl());
    });
    void resolveLogo(footerRaw, (value) => {
      if (value) {
        cachedMasterFooterSignedUrl = value;
        cachedMasterFooterSignedAt = Date.now();
      }
      setResolvedMasterFooterLogoUrl(value || getCachedMasterFooterUrl());
    });
  }, [masterBrandingState.logoUrl, platformBranding, shouldUseMasterBranding]);

  const headerBranding = useMemo(() => {
    if (shouldUseMasterBranding) {
      const masterBranding = getMasterInstitutionBranding(masterBrandingState, "header");
      return {
        ...masterBranding,
        logoUrl: resolvedMasterHeaderLogoUrl || masterBranding.logoUrl,
      };
    }
    const base = getInstitutionBranding(
      institutionSettings,
      institution?.name ? `Logo institucional de ${institution.name}` : "Logo institucional",
      "header",
    );
    const brandingUrl = municipalityBranding?.headerLogoUrl || municipalityBranding?.logoUrl || "";
    return {
      ...base,
      logoUrl: brandingUrl || base.logoUrl,
    };
  }, [
    institution?.name,
    institutionSettings,
    masterBrandingState,
    resolvedMasterHeaderLogoUrl,
    shouldUseMasterBranding,
    municipalityBranding?.headerLogoUrl,
    municipalityBranding?.logoUrl,
  ]);

  const footerBranding = useMemo(() => {
    if (shouldUseMasterBranding) {
      const masterBranding = getMasterInstitutionBranding(masterBrandingState, "footer");
      return {
        ...masterBranding,
        logoUrl: resolvedMasterFooterLogoUrl || masterBranding.logoUrl,
      };
    }
    const base = getInstitutionBranding(
      institutionSettings,
      institution?.name ? `Logo institucional de ${institution.name}` : "Logo institucional",
      "footer",
    );
    const brandingUrl = municipalityBranding?.footerLogoUrl || municipalityBranding?.logoUrl || "";
    return {
      ...base,
      logoUrl: brandingUrl || base.logoUrl,
    };
  }, [
    institution?.name,
    institutionSettings,
    masterBrandingState,
    resolvedMasterFooterLogoUrl,
    shouldUseMasterBranding,
    municipalityBranding?.footerLogoUrl,
    municipalityBranding?.logoUrl,
  ]);

  return {
    headerBranding,
    footerBranding,
    officialHeaderText: resolvedHeaderText,
    officialFooterText: resolvedFooterText,
    canManageTenantSettings: can(session, "manage_tenant_branding"),
  };
}
