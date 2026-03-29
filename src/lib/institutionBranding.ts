import type { TenantSettings } from "@/lib/platform";

export type InstitutionalLogoConfigVariant = "header" | "footer";

export interface InstitutionalBranding {
  tenantId: string;
  logoUrl: string;
  logoScale: number;
  logoOffsetX: number;
  logoOffsetY: number;
  logoAlt: string;
  logoUpdatedAt: string;
  logoUpdatedBy: string;
  logoFrameMode: "soft-square" | "rounded";
  logoFitMode: "contain" | "cover";
}

function pickVariantSettings(settings: TenantSettings | null | undefined, variant: InstitutionalLogoConfigVariant) {
  if (variant === "footer") {
    return {
      scale: settings?.footerLogoScale,
      offsetX: settings?.footerLogoOffsetX,
      offsetY: settings?.footerLogoOffsetY,
      frameMode: settings?.footerLogoFrameMode,
      fitMode: settings?.footerLogoFitMode,
    };
  }

  return {
    scale: settings?.headerLogoScale ?? settings?.logoScale,
    offsetX: settings?.headerLogoOffsetX ?? settings?.logoOffsetX,
    offsetY: settings?.headerLogoOffsetY ?? settings?.logoOffsetY,
    frameMode: settings?.headerLogoFrameMode ?? settings?.logoFrameMode,
    fitMode: settings?.headerLogoFitMode ?? settings?.logoFitMode,
  };
}

export function getInstitutionBranding(
  settings?: TenantSettings | null,
  fallbackAlt?: string,
  variant: InstitutionalLogoConfigVariant = "header",
): InstitutionalBranding {
  const selected = pickVariantSettings(settings, variant);
  const fallbackLogo = settings?.brasaoUrl || settings?.bandeiraUrl || "";

  return {
    tenantId: settings?.tenantId ?? "",
    logoUrl: settings?.logoUrl || fallbackLogo,
    logoScale: selected.scale ?? 1,
    logoOffsetX: selected.offsetX ?? 0,
    logoOffsetY: selected.offsetY ?? 0,
    logoAlt: settings?.logoAlt || fallbackAlt || "Logo institucional",
    logoUpdatedAt: settings?.logoUpdatedAt ?? "",
    logoUpdatedBy: settings?.logoUpdatedBy ?? "",
    logoFrameMode: selected.frameMode ?? "soft-square",
    logoFitMode: selected.fitMode ?? "contain",
  };
}

export function updateInstitutionBranding(
  settings: TenantSettings,
  branding: Partial<InstitutionalBranding>,
  variant: InstitutionalLogoConfigVariant = "header",
): TenantSettings {
  const current = getInstitutionBranding(
    settings,
    settings.logoAlt || settings.secretariaResponsavel || "Logo institucional",
    variant,
  );

  const nextScale = branding.logoScale ?? current.logoScale;
  const nextOffsetX = branding.logoOffsetX ?? current.logoOffsetX;
  const nextOffsetY = branding.logoOffsetY ?? current.logoOffsetY;
  const nextFrameMode = branding.logoFrameMode ?? current.logoFrameMode;
  const nextFitMode = branding.logoFitMode ?? current.logoFitMode;

  return {
    ...settings,
    logoUrl: branding.logoUrl ?? settings.logoUrl ?? current.logoUrl,
    logoAlt: branding.logoAlt ?? settings.logoAlt ?? current.logoAlt,
    logoUpdatedAt: branding.logoUpdatedAt ?? settings.logoUpdatedAt ?? current.logoUpdatedAt,
    logoUpdatedBy: branding.logoUpdatedBy ?? settings.logoUpdatedBy ?? current.logoUpdatedBy,
    ...(variant === "header"
      ? {
          headerLogoScale: nextScale,
          headerLogoOffsetX: nextOffsetX,
          headerLogoOffsetY: nextOffsetY,
          headerLogoFrameMode: nextFrameMode,
          headerLogoFitMode: nextFitMode,
          logoScale: nextScale,
          logoOffsetX: nextOffsetX,
          logoOffsetY: nextOffsetY,
          logoFrameMode: nextFrameMode,
          logoFitMode: nextFitMode,
        }
      : {
          footerLogoScale: nextScale,
          footerLogoOffsetX: nextOffsetX,
          footerLogoOffsetY: nextOffsetY,
          footerLogoFrameMode: nextFrameMode,
          footerLogoFitMode: nextFitMode,
        }),
  };
}
