/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  can,
  defaultApprovalRateProfiles,
  defaultIssRateProfiles,
  type TenantSettings,
} from "@/lib/platform";
import {
  getMunicipalityLogoOpenUrl,
  getSignedUrlForObjectStrict,
} from "@/integrations/r2/client";
import { loadPlatformBranding } from "@/integrations/backend/platform";
import { resolveAssetUrl } from "@/lib/assetUrl";
import { getInstitutionBranding } from "@/lib/institutionBranding";
import { getMasterInstitutionBranding, loadMasterBranding, saveMasterBranding, updateMasterBranding } from "@/lib/masterBranding";

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

function isUsableBrandingUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  // Referências persistentes privadas (r2:) são fonte de dados, não URL de <img>.
  // Elas precisam ser assinadas antes de chegar ao componente visual.
  if (raw.startsWith("r2:")) return false;
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "https://sigapromunicipal.com.br");
    const amzDate = url.searchParams.get("X-Amz-Date");
    const expires = Number(url.searchParams.get("X-Amz-Expires") || "0");
    if (!amzDate || !Number.isFinite(expires) || expires <= 0) return true;

    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
    if (!match) return true;
    const issuedAt = Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    );
    return Date.now() < issuedAt + expires * 1000 - 30_000;
  } catch {
    return true;
  }
}

function municipalityLogoFallback(name: string | null | undefined) {
  const normalized = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (normalized.includes("campo limpo paulista")) {
    return "https://upload.wikimedia.org/wikipedia/commons/4/4e/Brasao-campo-limpo-paulista2.png";
  }
  return "";
}

const TENANT_LOGO_CACHE_PREFIX = "sigapro.municipality-logo.v3";

function tenantLogoCacheKey(tenantId: string, variant: "header" | "footer") {
  return `${TENANT_LOGO_CACHE_PREFIX}:${tenantId}:${variant}`;
}

function readTenantLogoCache(tenantId: string, variant: "header" | "footer") {
  if (!tenantId || typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(tenantLogoCacheKey(tenantId, variant)) || "";
    return isUsableBrandingUrl(value) ? value : "";
  } catch {
    return "";
  }
}

function writeTenantLogoCache(
  tenantId: string,
  variant: "header" | "footer",
  value: string,
) {
  if (!tenantId || typeof window === "undefined") return;
  try {
    if (value && isUsableBrandingUrl(value)) {
      window.localStorage.setItem(tenantLogoCacheKey(tenantId, variant), value);
    } else {
      window.localStorage.removeItem(tenantLogoCacheKey(tenantId, variant));
    }
  } catch {
    // Cache visual nunca pode bloquear a interface.
  }
}

