import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Building2, Calculator, Flag, Image as ImageIcon, Landmark, Link2, MonitorCog, Palette, ReceiptText, ScrollText, ShieldPlus, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { ImageFrameEditor } from "@/components/platform/ImageFrameEditor";
import { InstitutionalLogo } from "@/components/platform/InstitutionalLogo";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageHeader } from "@/components/platform/PageHeader";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { hasSupabaseEnv } from "@/integrations/supabase/client";
import { loadMunicipalityBundleById } from "@/integrations/supabase/municipality";
import { saveRemoteInstitutionSettings, uploadInstitutionalBrandingAsset } from "@/integrations/supabase/platform";
import { getInstitutionBranding, updateInstitutionBranding, type InstitutionalLogoConfigVariant } from "@/lib/institutionBranding";
import { buildTenantFromMunicipalityBundle, buildTenantSettingsFromMunicipality } from "@/lib/municipality";
import { can, desktopThemePresets, mobileThemePresets } from "@/lib/platform";

function imageFiles(url: string, label: string): UploadedFileItem[] {
  return url
    ? [
        {
          id: `${label}-${encodeURIComponent(url)}`,
          fileName: label,
          mimeType: "image/*",
          sizeLabel: "imagem salva",
          previewUrl: url,
        },
      ]
    : [];
}

function resolveBrandingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    if (/header_logo_|footer_logo_/i.test(error.message)) {
      return `${error.message} Rode a migration de header/footer do logo no Supabase antes de confirmar novamente.`;
    }
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = "message" in error && typeof error.message === "string" ? error.message : "";
    const details = "details" in error && typeof error.details === "string" ? error.details : "";
    const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
    const merged = [message, details, hint].filter(Boolean).join(" ");
    if (merged) {
      if (/header_logo_|footer_logo_/i.test(merged)) {
        return `${merged} Rode a migration de header/footer do logo no Supabase antes de confirmar novamente.`;
      }
      return merged;
    }
  }

  return fallback;
}

