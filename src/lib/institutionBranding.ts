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

type TenantSettingsWithVariants = TenantSettings & {
  headerLogoUrl?: string;
  footerLogoUrl?: string;
  headerLogoObjectKey?: string;
  footerLogoObjectKey?: string;
};

function pickVariantSettings(
  settings: TenantSettings | null | undefined,
  variant: InstitutionalLogoConfigVariant,
) {
  const settingsWithVariants = settings as TenantSettingsWithVariants | null | undefined;
  const hasVariantLogo = Boolean(
    settingsWithVariants?.headerLogoUrl || settingsWithVariants?.footerLogoUrl ||
    settingsWithVariants?.headerLogoObjectKey || settingsWithVariants?.footerLogoObjectKey,
  );
  if (variant === "footer") {
    return {
      logoUrl: hasVariantLogo ? settingsWithVariants?.footerLogoUrl || "" : settings?.logoUrl || "",
      scale: settings?.footerLogoScale,
      offsetX: settings?.footerLogoOffsetX,
      offsetY: settings?.footerLogoOffsetY,
      frameMode: settings?.footerLogoFrameMode,
      fitMode: settings?.footerLogoFitMode,
    };
  }

  return {
    logoUrl: hasVariantLogo ? settingsWithVariants?.headerLogoUrl || "" : settings?.logoUrl || "",
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
  return {
    tenantId: settings?.tenantId ?? "",
    logoUrl: selected.logoUrl,
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
  const nextLogoUrl = branding.logoUrl ?? current.logoUrl;

  const variantSpecific =
    variant === "header"
      ? {
          headerLogoUrl: nextLogoUrl,
          headerLogoScale: nextScale,
          headerLogoOffsetX: nextOffsetX,
          headerLogoOffsetY: nextOffsetY,
          headerLogoFrameMode: nextFrameMode,
          headerLogoFitMode: nextFitMode,
          // retrocompatibilidade: campos genéricos seguem o header
          logoScale: nextScale,
          logoOffsetX: nextOffsetX,
          logoOffsetY: nextOffsetY,
          logoFrameMode: nextFrameMode,
          logoFitMode: nextFitMode,
        }
      : {
          footerLogoUrl: nextLogoUrl,
          footerLogoScale: nextScale,
          footerLogoOffsetX: nextOffsetX,
          footerLogoOffsetY: nextOffsetY,
          footerLogoFrameMode: nextFrameMode,
          footerLogoFitMode: nextFitMode,
        };

  return {
    ...settings,
    logoUrl: variant === "header" ? nextLogoUrl : settings.logoUrl,
    logoAlt: branding.logoAlt ?? settings.logoAlt ?? current.logoAlt,
    logoUpdatedAt:
      branding.logoUpdatedAt ??
      settings.logoUpdatedAt ??
      current.logoUpdatedAt,
    logoUpdatedBy:
      branding.logoUpdatedBy ??
      settings.logoUpdatedBy ??
      current.logoUpdatedBy,
    ...variantSpecific,
  } as TenantSettings;
}
