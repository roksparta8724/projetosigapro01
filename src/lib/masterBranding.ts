import type { InstitutionalBranding, InstitutionalLogoConfigVariant } from "@/lib/institutionBranding";
import { isRenderableAssetUrl } from "@/lib/assetUrl";

export type MasterBrandingState = {
  logoUrl: string;
  headerLogoUrl: string;
  footerLogoUrl: string;
  logoAlt: string;
  logoUpdatedAt: string;
  logoUpdatedBy: string;
  footerText: string;
  logoScale: number;
  logoOffsetX: number;
  logoOffsetY: number;
  logoFrameMode: "soft-square" | "rounded";
  logoFitMode: "contain" | "cover";
  headerLogoScale: number;
  headerLogoOffsetX: number;
  headerLogoOffsetY: number;
  headerLogoFrameMode: "soft-square" | "rounded";
  headerLogoFitMode: "contain" | "cover";
  footerLogoScale: number;
  footerLogoOffsetX: number;
  footerLogoOffsetY: number;
  footerLogoFrameMode: "soft-square" | "rounded";
  footerLogoFitMode: "contain" | "cover";
};

const STORAGE_KEY = "sigapro-master-branding";

const defaultMasterBranding: MasterBrandingState = {
  logoUrl: "",
  headerLogoUrl: "",
  footerLogoUrl: "",
  logoAlt: "Logo institucional do SIGAPRO",
  logoUpdatedAt: "",
  logoUpdatedBy: "",
  footerText: "SIGAPRO — Sistema integrado de gestão e aprovação de projetos",
  logoScale: 1,
  logoOffsetX: 0,
  logoOffsetY: 0,
  logoFrameMode: "soft-square",
  logoFitMode: "contain",
  headerLogoScale: 1,
  headerLogoOffsetX: 0,
  headerLogoOffsetY: 0,
  headerLogoFrameMode: "soft-square",
  headerLogoFitMode: "contain",
  footerLogoScale: 1,
  footerLogoOffsetX: 0,
  footerLogoOffsetY: 0,
  footerLogoFrameMode: "soft-square",
  footerLogoFitMode: "contain",
};

function isRenderableLogoUrl(value?: string | null) {
  return isRenderableAssetUrl(value);
}

function sanitizeBranding(input: MasterBrandingState): MasterBrandingState {
  const sanitized = { ...input };
  if (!isRenderableLogoUrl(sanitized.logoUrl)) {
    sanitized.logoUrl = "";
  }
  if (!isRenderableLogoUrl(sanitized.headerLogoUrl)) {
    sanitized.headerLogoUrl = "";
  }
  if (!isRenderableLogoUrl(sanitized.footerLogoUrl)) {
    sanitized.footerLogoUrl = "";
  }
  return sanitized;
}

export function loadMasterBranding(): MasterBrandingState {
  if (typeof window === "undefined") {
    return { ...defaultMasterBranding };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultMasterBranding };
    const parsed = JSON.parse(raw) as Partial<MasterBrandingState>;
    return sanitizeBranding({ ...defaultMasterBranding, ...parsed });
  } catch {
    return { ...defaultMasterBranding };
  }
}

export function saveMasterBranding(nextState: MasterBrandingState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function pickVariant(state: MasterBrandingState, variant: InstitutionalLogoConfigVariant) {
  if (variant === "footer") {
    return {
      scale: state.footerLogoScale,
      offsetX: state.footerLogoOffsetX,
      offsetY: state.footerLogoOffsetY,
      frameMode: state.footerLogoFrameMode,
      fitMode: state.footerLogoFitMode,
    };
  }

  return {
    scale: state.headerLogoScale,
    offsetX: state.headerLogoOffsetX,
    offsetY: state.headerLogoOffsetY,
    frameMode: state.headerLogoFrameMode,
    fitMode: state.headerLogoFitMode,
  };
}

export function getMasterInstitutionBranding(
  state: MasterBrandingState,
  variant: InstitutionalLogoConfigVariant,
): InstitutionalBranding {
  const selected = pickVariant(state, variant);
  const variantUrl =
    variant === "footer"
      ? state.footerLogoUrl || state.logoUrl
      : state.headerLogoUrl || state.logoUrl;

  return {
    tenantId: "master",
    logoUrl: variantUrl,
    logoScale: selected.scale,
    logoOffsetX: selected.offsetX,
    logoOffsetY: selected.offsetY,
    logoAlt: state.logoAlt || "Logo institucional do SIGAPRO",
    logoUpdatedAt: state.logoUpdatedAt,
    logoUpdatedBy: state.logoUpdatedBy,
    logoFrameMode: selected.frameMode,
    logoFitMode: selected.fitMode,
  };
}

export function updateMasterBranding(
  state: MasterBrandingState,
  updates: Partial<MasterBrandingState>,
): MasterBrandingState {
  return {
    ...state,
    ...updates,
  };
}