export function ConfiguracoesPage() {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const { authenticatedEmail, updateEmail, updatePassword } = useAuthGateway();
  const { institutions, getInstitutionSettings, getUserProfile, saveUserProfile, saveInstitutionSettings, upsertInstitution } = usePlatformData();
  const availableInstitutions = useMemo(() => institutions, [institutions]);
  const initialTenantId = scopeId ?? session.tenantId ?? availableInstitutions[0]?.id ?? "";
  const [selectedTenantId, setSelectedTenantId] = useState(initialTenantId);
  const [status, setStatus] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const tenant = availableInstitutions.find((item) => item.id === selectedTenantId) ?? null;
  const [remoteBundle, setRemoteBundle] = useState<Awaited<ReturnType<typeof loadMunicipalityBundleById>>>(null);
  const activeInstitution =
    buildTenantFromMunicipalityBundle(remoteBundle?.municipality, remoteBundle?.branding, remoteBundle?.settings, tenant) ??
    municipality ??
    tenant;
  const settings =
    buildTenantSettingsFromMunicipality(remoteBundle?.municipality, remoteBundle?.branding, remoteBundle?.settings, getInstitutionSettings(selectedTenantId)) ??
    getInstitutionSettings(selectedTenantId);
  const { headerBranding, footerBranding } = useInstitutionBranding(selectedTenantId || scopeId || session.tenantId);
  const userProfile = getUserProfile(session.id, authenticatedEmail ?? session.email);
  const canManageTenantSettings = can(session, "manage_tenant_branding");
  const brandingUpdatedBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.id)
    ? session.id
    : "";
  const darken = (hex: string, amount: number) => {
    const clean = hex.replace("#", "");
    const value = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    const r = clamp(parseInt(value.slice(0, 2), 16) - amount);
    const g = clamp(parseInt(value.slice(2, 4), 16) - amount);
    const b = clamp(parseInt(value.slice(4, 6), 16) - amount);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value || 0));

  const [tenantForm, setTenantForm] = useState({
    name: activeInstitution?.name ?? "",
    city: tenant?.city ?? "",
    state: tenant?.state ?? municipality?.state ?? "SP",
    status: tenant?.status ?? "implantacao",
    plan: tenant?.plan ?? "Plano institucional",
    subdomain: tenant?.subdomain ?? municipality?.subdomain ?? "",
    primaryColor: tenant?.theme.primary ?? "#0f3557",
    accentColor: tenant?.theme.accent ?? "#178f78",
  });
  const activeTenantDesktopThemePreset =
    desktopThemePresets.find((preset) => preset.primary === tenantForm.primaryColor && preset.accent === tenantForm.accentColor) ??
    desktopThemePresets[0];
  const activeTenantMobileThemePreset =
    mobileThemePresets.find((preset) => preset.primary === tenantForm.primaryColor && preset.accent === tenantForm.accentColor) ??
    mobileThemePresets[0];

  const [settingsForm, setSettingsForm] = useState({
    cnpj: settings?.cnpj ?? "",
    endereco: settings?.endereco ?? "",
    telefone: settings?.telefone ?? "",
    email: settings?.email ?? "",
    site: settings?.site ?? "",
    secretariaResponsavel: settings?.secretariaResponsavel ?? "",
    diretoriaResponsavel: settings?.diretoriaResponsavel ?? "",
    diretoriaTelefone: settings?.diretoriaTelefone ?? "",
    diretoriaEmail: settings?.diretoriaEmail ?? "",
    horarioAtendimento: settings?.horarioAtendimento ?? "",
    resumoPlanoDiretor: settings?.resumoPlanoDiretor ?? "",
    resumoUsoSolo: settings?.resumoUsoSolo ?? "",
    leisComplementares: settings?.leisComplementares ?? "",
    linkPortalCliente: settings?.linkPortalCliente ?? "",
    protocoloPrefixo: settings?.protocoloPrefixo ?? "",
    guiaPrefixo: settings?.guiaPrefixo ?? "",
    chavePix: settings?.chavePix ?? "",
    beneficiarioArrecadacao: settings?.beneficiarioArrecadacao ?? "",
    taxaProtocolo: settings?.taxaProtocolo ?? 35.24,
    taxaIssPorMetroQuadrado: settings?.taxaIssPorMetroQuadrado ?? 0,
    taxaAprovacaoFinal: settings?.taxaAprovacaoFinal ?? 0,
    registroProfissionalObrigatorio: settings?.registroProfissionalObrigatorio ?? true,
    logoScale: settings?.logoScale ?? 1,
    logoOffsetX: settings?.logoOffsetX ?? 0,
    logoOffsetY: settings?.logoOffsetY ?? 0,
  });
  const [accountForm, setAccountForm] = useState({
    currentEmail: authenticatedEmail ?? session.email,
    nextEmail: authenticatedEmail ?? session.email,
    nextPassword: "",
    confirmPassword: "",
  });
  const [preferences, setPreferences] = useState(() => {
    if (typeof window === "undefined") {
      return {
        receiveProtocolAlerts: true,
        receiveRequirementAlerts: true,
        receivePaymentAlerts: true,
        receiveProgressAlerts: true,
        receiveEmailAlerts: false,
        dashboardStart: "protocolos",
        layoutDensity: "confortavel",
      };
    }

    try {
      const raw = window.localStorage.getItem(`sigapro-user-preferences:${session.id}`);
      return raw
        ? JSON.parse(raw)
        : {
            receiveProtocolAlerts: true,
            receiveRequirementAlerts: true,
            receivePaymentAlerts: true,
            receiveProgressAlerts: true,
            receiveEmailAlerts: false,
            dashboardStart: "protocolos",
            layoutDensity: "confortavel",
          };
    } catch {
      return {
        receiveProtocolAlerts: true,
        receiveRequirementAlerts: true,
        receivePaymentAlerts: true,
        receiveProgressAlerts: true,
        receiveEmailAlerts: false,
        dashboardStart: "protocolos",
        layoutDensity: "confortavel",
      };
    }
  });
  const [activeSettingsView, setActiveSettingsView] = useState<
    | "overview"
    | "branding"
    | "institutional"
    | "communication"
    | "protocol"
    | "team"
    | "account"
    | "advanced"
  >("overview");

  const [logoFiles, setLogoFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.logoUrl ?? "", "logo"));
  const [draftLogoFiles, setDraftLogoFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.logoUrl ?? "", "logo"));
  const [draftHeaderLogoConfig, setDraftHeaderLogoConfig] = useState({
    scale: settings?.headerLogoScale ?? settings?.logoScale ?? 1,
    offsetX: settings?.headerLogoOffsetX ?? settings?.logoOffsetX ?? 0,
    offsetY: settings?.headerLogoOffsetY ?? settings?.logoOffsetY ?? 0,
  });
  const [draftFooterLogoConfig, setDraftFooterLogoConfig] = useState({
    scale: settings?.footerLogoScale ?? settings?.logoScale ?? 1,
    offsetX: settings?.footerLogoOffsetX ?? settings?.logoOffsetX ?? 0,
    offsetY: settings?.footerLogoOffsetY ?? settings?.logoOffsetY ?? 0,
  });
  const [headerLogoStatus, setHeaderLogoStatus] = useState("");
  const [footerLogoStatus, setFooterLogoStatus] = useState("");
  const [logoSaving, setLogoSaving] = useState<InstitutionalLogoConfigVariant | null>(null);
  const [brasaoFiles, setBrasaoFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.brasaoUrl ?? "", "brasao"));
  const [bandeiraFiles, setBandeiraFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.bandeiraUrl ?? "", "bandeira"));
  const [heroFiles, setHeroFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.imagemHeroUrl ?? "", "imagem institucional"));
  const [planoDiretorFiles, setPlanoDiretorFiles] = useState<UploadedFileItem[]>(
    settings?.planoDiretorArquivoUrl
      ? [{ id: "plano-diretor", fileName: settings.planoDiretorArquivoNome || "plano-diretor.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: settings.planoDiretorArquivoUrl }]
      : [],
  );
  const [usoSoloFiles, setUsoSoloFiles] = useState<UploadedFileItem[]>(
    settings?.usoSoloArquivoUrl
      ? [{ id: "uso-solo", fileName: settings.usoSoloArquivoNome || "uso-solo.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: settings.usoSoloArquivoUrl }]
      : [],
  );
  const [leisFiles, setLeisFiles] = useState<UploadedFileItem[]>(
    settings?.leisArquivoUrl
      ? [{ id: "leis-complementares", fileName: settings.leisArquivoNome || "leis-complementares.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: settings.leisArquivoUrl }]
      : [],
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const bundle = await loadMunicipalityBundleById(selectedTenantId);
        if (active) setRemoteBundle(bundle);
      } catch {
        if (active) setRemoteBundle(null);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [selectedTenantId]);

  useEffect(() => {
    const nextTenant = availableInstitutions.find((item) => item.id === selectedTenantId) ?? null;
    const nextMappedInstitution = buildTenantFromMunicipalityBundle(
      remoteBundle?.municipality,
      remoteBundle?.branding,
      remoteBundle?.settings,
      nextTenant,
    );
    const nextSettings =
      buildTenantSettingsFromMunicipality(
        remoteBundle?.municipality,
        remoteBundle?.branding,
        remoteBundle?.settings,
        getInstitutionSettings(selectedTenantId),
      ) ?? getInstitutionSettings(selectedTenantId);

    setTenantForm({
      name: nextMappedInstitution?.name ?? "",
      city: nextMappedInstitution?.city ?? "",
      state: nextMappedInstitution?.state ?? "SP",
      status: nextMappedInstitution?.status ?? "implantacao",
      plan: nextMappedInstitution?.plan ?? "Plano institucional",
      subdomain: nextMappedInstitution?.subdomain ?? "",
      primaryColor: nextMappedInstitution?.theme.primary ?? "#0f3557",
      accentColor: nextMappedInstitution?.theme.accent ?? "#178f78",
    });

    setSettingsForm({
      cnpj: nextSettings?.cnpj ?? "",
      endereco: nextSettings?.endereco ?? "",
      telefone: nextSettings?.telefone ?? "",
      email: nextSettings?.email ?? "",
      site: nextSettings?.site ?? "",
      secretariaResponsavel: nextSettings?.secretariaResponsavel ?? "",
      diretoriaResponsavel: nextSettings?.diretoriaResponsavel ?? "",
      diretoriaTelefone: nextSettings?.diretoriaTelefone ?? "",
      diretoriaEmail: nextSettings?.diretoriaEmail ?? "",
      horarioAtendimento: nextSettings?.horarioAtendimento ?? "",
      resumoPlanoDiretor: nextSettings?.resumoPlanoDiretor ?? "",
      resumoUsoSolo: nextSettings?.resumoUsoSolo ?? "",
      leisComplementares: nextSettings?.leisComplementares ?? "",
      linkPortalCliente: nextSettings?.linkPortalCliente ?? "",
      protocoloPrefixo: nextSettings?.protocoloPrefixo ?? "",
      guiaPrefixo: nextSettings?.guiaPrefixo ?? "",
      chavePix: nextSettings?.chavePix ?? "",
      beneficiarioArrecadacao: nextSettings?.beneficiarioArrecadacao ?? "",
      taxaProtocolo: nextSettings?.taxaProtocolo ?? 35.24,
      taxaIssPorMetroQuadrado: nextSettings?.taxaIssPorMetroQuadrado ?? 0,
      taxaAprovacaoFinal: nextSettings?.taxaAprovacaoFinal ?? 0,
      registroProfissionalObrigatorio: nextSettings?.registroProfissionalObrigatorio ?? true,
      logoScale: nextSettings?.logoScale ?? 1,
      logoOffsetX: nextSettings?.logoOffsetX ?? 0,
      logoOffsetY: nextSettings?.logoOffsetY ?? 0,
    });

    setLogoFiles(imageFiles(nextSettings?.logoUrl ?? "", "logo"));
    setDraftLogoFiles(imageFiles(nextSettings?.logoUrl ?? "", "logo"));
    setDraftHeaderLogoConfig({
      scale: nextSettings?.headerLogoScale ?? nextSettings?.logoScale ?? 1,
      offsetX: nextSettings?.headerLogoOffsetX ?? nextSettings?.logoOffsetX ?? 0,
      offsetY: nextSettings?.headerLogoOffsetY ?? nextSettings?.logoOffsetY ?? 0,
    });
    setDraftFooterLogoConfig({
      scale: nextSettings?.footerLogoScale ?? nextSettings?.logoScale ?? 1,
      offsetX: nextSettings?.footerLogoOffsetX ?? nextSettings?.logoOffsetX ?? 0,
      offsetY: nextSettings?.footerLogoOffsetY ?? nextSettings?.logoOffsetY ?? 0,
    });
    setBrasaoFiles(imageFiles(nextSettings?.brasaoUrl ?? "", "brasao"));
    setBandeiraFiles(imageFiles(nextSettings?.bandeiraUrl ?? "", "bandeira"));
    setHeroFiles(imageFiles(nextSettings?.imagemHeroUrl ?? "", "imagem institucional"));
    setPlanoDiretorFiles(
      nextSettings?.planoDiretorArquivoUrl
        ? [{ id: "plano-diretor", fileName: nextSettings.planoDiretorArquivoNome || "plano-diretor.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: nextSettings.planoDiretorArquivoUrl }]
        : [],
    );
    setUsoSoloFiles(
      nextSettings?.usoSoloArquivoUrl
        ? [{ id: "uso-solo", fileName: nextSettings.usoSoloArquivoNome || "uso-solo.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: nextSettings.usoSoloArquivoUrl }]
        : [],
    );
    setLeisFiles(
      nextSettings?.leisArquivoUrl
        ? [{ id: "leis-complementares", fileName: nextSettings.leisArquivoNome || "leis-complementares.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: nextSettings.leisArquivoUrl }]
        : [],
    );
  }, [availableInstitutions, getInstitutionSettings, remoteBundle, selectedTenantId]);

  const setTenantField = (field: keyof typeof tenantForm, value: string) => {
    setTenantForm((current) => ({ ...current, [field]: value }));
  };

  const setSettingsField = (field: keyof typeof settingsForm, value: string | number) => {
    setSettingsForm((current) => ({ ...current, [field]: value }));
  };

  const updateLogoFrame =
    (variant: InstitutionalLogoConfigVariant) =>
    ({ scale, offsetX, offsetY }: { scale: number; offsetX: number; offsetY: number }) => {
      const next = { scale, offsetX, offsetY };
      if (variant === "footer") {
        setDraftFooterLogoConfig(next);
        return;
      }
      setDraftHeaderLogoConfig(next);
    };

  useEffect(() => {
    setAccountForm((current) => ({
      ...current,
      currentEmail: authenticatedEmail ?? session.email,
      nextEmail: authenticatedEmail ?? session.email,
    }));
  }, [authenticatedEmail, session.email]);

  const setAccountField = (field: keyof typeof accountForm, value: string) => {
    setAccountForm((current) => ({ ...current, [field]: value }));
  };

  const ensureSelectedTenant = () =>
    upsertInstitution({
      institutionId: selectedTenantId || undefined,
      name: tenantForm.name,
      city: tenantForm.city,
      state: tenantForm.state,
      status: tenantForm.status as "ativo" | "implantacao" | "suspenso",
      plan: tenantForm.plan,
      subdomain: tenantForm.subdomain,
      primaryColor: tenantForm.primaryColor,
      accentColor: tenantForm.accentColor,
    });

  const handleConfirmLogo = async (variant: InstitutionalLogoConfigVariant) => {
    if (variant === "footer") {
      setFooterLogoStatus("");
    } else {
      setHeaderLogoStatus("");
    }
    setLogoSaving(variant);

    try {
      const savedTenant = ensureSelectedTenant();
      let logoUrl = draftLogoFiles[0]?.previewUrl ?? settings?.logoUrl ?? "";
      const draftConfig = variant === "footer" ? draftFooterLogoConfig : draftHeaderLogoConfig;
      const activeBranding = variant === "footer" ? footerBranding : headerBranding;

      if (hasSupabaseEnv && draftLogoFiles[0]?.file) {
        const uploaded = await uploadInstitutionalBrandingAsset({
          tenantId: savedTenant.id,
          file: draftLogoFiles[0].file,
        });
        logoUrl = uploaded.publicUrl;
      }

      const nextSettings = updateInstitutionBranding(
        {
          tenantId: savedTenant.id,
          ...(settings ?? settingsForm),
          ...settingsForm,
          logoUrl,
          brasaoUrl: brasaoFiles[0]?.previewUrl ?? settings?.brasaoUrl ?? "",
          bandeiraUrl: bandeiraFiles[0]?.previewUrl ?? settings?.bandeiraUrl ?? "",
          imagemHeroUrl: heroFiles[0]?.previewUrl ?? settings?.imagemHeroUrl ?? "",
          planoDiretorArquivoNome: planoDiretorFiles[0]?.fileName ?? settings?.planoDiretorArquivoNome ?? "",
          planoDiretorArquivoUrl: planoDiretorFiles[0]?.previewUrl ?? settings?.planoDiretorArquivoUrl ?? "",
          usoSoloArquivoNome: usoSoloFiles[0]?.fileName ?? settings?.usoSoloArquivoNome ?? "",
          usoSoloArquivoUrl: usoSoloFiles[0]?.previewUrl ?? settings?.usoSoloArquivoUrl ?? "",
          leisArquivoNome: leisFiles[0]?.fileName ?? settings?.leisArquivoNome ?? "",
          leisArquivoUrl: leisFiles[0]?.previewUrl ?? settings?.leisArquivoUrl ?? "",
          logoScale: headerBranding.logoScale,
          logoOffsetX: headerBranding.logoOffsetX,
          logoOffsetY: headerBranding.logoOffsetY,
          headerLogoScale: headerBranding.logoScale,
          headerLogoOffsetX: headerBranding.logoOffsetX,
          headerLogoOffsetY: headerBranding.logoOffsetY,
          footerLogoScale: footerBranding.logoScale,
          footerLogoOffsetX: footerBranding.logoOffsetX,
          footerLogoOffsetY: footerBranding.logoOffsetY,
          logoAlt: activeBranding.logoAlt,
          logoUpdatedAt: activeBranding.logoUpdatedAt,
          logoUpdatedBy: activeBranding.logoUpdatedBy,
          logoFrameMode: headerBranding.logoFrameMode,
          logoFitMode: headerBranding.logoFitMode,
          headerLogoFrameMode: headerBranding.logoFrameMode,
          headerLogoFitMode: headerBranding.logoFitMode,
          footerLogoFrameMode: footerBranding.logoFrameMode,
          footerLogoFitMode: footerBranding.logoFitMode,
        },
        {
          tenantId: savedTenant.id,
          logoUrl,
          logoScale: draftConfig.scale,
          logoOffsetX: draftConfig.offsetX,
          logoOffsetY: draftConfig.offsetY,
          logoAlt: tenantForm.name ? `Logo institucional de ${tenantForm.name}` : activeBranding.logoAlt,
          logoUpdatedAt: new Date().toISOString(),
          logoUpdatedBy: brandingUpdatedBy,
          logoFrameMode: "soft-square",
          logoFitMode: "contain",
        },
        variant,
      );

      if (hasSupabaseEnv) {
        await saveRemoteInstitutionSettings(nextSettings);
      }

      saveInstitutionSettings(nextSettings);
      setSelectedTenantId(savedTenant.id);
      setLogoFiles(imageFiles(nextSettings.logoUrl ?? "", "logo"));
      setDraftLogoFiles(imageFiles(nextSettings.logoUrl ?? "", "logo"));
      setSettingsForm((current) => ({
        ...current,
        logoScale: nextSettings.logoScale ?? 1,
        logoOffsetX: nextSettings.logoOffsetX ?? 0,
        logoOffsetY: nextSettings.logoOffsetY ?? 0,
      }));
      setDraftHeaderLogoConfig({
        scale: nextSettings.headerLogoScale ?? nextSettings.logoScale ?? 1,
        offsetX: nextSettings.headerLogoOffsetX ?? nextSettings.logoOffsetX ?? 0,
        offsetY: nextSettings.headerLogoOffsetY ?? nextSettings.logoOffsetY ?? 0,
      });
      setDraftFooterLogoConfig({
        scale: nextSettings.footerLogoScale ?? nextSettings.logoScale ?? 1,
        offsetX: nextSettings.footerLogoOffsetX ?? nextSettings.logoOffsetX ?? 0,
        offsetY: nextSettings.footerLogoOffsetY ?? nextSettings.logoOffsetY ?? 0,
      });
      if (variant === "footer") {
        setFooterLogoStatus("Logo do rodape atualizado com sucesso.");
      } else {
        setHeaderLogoStatus("Logo do cabecalho atualizado com sucesso.");
      }
    } catch (error) {
      const message = resolveBrandingErrorMessage(error, "Falha ao aplicar o logo institucional.");
      if (variant === "footer") {
        setFooterLogoStatus(message);
      } else {
        setHeaderLogoStatus(message);
      }
    } finally {
      setLogoSaving(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const savedTenant = ensureSelectedTenant();
    const logoUrl = logoFiles[0]?.previewUrl ?? settings?.logoUrl ?? "";

    const nextSettings = updateInstitutionBranding({
      tenantId: savedTenant.id,
      ...settings,
      ...settingsForm,
      logoUrl,
      brasaoUrl: brasaoFiles[0]?.previewUrl ?? "",
      bandeiraUrl: bandeiraFiles[0]?.previewUrl ?? "",
      imagemHeroUrl: heroFiles[0]?.previewUrl ?? "",
      planoDiretorArquivoNome: planoDiretorFiles[0]?.fileName ?? "",
      planoDiretorArquivoUrl: planoDiretorFiles[0]?.previewUrl ?? "",
      usoSoloArquivoNome: usoSoloFiles[0]?.fileName ?? "",
      usoSoloArquivoUrl: usoSoloFiles[0]?.previewUrl ?? "",
      leisArquivoNome: leisFiles[0]?.fileName ?? "",
      leisArquivoUrl: leisFiles[0]?.previewUrl ?? "",
      logoScale: headerBranding.logoScale,
      logoOffsetX: headerBranding.logoOffsetX,
      logoOffsetY: headerBranding.logoOffsetY,
      headerLogoScale: headerBranding.logoScale,
      headerLogoOffsetX: headerBranding.logoOffsetX,
      headerLogoOffsetY: headerBranding.logoOffsetY,
      footerLogoScale: footerBranding.logoScale,
      footerLogoOffsetX: footerBranding.logoOffsetX,
      footerLogoOffsetY: footerBranding.logoOffsetY,
      logoAlt: settings?.logoAlt ?? "",
      logoUpdatedAt: settings?.logoUpdatedAt ?? "",
      logoUpdatedBy: settings?.logoUpdatedBy ?? "",
      logoFrameMode: headerBranding.logoFrameMode,
      logoFitMode: headerBranding.logoFitMode,
      headerLogoFrameMode: headerBranding.logoFrameMode,
      headerLogoFitMode: headerBranding.logoFitMode,
      footerLogoFrameMode: footerBranding.logoFrameMode,
      footerLogoFitMode: footerBranding.logoFitMode,
    }, {
      tenantId: savedTenant.id,
      logoUrl,
      logoScale: headerBranding.logoScale,
      logoOffsetX: headerBranding.logoOffsetX,
      logoOffsetY: headerBranding.logoOffsetY,
      logoAlt: tenantForm.name ? `Logo institucional de ${tenantForm.name}` : headerBranding.logoAlt,
      logoUpdatedAt: settings?.logoUpdatedAt ?? "",
      logoUpdatedBy: settings?.logoUpdatedBy ?? "",
      logoFrameMode: headerBranding.logoFrameMode,
      logoFitMode: headerBranding.logoFitMode,
    }, "header");

    if (hasSupabaseEnv) {
      try {
        await saveRemoteInstitutionSettings(nextSettings);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Falha ao sincronizar o branding institucional.");
        return;
      }
    }

    saveInstitutionSettings(nextSettings);

    setSelectedTenantId(savedTenant.id);
    setStatus("Configurações da prefeitura salvas com sucesso.");
  };

  const savePreferences = (next: typeof preferences) => {
    setPreferences(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`sigapro-user-preferences:${session.id}`, JSON.stringify(next));
    }
    setAccountStatus("Preferências atualizadas com sucesso.");
  };

  const accountSettingsSection = (
    <SectionCard
      title="Preferências da conta"
      description="Centralize alertas, painel inicial e ajustes de experiência."
      icon={ShieldPlus}
      contentClassName="space-y-4"
    >
        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Painel inicial</p>
            <p className="sig-fit-title sig-value mt-2" title={preferences.dashboardStart}>
              {preferences.dashboardStart === "protocolos" ? "Protocolos e processos" : "Resumo geral"}
            </p>
            <p className="sig-field-help mt-1">Define a prioridade de abertura do sistema.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Densidade da interface</p>
            <p className="sig-value mt-2">{preferences.layoutDensity === "compacta" ? "Compacta" : "Confortável"}</p>
            <p className="sig-field-help mt-1">Ajuste visual sem alterar o conteúdo institucional.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Canal de notificação</p>
            <p className="sig-value mt-2">{preferences.receiveEmailAlerts ? "E-mail e sistema" : "Somente sistema"}</p>
            <p className="sig-field-help mt-1">Controle de avisos sobre protocolos, exigências e pagamentos.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="mb-3 flex items-center gap-2 text-slate-950">
                <Bell className="h-4 w-4" />
                <p className="text-sm text-slate-900">Notificações</p>
              </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">Aviso de protocolo</p>
                  <p className="text-sm text-slate-500">Receber alerta quando um protocolo avancar.</p>
                </div>
                <Switch checked={preferences.receiveProtocolAlerts} onCheckedChange={(checked) => savePreferences({ ...preferences, receiveProtocolAlerts: checked })} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">Aviso de exigência</p>
                  <p className="text-sm text-slate-500">Sinaliza pendências formais e respostas abertas.</p>
                </div>
                <Switch checked={preferences.receiveRequirementAlerts} onCheckedChange={(checked) => savePreferences({ ...preferences, receiveRequirementAlerts: checked })} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">Aviso de pagamento</p>
                  <p className="text-sm text-slate-500">Mostra novas guias e pendências financeiras.</p>
                </div>
                <Switch checked={preferences.receivePaymentAlerts} onCheckedChange={(checked) => savePreferences({ ...preferences, receivePaymentAlerts: checked })} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">Aviso por e-mail</p>
                  <p className="text-sm text-slate-500">Replica alertas principais no e-mail cadastrado.</p>
                </div>
                <Switch checked={preferences.receiveEmailAlerts} onCheckedChange={(checked) => savePreferences({ ...preferences, receiveEmailAlerts: checked })} />
              </div>
            </div>
          </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="mb-3 flex items-center gap-2 text-slate-950">
                <MonitorCog className="h-4 w-4" />
                <p className="text-sm text-slate-900">Aparência e experiência</p>
              </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Densidade do layout</Label>
                <Select value={preferences.layoutDensity} onValueChange={(value) => savePreferences({ ...preferences, layoutDensity: value })}>
                  <SelectTrigger className="rounded-2xl bg-white">
                    <SelectValue placeholder="Escolha a densidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confortavel">Confortável</SelectItem>
                    <SelectItem value="compacta">Compacta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Painel principal</Label>
                <Select value={preferences.dashboardStart} onValueChange={(value) => savePreferences({ ...preferences, dashboardStart: value })}>
                  <SelectTrigger className="rounded-2xl bg-white">
                    <SelectValue placeholder="Escolha a prioridade do painel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="protocolos">Protocolos e processos</SelectItem>
                    <SelectItem value="resumo">Resumo geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">Aviso de andamento</p>
                  <p className="text-sm text-slate-500">Destaca mudanças de etapa e confirmações importantes.</p>
                </div>
                <Switch checked={preferences.receiveProgressAlerts} onCheckedChange={(checked) => savePreferences({ ...preferences, receiveProgressAlerts: checked })} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Sessão e segurança</p>
            <p className="mt-2 text-sm text-slate-900">Sessão atual protegida</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">Base pronta para futuras políticas de segurança e sessão.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Preferências operacionais</p>
            <p className="mt-2 text-sm text-slate-900">Atalhos e painel inicial</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">Área preparada para refinamentos do painel e de atalhos.</p>
          </div>
        </div>

        {accountStatus ? <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{accountStatus}</div> : null}
    </SectionCard>
  );

  const previewSettingsBase = {
    tenantId: selectedTenantId || tenant?.id || "",
    cnpj: settingsForm.cnpj,
    endereco: settingsForm.endereco,
    telefone: settingsForm.telefone,
    email: settingsForm.email,
    site: settingsForm.site,
    secretariaResponsavel: settingsForm.secretariaResponsavel,
    diretoriaResponsavel: settingsForm.diretoriaResponsavel,
    diretoriaTelefone: settingsForm.diretoriaTelefone,
    diretoriaEmail: settingsForm.diretoriaEmail,
    horarioAtendimento: settingsForm.horarioAtendimento,
    brasaoUrl: brasaoFiles[0]?.previewUrl ?? settings?.brasaoUrl ?? "",
    bandeiraUrl: bandeiraFiles[0]?.previewUrl ?? settings?.bandeiraUrl ?? "",
    logoUrl: draftLogoFiles[0]?.previewUrl ?? settings?.logoUrl ?? "",
    imagemHeroUrl: heroFiles[0]?.previewUrl ?? settings?.imagemHeroUrl ?? "",
    resumoPlanoDiretor: settingsForm.resumoPlanoDiretor,
    resumoUsoSolo: settingsForm.resumoUsoSolo,
    leisComplementares: settingsForm.leisComplementares,
    linkPortalCliente: settingsForm.linkPortalCliente,
    protocoloPrefixo: settingsForm.protocoloPrefixo,
    guiaPrefixo: settingsForm.guiaPrefixo,
    chavePix: settingsForm.chavePix,
    beneficiarioArrecadacao: settingsForm.beneficiarioArrecadacao,
    taxaProtocolo: settingsForm.taxaProtocolo,
    taxaIssPorMetroQuadrado: settingsForm.taxaIssPorMetroQuadrado,
    issRateProfiles: settings?.issRateProfiles,
    taxaAprovacaoFinal: settingsForm.taxaAprovacaoFinal,
    registroProfissionalObrigatorio: settingsForm.registroProfissionalObrigatorio,
    contractNumber: settings?.contractNumber ?? "",
    contractStart: settings?.contractStart ?? "",
    contractEnd: settings?.contractEnd ?? "",
    monthlyFee: settings?.monthlyFee ?? 0,
    setupFee: settings?.setupFee ?? 0,
    signatureMode: settings?.signatureMode ?? "eletronica",
    clientDeliveryLink: settings?.clientDeliveryLink ?? "",
    logoScale: headerBranding.logoScale,
    logoOffsetX: headerBranding.logoOffsetX,
    logoOffsetY: headerBranding.logoOffsetY,
    headerLogoScale: headerBranding.logoScale,
    headerLogoOffsetX: headerBranding.logoOffsetX,
    headerLogoOffsetY: headerBranding.logoOffsetY,
    footerLogoScale: footerBranding.logoScale,
    footerLogoOffsetX: footerBranding.logoOffsetX,
    footerLogoOffsetY: footerBranding.logoOffsetY,
    logoAlt: settings?.logoAlt ?? "",
    logoUpdatedAt: settings?.logoUpdatedAt ?? "",
    logoUpdatedBy: settings?.logoUpdatedBy ?? "",
    logoFrameMode: headerBranding.logoFrameMode,
    logoFitMode: headerBranding.logoFitMode,
    headerLogoFrameMode: headerBranding.logoFrameMode,
    headerLogoFitMode: headerBranding.logoFitMode,
    footerLogoFrameMode: footerBranding.logoFrameMode,
    footerLogoFitMode: footerBranding.logoFitMode,
    planoDiretorArquivoNome: planoDiretorFiles[0]?.fileName ?? settings?.planoDiretorArquivoNome ?? "",
    planoDiretorArquivoUrl: planoDiretorFiles[0]?.previewUrl ?? settings?.planoDiretorArquivoUrl ?? "",
    usoSoloArquivoNome: usoSoloFiles[0]?.fileName ?? settings?.usoSoloArquivoNome ?? "",
    usoSoloArquivoUrl: usoSoloFiles[0]?.previewUrl ?? settings?.usoSoloArquivoUrl ?? "",
    leisArquivoNome: leisFiles[0]?.fileName ?? settings?.leisArquivoNome ?? "",
    leisArquivoUrl: leisFiles[0]?.previewUrl ?? settings?.leisArquivoUrl ?? "",
  };

  const previewHeaderBranding = getInstitutionBranding(
    updateInstitutionBranding(
      previewSettingsBase,
      {
        logoUrl: draftLogoFiles[0]?.previewUrl ?? settings?.logoUrl ?? "",
        logoScale: draftHeaderLogoConfig.scale,
        logoOffsetX: draftHeaderLogoConfig.offsetX,
        logoOffsetY: draftHeaderLogoConfig.offsetY,
        logoAlt: tenantForm.name ? `Logo institucional de ${tenantForm.name}` : headerBranding.logoAlt,
        logoFrameMode: "soft-square",
        logoFitMode: "contain",
      },
      "header",
    ),
    tenantForm.name || tenant?.name || "Logo institucional",
    "header",
  );

  const previewFooterBranding = getInstitutionBranding(
    updateInstitutionBranding(
      previewSettingsBase,
      {
        logoUrl: draftLogoFiles[0]?.previewUrl ?? settings?.logoUrl ?? "",
        logoScale: draftFooterLogoConfig.scale,
        logoOffsetX: draftFooterLogoConfig.offsetX,
        logoOffsetY: draftFooterLogoConfig.offsetY,
        logoAlt: tenantForm.name ? `Logo institucional de ${tenantForm.name}` : footerBranding.logoAlt,
        logoFrameMode: "soft-square",
        logoFitMode: "contain",
      },
      "footer",
    ),
    tenantForm.name || tenant?.name || "Logo institucional",
    "footer",
  );

  const headerLogoStatusIsSuccess = /sucesso/i.test(headerLogoStatus);
  const footerLogoStatusIsSuccess = /sucesso/i.test(footerLogoStatus);
  const settingsTabs = [
    { id: "overview" as const, label: "Visão geral", helper: "Resumo institucional" },
    { id: "branding" as const, label: "Branding", helper: "Logo e identidade" },
    { id: "institutional" as const, label: "Dados institucionais", helper: "Prefeitura e secretaria" },
    { id: "communication" as const, label: "Comunicação", helper: "Canais e entrega" },
    { id: "protocol" as const, label: "Protocolo", helper: "Prefixos e taxas" },
    { id: "account" as const, label: "Preferências", helper: "Conta e alertas" },
  ];
  const guideSettingsCards = [
    {
      label: "Guia de protocolo",
      value: formatCurrency(settingsForm.taxaProtocolo),
      helper: "Valor fixo emitido na abertura do processo.",
      icon: ReceiptText,
    },
    {
      label: "ISS da obra",
      value: `${formatCurrency(settingsForm.taxaIssPorMetroQuadrado)} / m²`,
      helper: "Base usada no cálculo complementar por metragem.",
      icon: Calculator,
    },
    {
      label: "Guia final",
      value: formatCurrency(settingsForm.taxaAprovacaoFinal),
      helper: "Valor final de aprovação e habite-se.",
      icon: Wallet,
    },
  ];
  const protocolSimulationTotal =
    Number(settingsForm.taxaProtocolo || 0) +
    Number(settingsForm.taxaAprovacaoFinal || 0) +
    Number(((250 * Number(settingsForm.taxaIssPorMetroQuadrado || 0))).toFixed(2));
  const overviewSection = (
    <PageMainGrid className="mt-4 xl:grid-cols-12">
      <PageMainContent className="xl:col-span-8">
        <SectionCard
          title="Resumo institucional"
          description="Confira a base ativa da Prefeitura e os pontos principais da operação institucional."
          icon={Building2}
          headerClassName="gap-2 pb-3"
          contentClassName="space-y-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <p className="sig-label">Instituição</p>
                <p className="sig-fit-title mt-2 text-base font-semibold leading-6 text-slate-900">
                  {tenantForm.name || "SIGAPRO"}
                </p>
              </div>
              <p className="line-clamp-2 text-sm text-slate-500">
                {settingsForm.secretariaResponsavel || "Secretaria não informada"}
              </p>
            </div>

            <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <p className="sig-label">Canal oficial</p>
                <p className="sig-fit-title mt-2 text-base font-semibold leading-6 text-slate-900">
                  {settingsForm.email || "E-mail não informado"}
                </p>
              </div>
              <p className="sig-fit-copy text-sm leading-6 text-slate-500">
                {settingsForm.telefone || "Telefone não informado"}
              </p>
            </div>

            <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <p className="sig-label">Protocolo</p>
                <p className="sig-fit-title mt-2 text-base font-semibold leading-6 text-slate-900">
                  {(settingsForm.protocoloPrefixo || "SIG")} / {(settingsForm.guiaPrefixo || "DAM")}
                </p>
              </div>
              <p className="text-sm text-slate-500">Prefixos oficiais da operação.</p>
            </div>

            <div className="flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <p className="sig-label">Portal institucional</p>
                <p className="sig-fit-title mt-2 text-base font-semibold leading-6 text-slate-900">
                  {tenantForm.subdomain || settingsForm.linkPortalCliente || "Não configurado"}
                </p>
              </div>
              <p className="text-sm text-slate-500">Endereço público de atendimento.</p>
            </div>
          </div>
        </SectionCard>
      </PageMainContent>

      <PageSideContent className="space-y-4 xl:col-span-4">
        <SectionCard
          title="Acessos rápidos"
          description="Entre direto no bloco que precisa de ajuste."
          icon={Link2}
          headerClassName="gap-2 pb-3"
          contentClassName="space-y-3"
        >
          <div className="grid gap-3">
            <button type="button" onClick={() => setActiveSettingsView("branding")} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="sig-fit-title text-sm font-medium leading-6 text-slate-900">Branding e identidade</p>
                <p className="sig-fit-copy text-sm leading-6 text-slate-500">Logo, ativos e paleta.</p>
              </div>
              <Palette className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
            </button>

            <button type="button" onClick={() => setActiveSettingsView("institutional")} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="sig-fit-title text-sm font-medium leading-6 text-slate-900">Dados institucionais</p>
                <p className="sig-fit-copy text-sm leading-6 text-slate-500">Prefeitura e base cadastral.</p>
              </div>
              <ShieldPlus className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
            </button>

            <button type="button" onClick={() => setActiveSettingsView("communication")} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="sig-fit-title text-sm font-medium leading-6 text-slate-900">Comunicação oficial</p>
                <p className="sig-fit-copy text-sm leading-6 text-slate-500">E-mail, site e canais.</p>
              </div>
              <Bell className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
            </button>

            <button type="button" onClick={() => setActiveSettingsView("protocol")} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="sig-fit-title text-sm font-medium leading-6 text-slate-900">Protocolo e prefixos</p>
                <p className="sig-fit-copy text-sm leading-6 text-slate-500">Numeração e taxas.</p>
              </div>
              <ScrollText className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Estado atual"
          description="Leitura rápida da configuração ativa."
          icon={Flag}
          headerClassName="gap-2 pb-3"
          contentClassName="space-y-3"
        >
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="sig-label">Status do contrato</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {tenantForm.status === "ativo"
                ? "Ativo"
                : tenantForm.status === "suspenso"
                  ? "Suspenso"
                  : "Implantação"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="sig-label">Plano comercial</p>
            <p className="mt-2 sig-fit-title text-sm font-medium text-slate-900">
              {tenantForm.plan || "Plano institucional"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="sig-label">Arrecadação</p>
            <p className="mt-2 sig-fit-title text-sm font-medium text-slate-900">
              {settingsForm.beneficiarioArrecadacao || "Beneficiário não informado"}
            </p>
          </div>
        </SectionCard>
      </PageSideContent>
    </PageMainGrid>
  );
  const settingsSectionMeta =
    activeSettingsView === "communication"
      ? {
          title: "Comunicação oficial",
          description: "Concentre canais públicos, contato institucional e dados de entrega do portal.",
          icon: Bell,
        }
      : activeSettingsView === "protocol"
        ? {
            title: "Protocolo e prefixos",
            description: "Organize prefixos, numeração oficial e parâmetros financeiros do fluxo DAM.",
            icon: ScrollText,
          }
        : activeSettingsView === "team"
          ? {
              title: "Equipe responsável",
              description: "Centralize secretaria, diretoria e contatos institucionais da Prefeitura.",
              icon: ShieldPlus,
            }
          : activeSettingsView === "advanced"
            ? {
                title: "Parâmetros avançados",
                description: "Mantenha base regulatória, regras locais e parâmetros complementares.",
                icon: Landmark,
              }
            : {
                title: "Dados institucionais",
                description: "Mantenha Prefeitura, Secretaria e base cadastral em um bloco mais objetivo.",
                icon: ShieldPlus,
              };

  return (
    <PortalFrame eyebrow="Configurações institucionais" title="Branding, dados institucionais e preferências">
      <PageShell>
      <PageHeader
        eyebrow="Branding institucional"
        title="Identidade e operação institucional"
        description="Organize branding, contatos oficiais, prefixos e preferências da Prefeitura."
        icon={MonitorCog}
        className="rounded-[30px] p-5 md:p-6 lg:p-7"
      />
      <PageStatsRow>
        <StatCard label="Instituição ativa" value={tenantForm.name || "SIGAPRO"} description="Base institucional vinculada" icon={Building2} tone="default" valueClassName="max-w-[24ch] sig-fit-title text-[17px] font-semibold leading-tight text-slate-900" />
        <StatCard label="Secretaria" value={settingsForm.secretariaResponsavel || "Não informada"} description="Exibição principal do cabeçalho" icon={Flag} tone="default" valueClassName="max-w-[22ch] sig-fit-title text-[17px] font-semibold leading-tight text-slate-900" />
        <StatCard label="Prefixo do protocolo" value={settingsForm.protocoloPrefixo || "SIG"} description="Numeração oficial ativa" icon={ScrollText} tone="default" valueClassName="max-w-[18ch] sig-fit-title text-[17px] font-semibold leading-tight text-slate-900" />
        <StatCard label="Canal institucional" value={settingsForm.email || "Não informado"} description="Contato público principal" icon={Bell} tone="default" valueClassName="max-w-[22ch] sig-fit-title text-[17px] font-semibold leading-tight text-slate-900" />
      </PageStatsRow>
      <InternalTabs
        items={[
          { value: "overview", label: "Visão geral", helper: "Resumo institucional" },
          { value: "branding", label: "Branding", helper: "Logo e identidade" },
          { value: "institutional", label: "Dados institucionais", helper: "Prefeitura e cadastro" },
          { value: "communication", label: "Comunicação oficial", helper: "Canais e contato público" },
          { value: "protocol", label: "Protocolo e prefixos", helper: "Numeração e DAM" },
          { value: "team", label: "Equipe responsável", helper: "Secretaria e diretoria" },
          { value: "account", label: "Preferências", helper: "Conta e alertas" },
          { value: "advanced", label: "Parâmetros avançados", helper: "Regras e base local" },
        ]}
        value={activeSettingsView}
        onChange={(value) => setActiveSettingsView(value as typeof activeSettingsView)}
      />
      {activeSettingsView === "overview" ? overviewSection : null}
      {canManageTenantSettings && (activeSettingsView === "branding" || activeSettingsView === "institutional" || activeSettingsView === "communication" || activeSettingsView === "protocol" || activeSettingsView === "team" || activeSettingsView === "advanced") ? <PageMainGrid className="mt-4">
        {activeSettingsView === "branding" ? <PageMainContent className="xl:col-span-12">
        <SectionCard title="Branding e identidade" description="Organize prefeitura, paleta e ativos institucionais com leitura objetiva." icon={Building2} contentClassName="space-y-5" headerClassName="gap-2 pb-3">
            {session.tenantId === null ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Selecionar prefeitura</Label>
                  <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="Escolha a prefeitura" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableInstitutions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setSelectedTenantId("");
                    setTenantForm({
                      name: "",
                      city: "",
                      state: "SP",
                      status: "implantacao",
                      plan: "Plano institucional",
                      subdomain: "",
                      primaryColor: "#0f3557",
                      accentColor: "#178f78",
                    });
                    setSettingsForm({
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
                      resumoPlanoDiretor: "",
                      resumoUsoSolo: "",
                      leisComplementares: "",
                      linkPortalCliente: "",
                      protocoloPrefixo: "",
                      guiaPrefixo: "",
                      chavePix: "",
                      beneficiarioArrecadacao: "",
                      taxaProtocolo: 35.24,
                      taxaIssPorMetroQuadrado: 0,
                      taxaAprovacaoFinal: 0,
                      registroProfissionalObrigatorio: true,
                      logoScale: 1,
                      logoOffsetX: 0,
                      logoOffsetY: 0,
                    });
                    setLogoFiles([]);
                    setDraftLogoFiles([]);
                    setDraftHeaderLogoConfig({
                      scale: 1,
                      offsetX: 0,
                      offsetY: 0,
                    });
                    setDraftFooterLogoConfig({
                      scale: 1,
                      offsetX: 0,
                      offsetY: 0,
                    });
                    setHeaderLogoStatus("");
                    setFooterLogoStatus("");
                    setBrasaoFiles([]);
                    setBandeiraFiles([]);
                    setHeroFiles([]);
                    setPlanoDiretorFiles([]);
                    setUsoSoloFiles([]);
                    setLeisFiles([]);
                  }}
                >
                  Nova prefeitura
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                Esta área está vinculada a {activeInstitution?.name ?? "prefeitura atual"}.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome institucional</Label>
                <Input value={tenantForm.name} onChange={(event) => setTenantField("name", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={tenantForm.city} onChange={(event) => setTenantField("city", event.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input value={tenantForm.state} onChange={(event) => setTenantField("state", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status do contrato</Label>
                <Select value={tenantForm.status} onValueChange={(value) => setTenantField("status", value)}>
                  <SelectTrigger className="h-12 rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="implantacao">Implantação</SelectItem>
                    <SelectItem value="suspenso">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Plano comercial</Label>
                <Input value={tenantForm.plan} onChange={(event) => setTenantField("plan", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Link do cliente</Label>
                <Input value={tenantForm.subdomain} onChange={(event) => setTenantField("subdomain", event.target.value)} placeholder="cliente.sigapro.com.br" />
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              <Label>Tema visual institucional</Label>
              <div className="grid gap-3">
                {mobileThemePresets.map((preset) => {
                  const active = tenantForm.primaryColor === preset.primary && tenantForm.accentColor === preset.accent;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setTenantForm((current) => ({
                          ...current,
                          primaryColor: preset.primary,
                          accentColor: preset.accent,
                        }))
                      }
                      className={`rounded-[20px] border p-3 text-left transition ${
                        active ? "border-slate-900 shadow-sm" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="overflow-hidden rounded-[14px] border border-slate-200">
                        <div style={{ height: 10, background: darken(preset.primary, 28) }} />
                        <div
                          style={{
                            height: 42,
                            background: `linear-gradient(135deg, ${preset.primary} 0%, ${darken(preset.primary, -6)} 58%, ${darken(preset.primary, -10)} 100%)`,
                          }}
                        />
                      </div>
                      <p className="mt-3 text-sm text-slate-900">{preset.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{preset.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.primary }} />
                        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.accent }} />
                      </div>
                      {active ? (
                        <span className="mt-3 inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-white md:hidden">
                          Tema ativo
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <Select
                value={activeTenantMobileThemePreset.id}
                onValueChange={(value) => {
                  const preset = mobileThemePresets.find((item) => item.id === value);
                  if (!preset) return;
                  setTenantForm((current) => ({
                    ...current,
                    primaryColor: preset.primary,
                    accentColor: preset.accent,
                  }));
                }}
              >
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Selecione um dos 4 temas oficiais" />
                </SelectTrigger>
                <SelectContent>
                  {themePresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Tema selecionado</p>
                <div className="mt-3 flex items-center gap-4">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-slate-200 shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${activeTenantMobileThemePreset.primary} 0%, ${darken(activeTenantMobileThemePreset.primary, -8)} 100%)`,
                    }}
                  >
                    <Palette className="h-4 w-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{activeTenantMobileThemePreset.label}</p>
                    <p className="text-sm leading-6 text-slate-500">{activeTenantMobileThemePreset.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: activeTenantMobileThemePreset.primary }} />
                  <span className="text-xs text-slate-500">Base institucional</span>
                  <span className="ml-3 h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: activeTenantMobileThemePreset.accent }} />
                  <span className="text-xs text-slate-500">Acento visual</span>
                </div>
              </div>
            </div>

            <div className="hidden space-y-2 md:block">
              <Label>Variedade de cores do layout</Label>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {desktopThemePresets.map((preset) => {
                  const active = tenantForm.primaryColor === preset.primary && tenantForm.accentColor === preset.accent;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setTenantForm((current) => ({
                          ...current,
                          primaryColor: preset.primary,
                          accentColor: preset.accent,
                        }))
                      }
                      className={`rounded-[20px] border p-3 text-left transition ${
                        active ? "border-slate-900 shadow-sm" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="overflow-hidden rounded-[14px] border border-slate-200">
                        <div style={{ height: 10, background: darken(preset.primary, 28) }} />
                        <div
                          style={{
                            height: 42,
                            background: `linear-gradient(135deg, ${preset.primary} 0%, ${darken(preset.primary, -6)} 58%, ${darken(preset.primary, -10)} 100%)`,
                          }}
                        />
                      </div>
                      <p className="mt-3 text-sm text-slate-900">{preset.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{preset.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.primary }} />
                        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: preset.accent }} />
                      </div>
                    </button>
                  );
                })}
              </div>
              <Select
                value={desktopThemePresets.find((preset) => preset.primary === tenantForm.primaryColor && preset.accent === tenantForm.accentColor)?.id ?? "personalizado"}
                onValueChange={(value) => {
                  if (value === "personalizado") return;
                  const preset = desktopThemePresets.find((item) => item.id === value);
                  if (!preset) return;
                  setTenantForm((current) => ({
                    ...current,
                    primaryColor: preset.primary,
                    accentColor: preset.accent,
                  }));
                }}
              >
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Selecione uma paleta pronta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personalizado">Personalizado atual</SelectItem>
                  {desktopThemePresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="hidden grid-cols-2 gap-4 md:grid">
              <div className="space-y-2">
                <Label>Cor principal</Label>
                <Input type="color" value={tenantForm.primaryColor} onChange={(event) => setTenantField("primaryColor", event.target.value)} className="h-12 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label>Cor de destaque</Label>
                <Input type="color" value={tenantForm.accentColor} onChange={(event) => setTenantField("accentColor", event.target.value)} className="h-12 rounded-2xl" />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fc_100%)] p-5">
                <div className="flex items-center gap-2 text-slate-950">
                  <ImageIcon className="h-4 w-4" />
                  <p className="text-sm text-slate-900">Logo do cabecalho</p>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Ajuste o enquadramento do banner principal no frame institucional.</p>
                <div className="mt-4 grid gap-6 2xl:grid-cols-[minmax(520px,1.15fr)_minmax(340px,0.85fr)]">
                  <div
                    className="overflow-hidden rounded-[30px] p-6 shadow-[0_24px_52px_rgba(15,42,68,0.16)]"
                    style={{ background: `linear-gradient(135deg, ${tenantForm.primaryColor} 0%, ${darken(tenantForm.primaryColor, -6)} 58%, ${darken(tenantForm.primaryColor, -10)} 100%)` }}
                  >
                    <div className="rounded-[22px] px-5 pb-4 pt-4" style={{ background: `linear-gradient(90deg, ${darken(tenantForm.primaryColor, 28)} 0%, ${darken(tenantForm.primaryColor, 18)} 46%, ${darken(tenantForm.primaryColor, 10)} 100%)` }}>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#d4e7f7]">Visual institucional</p>
                      <p className="mt-2 text-sm leading-6 text-white md:text-[15px]">Cabecalho institucional</p>
                    </div>
                    <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center xl:grid-cols-[240px_minmax(0,1fr)]">
                      <InstitutionalLogo
                        branding={previewHeaderBranding}
                        fallbackLabel={tenantForm.name || "Prefeitura"}
                        variant="header"
                        className="mx-auto shrink-0 lg:mx-0"
                      />
                      <div className="min-w-0 flex-1 text-white">
                        <p className="text-balance break-words text-[15px] font-semibold leading-tight text-white md:text-[17px] xl:text-[18px]">
                          {tenantForm.name || "Prefeitura"}
                        </p>
                        <p
                          className="mt-3 max-w-[30ch] text-sm font-normal leading-6 md:text-sm"
                          style={{ color: tenantForm.accentColor }}
                        >
                          {settingsForm.secretariaResponsavel || "Secretaria responsável"}
                        </p>
                        <div className="mt-4 inline-flex max-w-full rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-normal leading-5 text-white shadow-[0_12px_26px_rgba(2,6,23,0.16)]">
                          <span className="truncate">
                            {session.name} - {session.role === "prefeitura_admin" ? "Administrador da Prefeitura" : "Usuário vinculado"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {draftLogoFiles[0]?.previewUrl ? (
                      <ImageFrameEditor
                        imageUrl={draftLogoFiles[0].previewUrl}
                        scale={draftHeaderLogoConfig.scale}
                        offsetX={draftHeaderLogoConfig.offsetX}
                        offsetY={draftHeaderLogoConfig.offsetY}
                        onChange={updateLogoFrame("header")}
                        label="Enquadramento do cabecalho"
                        hint="Arraste a marca dentro do quadro e use o scroll para posicionar o logo do cabecalho."
                        frameClassName="justify-start"
                        viewportClassName="h-[104px] w-[176px] rounded-[18px]"
                        wrapperClassName="border-slate-200 bg-white"
                      />
                    ) : (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                        Envie o logo da prefeitura para liberar o ajuste do cabecalho.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setDraftHeaderLogoConfig({ scale: 1, offsetX: 0, offsetY: 0 })}>
                        Restaurar enquadramento
                      </Button>
                      <Button type="button" className="rounded-2xl bg-slate-950 hover:bg-slate-900" onClick={() => handleConfirmLogo("header")} disabled={logoSaving === "header"}>
                        {logoSaving === "header" ? "Aplicando..." : "Confirmar logo"}
                      </Button>
                    </div>
                    {headerLogoStatus ? (
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm ${
                          headerLogoStatusIsSuccess
                            ? "border border-emerald-200 bg-emerald-50/90 text-emerald-700"
                            : "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {headerLogoStatus}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fc_100%)] p-5">
                <div className="flex items-center gap-2 text-slate-950">
                  <ImageIcon className="h-4 w-4" />
                  <p className="text-sm text-slate-900">Logo do rodape</p>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Ajuste um enquadramento proprio para o rodape sem afetar o cabecalho.</p>
                <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
                  <div
                    className="rounded-[28px] p-5 shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${darken(tenantForm.primaryColor, 2)} 0%, ${tenantForm.primaryColor} 48%, ${darken(tenantForm.primaryColor, 10)} 100%)` }}
                  >
                    <div className="flex items-center justify-center py-3">
                      <InstitutionalLogo branding={previewFooterBranding} fallbackLabel={tenantForm.name || "Prefeitura"} variant="footer" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {draftLogoFiles[0]?.previewUrl ? (
                      <ImageFrameEditor
                        imageUrl={draftLogoFiles[0].previewUrl}
                        scale={draftFooterLogoConfig.scale}
                        offsetX={draftFooterLogoConfig.offsetX}
                        offsetY={draftFooterLogoConfig.offsetY}
                        onChange={updateLogoFrame("footer")}
                        label="Enquadramento do rodape"
                        hint="Ajuste o logo especificamente para o rodape, sem afetar o enquadramento do cabecalho."
                        frameClassName="justify-start"
                        viewportClassName="h-[138px] w-[140px] rounded-[18px]"
                        wrapperClassName="border-slate-200 bg-white"
                      />
                    ) : (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                        Envie o logo da prefeitura para liberar o ajuste do rodape.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setDraftFooterLogoConfig({ scale: 1, offsetX: 0, offsetY: 0 })}>
                        Restaurar enquadramento
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl text-red-600 dark:text-red-400"
                        onClick={() => {
                          setDraftLogoFiles([]);
                          setDraftHeaderLogoConfig({ scale: 1, offsetX: 0, offsetY: 0 });
                          setDraftFooterLogoConfig({ scale: 1, offsetX: 0, offsetY: 0 });
                        }}
                      >
                        Remover logo
                      </Button>
                      <Button type="button" className="rounded-2xl bg-slate-950 hover:bg-slate-900" onClick={() => handleConfirmLogo("footer")} disabled={logoSaving === "footer"}>
                        {logoSaving === "footer" ? "Aplicando..." : "Confirmar logo"}
                      </Button>
                    </div>
                    {footerLogoStatus ? (
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm ${
                          footerLogoStatusIsSuccess
                            ? "border border-emerald-200 bg-emerald-50/90 text-emerald-700"
                            : "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {footerLogoStatus}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <FileDropZone
                title="Logo da prefeitura"
                description="Use a logo oficial para o portal do cliente."
                accept="image/*"
                multiple={false}
                allowPreview
                files={draftLogoFiles}
                onFilesSelected={setDraftLogoFiles}
              />
              <FileDropZone
                title="Brasao"
                description="Imagem oficial para áreas institucionais e documentos."
                accept="image/*"
                multiple={false}
                allowPreview
                files={brasaoFiles}
                onFilesSelected={setBrasaoFiles}
              />
              <FileDropZone
                title="Bandeira"
                description="Imagem complementar da identidade municipal."
                accept="image/*"
                multiple={false}
                allowPreview
                files={bandeiraFiles}
                onFilesSelected={setBandeiraFiles}
              />
              <FileDropZone
                title="Imagem interativa"
                description="Imagem de capa do portal do cliente."
                accept="image/*"
                multiple={false}
                allowPreview
                files={heroFiles}
                onFilesSelected={setHeroFiles}
              />
              <FileDropZone
                title="Arquivo do plano diretor"
                description="Anexe o arquivo oficial do plano diretor."
                accept=".pdf,image/*"
                multiple={false}
                allowPreview
                files={planoDiretorFiles}
                onFilesSelected={setPlanoDiretorFiles}
              />
              <FileDropZone
                title="Arquivo da Lei de Uso e Ocupação do Solo"
                description="Anexe a lei municipal em PDF ou imagem."
                accept=".pdf,image/*"
                multiple={false}
                allowPreview
                files={usoSoloFiles}
                onFilesSelected={setUsoSoloFiles}
              />
              <FileDropZone
                title="Arquivo das leis complementares"
                description="Anexe normas e regulamentos complementares."
                accept=".pdf,image/*"
                multiple={false}
                allowPreview
                files={leisFiles}
                onFilesSelected={setLeisFiles}
              />
            </div>
        </SectionCard>
        </PageMainContent> : null}

        {(activeSettingsView === "institutional" || activeSettingsView === "communication" || activeSettingsView === "protocol" || activeSettingsView === "team" || activeSettingsView === "advanced") ? <PageSideContent className="xl:col-span-12">
        <SectionCard title={settingsSectionMeta.title} description={settingsSectionMeta.description} icon={settingsSectionMeta.icon} headerClassName="gap-2 pb-3" actions={<Button type="button" variant="outline" className="rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>}>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {activeSettingsView === "institutional" ? (
                <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input value={settingsForm.cnpj} onChange={(event) => setSettingsField("cnpj", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={settingsForm.telefone} onChange={(event) => setSettingsField("telefone", event.target.value)} />
                </div>
              </div>
                </>
              ) : null}

              {activeSettingsView === "communication" ? (
                <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>E-mail oficial</Label>
                  <Input value={settingsForm.email} onChange={(event) => setSettingsField("email", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Site institucional</Label>
                  <Input value={settingsForm.site} onChange={(event) => setSettingsField("site", event.target.value)} />
                </div>
              </div>
                </>
              ) : null}

              {activeSettingsView === "institutional" ? (
                <>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={settingsForm.endereco} onChange={(event) => setSettingsField("endereco", event.target.value)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Secretaria responsável</Label>
                  <Input value={settingsForm.secretariaResponsavel} onChange={(event) => setSettingsField("secretariaResponsavel", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horario de atendimento</Label>
                  <Input value={settingsForm.horarioAtendimento} onChange={(event) => setSettingsField("horarioAtendimento", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Diretoria responsavel</Label>
                  <Input value={settingsForm.diretoriaResponsavel} onChange={(event) => setSettingsField("diretoriaResponsavel", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone da diretoria</Label>
                  <Input value={settingsForm.diretoriaTelefone} onChange={(event) => setSettingsField("diretoriaTelefone", event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>E-mail da diretoria</Label>
                <Input value={settingsForm.diretoriaEmail} onChange={(event) => setSettingsField("diretoriaEmail", event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Plano diretor</Label>
                <Textarea rows={4} value={settingsForm.resumoPlanoDiretor} onChange={(event) => setSettingsField("resumoPlanoDiretor", event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Uso e Ocupação do Solo</Label>
                <Textarea rows={4} value={settingsForm.resumoUsoSolo} onChange={(event) => setSettingsField("resumoUsoSolo", event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Leis Complementares e Orientações Técnicas</Label>
                <Textarea rows={4} value={settingsForm.leisComplementares} onChange={(event) => setSettingsField("leisComplementares", event.target.value)} />
              </div>

                </>
              ) : null}

              {activeSettingsView === "communication" ? (
                <>
              <div className="space-y-2">
                <Label>Link publico do cliente</Label>
                <Input value={settingsForm.linkPortalCliente} onChange={(event) => setSettingsField("linkPortalCliente", event.target.value)} />
              </div>

                </>
              ) : null}

              {activeSettingsView === "protocol" ? (
                <>
              <div className="grid gap-4 xl:grid-cols-4">
                {guideSettingsCards.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="sig-label">{item.label}</p>
                      <item.icon className="h-4 w-4 text-slate-500" />
                    </div>
                    <p className="mt-2 sig-fit-title text-lg font-semibold leading-tight text-slate-900" title={item.value}>
                      {item.value}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{item.helper}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <p className="sig-label">Simulação de referência</p>
                  <p className="mt-2 sig-fit-title text-lg font-semibold leading-tight text-slate-900">
                    {formatCurrency(protocolSimulationTotal)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Exemplo com protocolo + ISS de 250 m² + guia final.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm leading-6 text-slate-700">
                Ao confirmar, os novos valores passam a valer automaticamente para novas emissões e para guias pendentes ainda não compensadas desta Prefeitura.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prefixo do protocolo</Label>
                  <Input value={settingsForm.protocoloPrefixo} onChange={(event) => setSettingsField("protocoloPrefixo", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Prefixo da guia DAM</Label>
                  <Input value={settingsForm.guiaPrefixo} onChange={(event) => setSettingsField("guiaPrefixo", event.target.value)} />
                </div>
              </div>

                </>
              ) : null}

              {activeSettingsView === "communication" ? (
                <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Chave Pix</Label>
                  <Input value={settingsForm.chavePix} onChange={(event) => setSettingsField("chavePix", event.target.value)} />
                </div>
                <div className="space-y-2">
                <Label>Beneficiário da Arrecadação</Label>
                  <Input value={settingsForm.beneficiarioArrecadacao} onChange={(event) => setSettingsField("beneficiarioArrecadacao", event.target.value)} />
                </div>
              </div>

                </>
              ) : null}

              {activeSettingsView === "protocol" ? (
                <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Guia de protocolo</Label>
                  <Input type="number" step="0.01" value={settingsForm.taxaProtocolo} onChange={(event) => setSettingsField("taxaProtocolo", Number(event.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>ISS da obra por m²</Label>
                  <Input type="number" step="0.01" value={settingsForm.taxaIssPorMetroQuadrado} onChange={(event) => setSettingsField("taxaIssPorMetroQuadrado", Number(event.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Guia final de aprovação / habite-se</Label>
                  <Input type="number" step="0.01" value={settingsForm.taxaAprovacaoFinal} onChange={(event) => setSettingsField("taxaAprovacaoFinal", Number(event.target.value))} />
                </div>
              </div>
                </>
              ) : null}

              {status ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</div> : null}

              <Button type="submit" className="h-12 w-full rounded-2xl bg-slate-950 hover:bg-slate-900">
                Atualizar perfil da prefeitura
              </Button>
            </form>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Landmark className="h-4 w-4" />
                  Conteudo juridico local
                </div>
                O cadastro municipal fica preparado para plano diretor, uso do solo, código de obras e normas específicas da contratante.
              </div>
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Link2 className="h-4 w-4" />
                  Entrega ao cliente
                </div>
                O link do portal fica salvo e pronto para uso na implantação da prefeitura.
              </div>
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Palette className="h-4 w-4" />
                  Identidade visual
                </div>
                Logo, brasao, bandeira e imagem institucional podem ser atualizados a qualquer momento.
              </div>
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <ScrollText className="h-4 w-4" />
                  Parametrização Local
                </div>
                O sistema fica pronto para receber regras e textos específicos de cada prefeitura contratada.
              </div>
            </div>
        </SectionCard>
        </PageSideContent> : null}
      </PageMainGrid> : null}
      {activeSettingsView === "account" ? accountSettingsSection : null}
      </PageShell>
    </PortalFrame>
  );
}