function resolvePersistentBrandingReference(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("r2:")) {
    const objectKey = raw.slice(3).trim().replace(/^\/+/, "");
    return getMunicipalityLogoOpenUrl(objectKey);
  }
  return isUsableBrandingUrl(raw) ? raw : "";
}

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
    zoneamentoArquivoNome: "",
    zoneamentoArquivoUrl: "",
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
  const stableTenantHeaderLogoRef = useRef<{ tenantId: string; url: string }>({ tenantId: "", url: "" });
  const stableTenantFooterLogoRef = useRef<{ tenantId: string; url: string }>({ tenantId: "", url: "" });
  const [resolvedTenantHeaderLogoState, setResolvedTenantHeaderLogo] = useState<{ tenantId: string; url: string }>({ tenantId: "", url: "" });
  const [resolvedTenantFooterLogoState, setResolvedTenantFooterLogo] = useState<{ tenantId: string; url: string }>({ tenantId: "", url: "" });

  const requestedInstitutionId =
    tenantId ?? municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? "";
  const shouldUseMasterBranding = isMaster && !tenantId;
  const resolvedInstitutionId = shouldUseMasterBranding ? "" : requestedInstitutionId;
  const scopedMunicipality = municipality?.id === resolvedInstitutionId ? municipality : null;
  const scopedMunicipalityBranding =
    municipalityBranding?.municipalityId === resolvedInstitutionId ? municipalityBranding : null;
  const scopedTenantSettings =
    tenantSettingsCompat?.tenantId === resolvedInstitutionId ? tenantSettingsCompat : null;

  const institution = scopedMunicipality
    ? {
        id: scopedMunicipality.id,
        name: scopedMunicipality.name,
      }
    : institutions.find((item) => item.id === resolvedInstitutionId) ?? null;

  const institutionSettings =
    scopedTenantSettings ??
    getInstitutionSettings(resolvedInstitutionId) ??
    (resolvedInstitutionId ? buildEmptyTenantSettings(resolvedInstitutionId) : null);

  const officialHeaderText =
    scopedMunicipalityBranding?.officialHeaderText ??
    scopedMunicipality?.secretariatName ??
    institutionSettings?.secretariaResponsavel ??
    institution?.name ??
    "Instituição";

  const officialFooterText =
    scopedMunicipalityBranding?.officialFooterText ??
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
    if (!shouldUseMasterBranding || !platformBranding) return;

    setMasterBrandingState((current) => {
      const next = updateMasterBranding(current, {
        logoAlt: platformBranding.logoAlt || current.logoAlt,
        logoUpdatedAt: platformBranding.updatedAt || current.logoUpdatedAt,
        logoUpdatedBy: platformBranding.updatedBy || current.logoUpdatedBy,
        footerText: platformBranding.footerText || current.footerText,
        headerLogoScale: platformBranding.headerLogoScale,
        headerLogoOffsetX: platformBranding.headerLogoOffsetX,
        headerLogoOffsetY: platformBranding.headerLogoOffsetY,
        headerLogoFrameMode: platformBranding.headerLogoFrameMode,
        headerLogoFitMode: platformBranding.headerLogoFitMode,
        footerLogoScale: platformBranding.footerLogoScale,
        footerLogoOffsetX: platformBranding.footerLogoOffsetX,
        footerLogoOffsetY: platformBranding.footerLogoOffsetY,
        footerLogoFrameMode: platformBranding.footerLogoFrameMode,
        footerLogoFitMode: platformBranding.footerLogoFitMode,
      });
      saveMasterBranding(next);
      return next;
    });
  }, [platformBranding, shouldUseMasterBranding]);

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
      if (!trimmed.startsWith("http")) {
        const resolvedLocalAsset = resolveAssetUrl(trimmed);
        if (resolvedLocalAsset) {
          setter(resolvedLocalAsset);
          return;
        }
      }
      if (trimmed.startsWith("http")) {
        // Para o Master, nunca usamos URL pública direta. Tentamos resolver o object_key.
        try {
          const url = new URL(trimmed);
          const objectKey = url.pathname.replace(/^\/+/, "");
          if (objectKey) {
            const signedUrl = await getSignedUrlForObjectStrict({ bucket, objectKey });
            if (signedUrl) {
              setter(signedUrl);
              return;
            }
          }
        } catch {
          // ignore
        }
        setter(resolveAssetUrl(trimmed) || trimmed);
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
      } else if (!headerRaw) {
        cachedMasterHeaderSignedUrl = "";
        cachedMasterHeaderSignedAt = 0;
      }
      setResolvedMasterHeaderLogoUrl(value || getCachedMasterHeaderUrl());
    });
    void resolveLogo(footerRaw, (value) => {
      if (value) {
        cachedMasterFooterSignedUrl = value;
        cachedMasterFooterSignedAt = Date.now();
      } else if (!footerRaw) {
        cachedMasterFooterSignedUrl = "";
        cachedMasterFooterSignedAt = 0;
      }
      setResolvedMasterFooterLogoUrl(value || getCachedMasterFooterUrl());
    });
  }, [masterBrandingState.logoUrl, platformBranding, shouldUseMasterBranding]);

  useEffect(() => {
    if (shouldUseMasterBranding || !resolvedInstitutionId) {
      setResolvedTenantHeaderLogo({ tenantId: "", url: "" });
      setResolvedTenantFooterLogo({ tenantId: "", url: "" });
      return;
    }

    let active = true;

    const resolvePersistedVariant = async (
      objectKey: string | null | undefined,
      storedUrl: string | null | undefined,
    ) => {
      const raw = String(storedUrl || "").trim();

      // URL persistente válida continua sendo aceita para retrocompatibilidade.
      if (isUsableBrandingUrl(raw)) return raw;

      const normalizedKey = String(objectKey || "").trim().replace(/^\/+/, "");
      if (!normalizedKey) return "";

      // Fonte primária: endpoint estável do SIGAPRO baseado no object key.
      // Não expira, não depende da URL assinada salva no banco e mantém
      // localhost e produção apontando para o MESMO arquivo institucional.
      const stableProxyUrl = getMunicipalityLogoOpenUrl(normalizedKey);
      if (stableProxyUrl) return stableProxyUrl;

      // Fallback técnico para ambientes sem a rota serverless.
      try {
        return await getSignedUrlForObjectStrict({
          bucket: "institutional-branding",
          objectKey: normalizedKey,
          expiresIn: 21600,
        });
      } catch {
        return "";
      }
    };

    void Promise.all([
      resolvePersistedVariant(
        scopedMunicipalityBranding?.headerLogoObjectKey ||
          scopedMunicipalityBranding?.logoObjectKey,
        scopedMunicipalityBranding?.headerLogoUrl ||
          scopedMunicipalityBranding?.logoUrl,
      ),
      resolvePersistedVariant(
        scopedMunicipalityBranding?.footerLogoObjectKey ||
          scopedMunicipalityBranding?.logoObjectKey ||
          scopedMunicipalityBranding?.headerLogoObjectKey,
        scopedMunicipalityBranding?.footerLogoUrl ||
          scopedMunicipalityBranding?.logoUrl ||
          scopedMunicipalityBranding?.headerLogoUrl,
      ),
    ]).then(([headerUrl, footerUrl]) => {
      if (!active) return;
      if (headerUrl) writeTenantLogoCache(resolvedInstitutionId, "header", headerUrl);
      if (footerUrl) writeTenantLogoCache(resolvedInstitutionId, "footer", footerUrl);
      setResolvedTenantHeaderLogo({ tenantId: resolvedInstitutionId, url: headerUrl });
      setResolvedTenantFooterLogo({ tenantId: resolvedInstitutionId, url: footerUrl });
    });

    return () => {
      active = false;
    };
  }, [
    resolvedInstitutionId,
    scopedMunicipalityBranding?.footerLogoObjectKey,
    scopedMunicipalityBranding?.footerLogoUrl,
    scopedMunicipalityBranding?.headerLogoObjectKey,
    scopedMunicipalityBranding?.headerLogoUrl,
    scopedMunicipalityBranding?.logoObjectKey,
    scopedMunicipalityBranding?.logoUrl,
    shouldUseMasterBranding,
  ]);

  const headerBranding = useMemo(() => {
    if (shouldUseMasterBranding) {
      const masterBranding = getMasterInstitutionBranding(masterBrandingState, "header");
      return {
        ...masterBranding,
        logoUrl: resolvedMasterHeaderLogoUrl || masterBranding.logoUrl,
        ...(platformBranding?.headerLogoFileName.endsWith("-enquadrado.png")
          ? { logoScale: 1, logoOffsetX: 0, logoOffsetY: 0 }
          : {}),
      };
    }
    const base = getInstitutionBranding(
      institutionSettings,
      institution?.name ? `Logo institucional de ${institution.name}` : "Logo institucional",
      "header",
    );
    const rawHeaderUrl =
      scopedMunicipalityBranding?.headerLogoUrl ||
      scopedMunicipalityBranding?.logoUrl ||
      "";
    const brandingUrl = isUsableBrandingUrl(rawHeaderUrl) ? rawHeaderUrl : "";
    const headerObjectKey = String(
      scopedMunicipalityBranding?.headerLogoObjectKey ||
      scopedMunicipalityBranding?.logoObjectKey ||
      "",
    )
      .trim()
      .replace(/^\/+/, "");
    const synchronousHeaderUrl = headerObjectKey
      ? getMunicipalityLogoOpenUrl(headerObjectKey)
      : "";
    const cachedHeaderUrl = readTenantLogoCache(resolvedInstitutionId, "header");
    const savedCoatOfArmsUrl =
      resolvePersistentBrandingReference(institutionSettings?.brasaoUrl);
    const institutionalFallback =
      savedCoatOfArmsUrl ||
      municipalityLogoFallback(scopedMunicipality?.name || institution?.name);
    const primaryHeaderLogo =
      (resolvedTenantHeaderLogoState.tenantId === resolvedInstitutionId ? resolvedTenantHeaderLogoState.url : "") ||
      brandingUrl ||
      synchronousHeaderUrl ||
      (isUsableBrandingUrl(base.logoUrl) ? base.logoUrl : "") ||
      (stableTenantHeaderLogoRef.current.tenantId === resolvedInstitutionId &&
      isUsableBrandingUrl(stableTenantHeaderLogoRef.current.url)
        ? stableTenantHeaderLogoRef.current.url
        : "") ||
      cachedHeaderUrl;
    const resolvedTenantHeaderLogo = primaryHeaderLogo || institutionalFallback;

    if (primaryHeaderLogo) {
      stableTenantHeaderLogoRef.current = {
        tenantId: resolvedInstitutionId,
        url: primaryHeaderLogo,
      };
      writeTenantLogoCache(resolvedInstitutionId, "header", primaryHeaderLogo);
    }

    return {
      ...base,
      // Fonte primária é o arquivo municipal persistido no R2. Se esse arquivo
      // estiver temporariamente indisponível, o componente ainda recebe um
      // brasão institucional real em vez do placeholder genérico.
      logoUrl:
        resolvedTenantHeaderLogo ||
        (stableTenantHeaderLogoRef.current.tenantId === resolvedInstitutionId
          ? stableTenantHeaderLogoRef.current.url
          : ""),
      fallbackLogoUrl: institutionalFallback,
    };
  }, [
    institution?.name,
    scopedMunicipality?.name,
    institutionSettings,
    masterBrandingState,
    platformBranding?.headerLogoFileName,
    resolvedMasterHeaderLogoUrl,
    resolvedTenantHeaderLogoState,
    resolvedInstitutionId,
    scopedMunicipalityBranding?.logoObjectKey,
    shouldUseMasterBranding,
    scopedMunicipalityBranding?.headerLogoUrl,
    scopedMunicipalityBranding?.footerLogoUrl,
    scopedMunicipalityBranding?.headerLogoObjectKey,
    scopedMunicipalityBranding?.footerLogoObjectKey,
    scopedMunicipalityBranding?.logoUrl,
  ]);

  const footerBranding = useMemo(() => {
    if (shouldUseMasterBranding) {
      const masterBranding = getMasterInstitutionBranding(masterBrandingState, "footer");
      return {
        ...masterBranding,
        logoUrl: resolvedMasterFooterLogoUrl || masterBranding.logoUrl,
        ...(platformBranding?.footerLogoFileName.endsWith("-enquadrado.png")
          ? { logoScale: 1, logoOffsetX: 0, logoOffsetY: 0 }
          : {}),
      };
    }
    const base = getInstitutionBranding(
      institutionSettings,
      institution?.name ? `Logo institucional de ${institution.name}` : "Logo institucional",
      "footer",
    );
    const rawFooterUrl =
      scopedMunicipalityBranding?.footerLogoUrl ||
      scopedMunicipalityBranding?.logoUrl ||
      "";
    const brandingUrl = isUsableBrandingUrl(rawFooterUrl) ? rawFooterUrl : "";
    const footerObjectKey = String(
      scopedMunicipalityBranding?.footerLogoObjectKey ||
      scopedMunicipalityBranding?.logoObjectKey ||
      scopedMunicipalityBranding?.headerLogoObjectKey ||
      "",
    )
      .trim()
      .replace(/^\/+/, "");
    const synchronousFooterUrl = footerObjectKey
      ? getMunicipalityLogoOpenUrl(footerObjectKey)
      : "";
    const cachedFooterUrl = readTenantLogoCache(resolvedInstitutionId, "footer");
    const savedCoatOfArmsUrl =
      resolvePersistentBrandingReference(institutionSettings?.brasaoUrl);
    const institutionalFallback =
      savedCoatOfArmsUrl ||
      municipalityLogoFallback(scopedMunicipality?.name || institution?.name);
    const primaryFooterLogo =
      (resolvedTenantFooterLogoState.tenantId === resolvedInstitutionId ? resolvedTenantFooterLogoState.url : "") ||
      brandingUrl ||
      synchronousFooterUrl ||
      (isUsableBrandingUrl(base.logoUrl) ? base.logoUrl : "") ||
      (stableTenantFooterLogoRef.current.tenantId === resolvedInstitutionId &&
      isUsableBrandingUrl(stableTenantFooterLogoRef.current.url)
        ? stableTenantFooterLogoRef.current.url
        : "") ||
      cachedFooterUrl;
    const resolvedTenantFooterLogo = primaryFooterLogo || institutionalFallback;

    if (primaryFooterLogo) {
      stableTenantFooterLogoRef.current = {
        tenantId: resolvedInstitutionId,
        url: primaryFooterLogo,
      };
      writeTenantLogoCache(resolvedInstitutionId, "footer", primaryFooterLogo);
    }

    return {
      ...base,
      // Mantém a última imagem válida enquanto uma nova URL do R2 é resolvida.
      logoUrl:
        resolvedTenantFooterLogo ||
        (stableTenantFooterLogoRef.current.tenantId === resolvedInstitutionId
          ? stableTenantFooterLogoRef.current.url
          : ""),
      fallbackLogoUrl: institutionalFallback,
    };
  }, [
    institution?.name,
    scopedMunicipality?.name,
    institutionSettings,
    masterBrandingState,
    platformBranding?.footerLogoFileName,
    resolvedMasterFooterLogoUrl,
    resolvedTenantFooterLogoState,
    resolvedInstitutionId,
    scopedMunicipalityBranding?.logoObjectKey,
    shouldUseMasterBranding,
    scopedMunicipalityBranding?.footerLogoUrl,
    scopedMunicipalityBranding?.headerLogoUrl,
    scopedMunicipalityBranding?.headerLogoObjectKey,
    scopedMunicipalityBranding?.footerLogoObjectKey,
    scopedMunicipalityBranding?.logoUrl,
  ]);

  return {
    headerBranding,
    footerBranding,
    officialHeaderText: resolvedHeaderText,
    officialFooterText: resolvedFooterText,
    canManageTenantSettings: can(session, "manage_tenant_branding"),
  };
}
