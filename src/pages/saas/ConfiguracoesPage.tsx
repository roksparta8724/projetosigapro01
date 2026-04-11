import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
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
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useTenant } from "@/hooks/useTenant";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import {
  resolveMunicipalityIdBySubdomain,
  resolveDefaultMunicipalityId,
  resolveDevMunicipalityId,
  resolveCurrentMunicipalityId,
  resolveCurrentMunicipality,
} from "@/integrations/supabase/municipality";
import {
  getMunicipalityBrandingSafe,
  loadPlatformBranding,
  saveRemoteInstitutionSettings,
  savePlatformBranding,
  uploadInstitutionalBrandingAsset,
  uploadPlatformBrandingAsset,
  upsertRemoteInstitution,
} from "@/integrations/supabase/platform";
import { getInstitutionBranding, updateInstitutionBranding, type InstitutionalLogoConfigVariant } from "@/lib/institutionBranding";
import { deleteFile, getObjectKeyFromPublicUrl, getPublicUrl, getSignedUrlForObject } from "@/integrations/r2/client";
import {
  getMasterInstitutionBranding,
  loadMasterBranding,
  saveMasterBranding,
  updateMasterBranding,
} from "@/lib/masterBranding";
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

function shallowEqualObject<T extends Record<string, unknown>>(a: T, b: T) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function sameFileList(a: UploadedFileItem[], b: UploadedFileItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.previewUrl !== b[i]?.previewUrl) return false;
  }
  return true;
}

function isRenderablePreviewUrl(value?: string | null) {
  if (!value) return false;
  return (
    value.startsWith("http") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  );
}

export function ConfiguracoesPage() {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const tenantContext = useTenant();
  const { municipality, branding: municipalityBranding, settings: municipalitySettings, scopeId, tenantSettingsCompat } = useMunicipality();
  const { authenticatedEmail, updateEmail, updatePassword } = useAuthGateway();
  const bootstrap = useAppBootstrap();
  const { institutions, getInstitutionSettings, getUserProfile, saveUserProfile, saveInstitutionSettings, upsertInstitution } = usePlatformData();
  const getInstitutionSettingsRef = useRef(getInstitutionSettings);
  const availableInstitutions = useMemo(() => institutions, [institutions]);
  const initialTenantId = scopeId ?? session.tenantId ?? availableInstitutions[0]?.id ?? "";
  const [selectedTenantId, setSelectedTenantId] = useState(initialTenantId);
  const [status, setStatus] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [diagnosticStatus, setDiagnosticStatus] = useState("");
  const statusIsSuccess = status.toLowerCase().includes("sucesso");
  const tenant = availableInstitutions.find((item) => item.id === selectedTenantId) ?? null;
  const activeInstitution =
    buildTenantFromMunicipalityBundle(municipality, municipalityBranding, municipalitySettings, tenant) ??
    municipality ??
    tenant;
  const settings =
    tenantSettingsCompat ??
    buildTenantSettingsFromMunicipality(municipality, municipalityBranding, municipalitySettings, getInstitutionSettings(selectedTenantId)) ??
    getInstitutionSettings(selectedTenantId);
  const { headerBranding, footerBranding } = useInstitutionBranding(selectedTenantId || scopeId || session.tenantId);
  const userProfile = getUserProfile(session.id, authenticatedEmail ?? session.email);
  const canManageTenantSettings = can(session, "manage_tenant_branding");
  const isMasterRole =
    bootstrap.scopeType === "platform" ||
    session.role === "master_admin" ||
    session.role === "master_ops";
  const [masterBranding, setMasterBranding] = useState(() => loadMasterBranding());
  const [platformBranding, setPlatformBranding] = useState<Awaited<ReturnType<typeof loadPlatformBranding>> | null>(null);
  const platformBrandingLoadedRef = useRef(false);
  const [masterHeaderPersistedUrl, setMasterHeaderPersistedUrl] = useState("");
  const [masterFooterPersistedUrl, setMasterFooterPersistedUrl] = useState("");
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
  const masterPrimaryColor = "#0f3557";
  const masterAccentColor = "#178f78";
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value || 0));
  const normalizeSlug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const normalizeSubdomainInput = (value: string) => {
    const raw = value.trim().toLowerCase();
    if (!raw) return "";
    const withoutProtocol = raw.replace(/^https?:\/\//, "");
    const withoutPath = withoutProtocol.split("/")[0] ?? "";
    const firstLabel = withoutPath.split(".")[0] ?? "";
    return normalizeSlug(firstLabel);
  };
  const isLocalHost = useMemo(() => {
    const host = (tenantContext.hostname || "").trim().toLowerCase();
    if (tenantContext.isLocalhost) return true;
    if (!host) return false;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
    if (host.startsWith("172.")) {
      const parts = host.split(".");
      const second = Number(parts[1] || "0");
      return second >= 16 && second <= 31;
    }
    return host.endsWith(".local");
  }, [tenantContext.hostname, tenantContext.isLocalhost]);
  const allowRemoteInLocal =
    (import.meta.env.VITE_FORCE_REMOTE_STORE as string | undefined) === "true";
  const publicBase =
    (import.meta.env.VITE_R2_PUBLIC_BASE_URL as string | undefined)?.trim() ||
    "";
  const isUuid = (value?: string | null) =>
    Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
  const withTimeout = async <T,>(promise: Promise<T>, message: string, ms = 20000): Promise<T> => {
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  };
  const withTimeoutLogged = async <T,>(label: string, promise: Promise<T>, ms = 20000): Promise<T> => {
    console.log("[FinalState] Iniciando etapa", { label, ms });
    try {
      return await withTimeout(promise, `Timeout: ${label}`, ms);
    } catch (error) {
      console.error("[Timeout]", { label, error });
      throw error;
    }
  };
  const clearLogoSavingTimeout = () => {
    if (logoSavingTimeoutRef.current) {
      window.clearTimeout(logoSavingTimeoutRef.current);
      logoSavingTimeoutRef.current = null;
    }
  };
  const armLogoSavingTimeout = (variant: InstitutionalLogoConfigVariant) => {
    clearLogoSavingTimeout();
    logoSavingTimeoutRef.current = window.setTimeout(() => {
      const message = "Tempo limite ao aplicar o logo. Verifique a conexão e tente novamente.";
      if (variant === "footer") {
        setFooterLogoStatus(message);
      } else {
        setHeaderLogoStatus(message);
      }
      setLogoSaving(null);
    }, 25000);
  };
  const resolveValidScopeId = (...candidates: Array<string | null | undefined>) => {
    for (const value of candidates) {
      if (!value) continue;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        return value;
      }
    }
    return "";
  };

  const resolvedLocalMunicipalityId = useMemo(() => {
    if (!tenantContext.isLocalhost) return "";
    const envId = (import.meta.env.VITE_DEV_MUNICIPALITY_ID as string | undefined)?.trim() || "";
    return isUuid(envId) ? envId : "";
  }, [tenantContext.isLocalhost]);

  const resolveMunicipalityForBranding = async (normalizedSubdomain: string) => {
    const directId = resolveValidScopeId(
      tenantContext.municipalityId,
      municipality?.id,
      selectedTenantId,
      session.tenantId,
      settings?.tenantId,
      activeInstitution?.id,
      tenant?.id,
    );
    if (directId) {
      console.log("[SIGAPRO] Branding: municipio pelo contexto", { directId });
      return directId;
    }

    if (tenantContext.isLocalhost) {
      const devId = (import.meta.env.VITE_DEV_MUNICIPALITY_ID as string | undefined)?.trim() || "";
      const devSlug = (import.meta.env.VITE_DEV_MUNICIPALITY_SLUG as string | undefined)?.trim() || "";
      const devName = (import.meta.env.VITE_DEV_MUNICIPALITY_NAME as string | undefined)?.trim() || "";

      if (isUuid(devId)) {
        console.log("[SIGAPRO] Branding: municipio por VITE_DEV_MUNICIPALITY_ID", { devId });
        return devId;
      }

      if (devSlug) {
        const normalizedDevSlug = normalizeSubdomainInput(devSlug);
        const bySlug = availableInstitutions.find(
          (item) => normalizeSubdomainInput(item.subdomain || item.slug || "") === normalizedDevSlug,
        );
        if (bySlug?.id && isUuid(bySlug.id)) {
          console.log("[SIGAPRO] Branding: municipio por VITE_DEV_MUNICIPALITY_SLUG", {
            devSlug,
            id: bySlug.id,
          });
          return bySlug.id;
        }
      }

      if (devName) {
        const normalizedName = devName.trim().toLowerCase();
        const byName = availableInstitutions.find(
          (item) => (item.name || "").trim().toLowerCase() === normalizedName,
        );
        if (byName?.id && isUuid(byName.id)) {
          console.log("[SIGAPRO] Branding: municipio por VITE_DEV_MUNICIPALITY_NAME", {
            devName,
            id: byName.id,
          });
          return byName.id;
        }
      }
    }

    const normalizedName = tenantForm.name.trim().toLowerCase();
    const fallbackByList =
      availableInstitutions.find((item) => {
        const sub = normalizeSubdomainInput(item.subdomain || item.slug || "");
        const name = (item.name || "").trim().toLowerCase();
        return (normalizedSubdomain && sub === normalizedSubdomain) || (normalizedName && name === normalizedName);
      }) ?? (availableInstitutions.length === 1 ? availableInstitutions[0] : null);

    if (fallbackByList && isUuid(fallbackByList.id)) {
      console.log("[SIGAPRO] Branding: municipio por lista local", { id: fallbackByList.id });
      return fallbackByList.id;
    }

    const preferredName = tenantForm.name || "Campo Limpo Paulista";

    if (tenantContext.isLocalhost) {
      console.log("[SIGAPRO] Branding: modo localhost", {
        hostname: tenantContext.hostname,
        subdomain: tenantContext.subdomain,
        preferredName,
      });
      try {
        const devId = await withTimeout(
          resolveDevMunicipalityId(),
          "Falha ao localizar prefeitura do ambiente local.",
          6000,
        );
        if (devId) {
          console.log("[SIGAPRO] Branding: municipio por .env (dev)", { devId });
          return devId;
        }
      } catch (error) {
        console.warn("[SIGAPRO] Branding: fallback .env falhou", error);
      }

      try {
        const fallbackId = await withTimeout(
          resolveDefaultMunicipalityId(preferredName),
          "Falha ao localizar prefeitura padrão.",
          6000,
        );
        if (fallbackId) {
          console.log("[SIGAPRO] Branding: municipio por fallback padrão", { fallbackId });
          return fallbackId;
        }
      } catch (error) {
        console.warn("[SIGAPRO] Branding: fallback padrão falhou", error);
      }
    }

    if (normalizedSubdomain && hasSupabaseEnv) {
      try {
        const idBySubdomain = await withTimeout(
          resolveMunicipalityIdBySubdomain(normalizedSubdomain),
          "Falha ao localizar prefeitura pelo subdomínio.",
          6000,
        );
        if (idBySubdomain) {
          console.log("[SIGAPRO] Branding: municipio por subdominio", { normalizedSubdomain, idBySubdomain });
          return idBySubdomain;
        }
      } catch (error) {
        console.warn("[SIGAPRO] Branding: subdominio falhou", error);
      }
    }

    if (hasSupabaseEnv) {
      try {
        const resolved = await withTimeout(
          resolveCurrentMunicipalityId({
            hostname: tenantContext.hostname,
            subdomain: tenantContext.subdomain ?? normalizedSubdomain,
            isLocalhost: tenantContext.isLocalhost,
            preferredName,
          }),
          "Falha ao resolver prefeitura atual.",
          6000,
        );
        if (resolved.id) {
          console.log("[SIGAPRO] Branding: municipio por resolver atual", resolved);
          return resolved.id;
        }
      } catch (error) {
        console.warn("[SIGAPRO] Branding: resolver atual falhou", error);
      }
    }

    return "";
  };

  const handleTestMunicipality = async () => {
    setDiagnosticStatus("Diagnóstico: resolvendo prefeitura...");
    try {
      const resolveStartedAt = Date.now();
      const resolved = await resolveCurrentMunicipality({
        hostname: tenantContext.hostname,
        subdomain: tenantContext.subdomain,
        isLocalhost: tenantContext.isLocalhost,
      });
      console.log("[SIGAPRO][Diagnostico] resolveCurrentMunicipality tempo (ms)", {
        elapsed: Date.now() - resolveStartedAt,
      });

      console.log("[SIGAPRO][Diagnostico] Prefeitura resolvida", resolved);

      if (!resolved?.id) {
        setDiagnosticStatus("Diagnóstico: prefeitura não encontrada.");
        return;
      }

      if (!hasSupabaseEnv || !supabase) {
        setDiagnosticStatus("Diagnóstico: Supabase indisponível.");
        return;
      }

      setDiagnosticStatus(`Diagnóstico: prefeitura ${resolved.id}. Testando banco...`);

      const brandingStartedAt = Date.now();
      const branding = await getMunicipalityBrandingSafe(resolved.id);
      console.log("[SIGAPRO][Diagnostico] getMunicipalityBrandingSafe tempo (ms)", {
        elapsed: Date.now() - brandingStartedAt,
      });
      console.log("[SIGAPRO][Diagnostico] Branding retornado", branding);

      if (!branding) {
        setDiagnosticStatus("Diagnóstico: branding não retornou (ver logs).");
        return;
      }

      setDiagnosticStatus(`Diagnóstico: branding OK (id ${branding.id}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido.";
      console.error("[SIGAPRO][Diagnostico] Falha", error);
      setDiagnosticStatus(`Diagnóstico: falha -> ${message}`);
    }
  };

  const activeTenantDesktopThemePreset =
    desktopThemePresets.find((preset) => preset.primary === tenantForm.primaryColor && preset.accent === tenantForm.accentColor) ??
    desktopThemePresets[0];
  const activeTenantMobileThemePreset =
    mobileThemePresets.find((preset) => preset.primary === tenantForm.primaryColor && preset.accent === tenantForm.accentColor) ??
    mobileThemePresets[0];

  useEffect(() => {
    if (availableInstitutions.length === 0) {
      if (selectedTenantId && !isUuid(selectedTenantId)) {
        setSelectedTenantId("");
      }
      return;
    }

    // Evita sobrescrever o municipality_id resolvido (UUID) com tenantIds locais.
    if (isUuid(selectedTenantId)) {
      return;
    }

    const stillExists = availableInstitutions.some((item) => item.id === selectedTenantId);
    if (stillExists) return;

    const nextPreferred =
      availableInstitutions.find((item) => item.id === scopeId)?.id ??
      availableInstitutions.find((item) => item.id === session.tenantId)?.id ??
      availableInstitutions.find((item) => item.status === "ativo")?.id ??
      availableInstitutions.find((item) => item.status === "implantacao")?.id ??
      availableInstitutions[0]?.id ??
      "";

    if (nextPreferred !== selectedTenantId) {
      setSelectedTenantId(nextPreferred);
    }
  }, [availableInstitutions, scopeId, selectedTenantId, session.tenantId]);

  useEffect(() => {
    if (isLocalHost && !allowRemoteInLocal) {
      if (resolvedLocalMunicipalityId && resolvedLocalMunicipalityId !== selectedTenantId) {
        setSelectedTenantId(resolvedLocalMunicipalityId);
      }
    }
  }, [allowRemoteInLocal, isLocalHost, resolvedLocalMunicipalityId, selectedTenantId]);

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
    | "platform"
  >("overview");

  const [logoFiles, setLogoFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.logoUrl ?? "", "logo"));
  const [draftLogoFiles, setDraftLogoFiles] = useState<UploadedFileItem[]>(imageFiles(settings?.logoUrl ?? "", "logo"));
  const [logoRemovalRequested, setLogoRemovalRequested] = useState(false);
  useEffect(() => {
    if (!draftLogoFiles.length) return;
    const file = draftLogoFiles[0];
    console.log("[LogoSelect] Arquivo selecionado", {
      name: file.fileName,
      sizeLabel: file.sizeLabel,
      mimeType: file.mimeType,
      previewUrl: file.previewUrl,
    });
  }, [draftLogoFiles]);
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
  const logoSavingTimeoutRef = useRef<number | null>(null);
  const [draftMasterHeaderLogoFiles, setDraftMasterHeaderLogoFiles] = useState<UploadedFileItem[]>(
    imageFiles(isRenderablePreviewUrl(masterBranding.logoUrl) ? masterBranding.logoUrl : "", "master-header-logo"),
  );
  const [draftMasterFooterLogoFiles, setDraftMasterFooterLogoFiles] = useState<UploadedFileItem[]>(
    imageFiles(isRenderablePreviewUrl(masterBranding.logoUrl) ? masterBranding.logoUrl : "", "master-footer-logo"),
  );
  const [masterFooterText, setMasterFooterText] = useState(masterBranding.footerText ?? "");
  const [draftMasterHeaderConfig, setDraftMasterHeaderConfig] = useState({
    scale: masterBranding.headerLogoScale ?? masterBranding.logoScale ?? 1,
    offsetX: masterBranding.headerLogoOffsetX ?? masterBranding.logoOffsetX ?? 0,
    offsetY: masterBranding.headerLogoOffsetY ?? masterBranding.logoOffsetY ?? 0,
  });
  const [draftMasterFooterConfig, setDraftMasterFooterConfig] = useState({
    scale: masterBranding.footerLogoScale ?? masterBranding.logoScale ?? 1,
    offsetX: masterBranding.footerLogoOffsetX ?? masterBranding.logoOffsetX ?? 0,
    offsetY: masterBranding.footerLogoOffsetY ?? masterBranding.logoOffsetY ?? 0,
  });
  const [masterHeaderStatus, setMasterHeaderStatus] = useState("");
  const [masterFooterStatus, setMasterFooterStatus] = useState("");
  const [masterLogoSaving, setMasterLogoSaving] = useState<InstitutionalLogoConfigVariant | null>(null);
  const masterHeaderStatusIsSuccess = masterHeaderStatus.toLowerCase().includes("sucesso");
  const masterFooterStatusIsSuccess = masterFooterStatus.toLowerCase().includes("sucesso");
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

  // bundle remoto agora vem do AppBootstrap/MunicipalityProvider

  useEffect(() => {
    getInstitutionSettingsRef.current = getInstitutionSettings;
  }, [getInstitutionSettings]);

  useEffect(() => {
    const nextTenant = availableInstitutions.find((item) => item.id === selectedTenantId) ?? null;
    const nextMappedInstitution = buildTenantFromMunicipalityBundle(
      municipality,
      municipalityBranding,
      municipalitySettings,
      nextTenant,
    );
    const nextSettings =
      buildTenantSettingsFromMunicipality(
        municipality,
        municipalityBranding,
        municipalitySettings,
        getInstitutionSettingsRef.current(selectedTenantId),
      ) ?? getInstitutionSettingsRef.current(selectedTenantId);

    const nextTenantForm = {
      name: nextMappedInstitution?.name ?? "",
      city: nextMappedInstitution?.city ?? "",
      state: nextMappedInstitution?.state ?? "SP",
      status: nextMappedInstitution?.status ?? "implantacao",
      plan: nextMappedInstitution?.plan ?? "Plano institucional",
      subdomain: nextMappedInstitution?.subdomain ?? "",
      primaryColor: nextMappedInstitution?.theme.primary ?? "#0f3557",
      accentColor: nextMappedInstitution?.theme.accent ?? "#178f78",
    };
    setTenantForm((current) => (shallowEqualObject(current, nextTenantForm) ? current : nextTenantForm));

    const nextSettingsForm = {
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
    };
    setSettingsForm((current) => (shallowEqualObject(current, nextSettingsForm) ? current : nextSettingsForm));

    const nextLogoFiles = imageFiles(nextSettings?.logoUrl ?? "", "logo");
    setLogoFiles((current) => (sameFileList(current, nextLogoFiles) ? current : nextLogoFiles));
    setDraftLogoFiles((current) => (sameFileList(current, nextLogoFiles) ? current : nextLogoFiles));

    const nextHeaderConfig = {
      scale: nextSettings?.headerLogoScale ?? nextSettings?.logoScale ?? 1,
      offsetX: nextSettings?.headerLogoOffsetX ?? nextSettings?.logoOffsetX ?? 0,
      offsetY: nextSettings?.headerLogoOffsetY ?? nextSettings?.logoOffsetY ?? 0,
    };
    setDraftHeaderLogoConfig((current) =>
      shallowEqualObject(current, nextHeaderConfig) ? current : nextHeaderConfig,
    );

    const nextFooterConfig = {
      scale: nextSettings?.footerLogoScale ?? nextSettings?.logoScale ?? 1,
      offsetX: nextSettings?.footerLogoOffsetX ?? nextSettings?.logoOffsetX ?? 0,
      offsetY: nextSettings?.footerLogoOffsetY ?? nextSettings?.logoOffsetY ?? 0,
    };
    setDraftFooterLogoConfig((current) =>
      shallowEqualObject(current, nextFooterConfig) ? current : nextFooterConfig,
    );

    const nextBrasaoFiles = imageFiles(nextSettings?.brasaoUrl ?? "", "brasao");
    const nextBandeiraFiles = imageFiles(nextSettings?.bandeiraUrl ?? "", "bandeira");
    const nextHeroFiles = imageFiles(nextSettings?.imagemHeroUrl ?? "", "imagem institucional");
    setBrasaoFiles((current) => (sameFileList(current, nextBrasaoFiles) ? current : nextBrasaoFiles));
    setBandeiraFiles((current) => (sameFileList(current, nextBandeiraFiles) ? current : nextBandeiraFiles));
    setHeroFiles((current) => (sameFileList(current, nextHeroFiles) ? current : nextHeroFiles));

    const nextPlanoDiretorFiles = nextSettings?.planoDiretorArquivoUrl
      ? [{ id: "plano-diretor", fileName: nextSettings.planoDiretorArquivoNome || "plano-diretor.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: nextSettings.planoDiretorArquivoUrl }]
      : [];
    const nextUsoSoloFiles = nextSettings?.usoSoloArquivoUrl
      ? [{ id: "uso-solo", fileName: nextSettings.usoSoloArquivoNome || "uso-solo.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: nextSettings.usoSoloArquivoUrl }]
      : [];
    const nextLeisFiles = nextSettings?.leisArquivoUrl
      ? [{ id: "leis-complementares", fileName: nextSettings.leisArquivoNome || "leis-complementares.pdf", mimeType: "application/pdf", sizeLabel: "arquivo salvo", previewUrl: nextSettings.leisArquivoUrl }]
      : [];
    setPlanoDiretorFiles((current) =>
      sameFileList(current, nextPlanoDiretorFiles) ? current : nextPlanoDiretorFiles,
    );
    setUsoSoloFiles((current) => (sameFileList(current, nextUsoSoloFiles) ? current : nextUsoSoloFiles));
    setLeisFiles((current) => (sameFileList(current, nextLeisFiles) ? current : nextLeisFiles));
  }, [availableInstitutions, selectedTenantId]);

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

  const updateMasterLogoFrame =
    (variant: InstitutionalLogoConfigVariant) =>
    ({ scale, offsetX, offsetY }: { scale: number; offsetX: number; offsetY: number }) => {
      const next = { scale, offsetX, offsetY };
      if (variant === "footer") {
        setDraftMasterFooterConfig(next);
        return;
      }
      setDraftMasterHeaderConfig(next);
    };

  const masterHeaderPreviewUrl = useMemo(() => {
    const url = draftMasterHeaderLogoFiles[0]?.previewUrl ?? "";
    return isRenderablePreviewUrl(url) ? url : "";
  }, [draftMasterHeaderLogoFiles]);
  const masterFooterPreviewUrl = useMemo(() => {
    const url = draftMasterFooterLogoFiles[0]?.previewUrl ?? "";
    return isRenderablePreviewUrl(url) ? url : "";
  }, [draftMasterFooterLogoFiles]);
  const masterHeaderActiveUrl = masterHeaderPreviewUrl || masterHeaderPersistedUrl;
  const masterFooterActiveUrl = masterFooterPreviewUrl || masterFooterPersistedUrl;

  const previewMasterHeaderBranding = useMemo(() => {
    const draftLogoUrl = masterHeaderActiveUrl || "";
    const nextState = updateMasterBranding(masterBranding, {
      logoUrl: draftLogoUrl,
      logoAlt: "Logo institucional do SIGAPRO",
      footerText: masterFooterText,
      headerLogoScale: draftMasterHeaderConfig.scale,
      headerLogoOffsetX: draftMasterHeaderConfig.offsetX,
      headerLogoOffsetY: draftMasterHeaderConfig.offsetY,
      footerLogoScale: draftMasterFooterConfig.scale,
      footerLogoOffsetX: draftMasterFooterConfig.offsetX,
      footerLogoOffsetY: draftMasterFooterConfig.offsetY,
    });
    return getMasterInstitutionBranding(nextState, "header");
  }, [
    draftMasterFooterConfig,
    draftMasterHeaderConfig,
    masterBranding,
    masterFooterText,
    masterHeaderActiveUrl,
  ]);

  const previewMasterFooterBranding = useMemo(() => {
    const draftLogoUrl = masterFooterActiveUrl || "";
    const nextState = updateMasterBranding(masterBranding, {
      logoUrl: draftLogoUrl,
      logoAlt: "Logo institucional do SIGAPRO",
      footerText: masterFooterText,
      headerLogoScale: draftMasterHeaderConfig.scale,
      headerLogoOffsetX: draftMasterHeaderConfig.offsetX,
      headerLogoOffsetY: draftMasterHeaderConfig.offsetY,
      footerLogoScale: draftMasterFooterConfig.scale,
      footerLogoOffsetX: draftMasterFooterConfig.offsetX,
      footerLogoOffsetY: draftMasterFooterConfig.offsetY,
    });
    return getMasterInstitutionBranding(nextState, "footer");
  }, [
    draftMasterFooterConfig,
    draftMasterHeaderConfig,
    masterBranding,
    masterFooterText,
    masterFooterActiveUrl,
  ]);

  useEffect(() => {
    if (!isMasterRole) return;
    console.log("[MasterHeaderPreview] src", {
      persistedUrl: platformBranding?.headerLogoUrl,
      objectKey: platformBranding?.headerLogoObjectKey,
      previewUrl: masterHeaderPreviewUrl,
      finalSrc: previewMasterHeaderBranding.logoUrl,
    });
    console.log("[MasterFooterPreview] src", {
      persistedUrl: platformBranding?.footerLogoUrl,
      objectKey: platformBranding?.footerLogoObjectKey,
      previewUrl: masterFooterPreviewUrl,
      finalSrc: previewMasterFooterBranding.logoUrl,
    });
    console.log("[ProfilePreviewReference] Perfil usado como referencia de preview do Master");
    console.log("[LogoRender] master previews atualizados", {
      headerSrc: previewMasterHeaderBranding.logoUrl,
      footerSrc: previewMasterFooterBranding.logoUrl,
    });
  }, [
    isMasterRole,
    masterFooterPreviewUrl,
    masterHeaderPreviewUrl,
    platformBranding?.footerLogoObjectKey,
    platformBranding?.footerLogoUrl,
    platformBranding?.headerLogoObjectKey,
    platformBranding?.headerLogoUrl,
    previewMasterFooterBranding.logoUrl,
    previewMasterHeaderBranding.logoUrl,
  ]);

  useEffect(() => {
    if (!isMasterRole) return;
    let active = true;
    const loadRemote = async () => {
      try {
        const remote = await loadPlatformBranding();
        console.log("[BrandingLoad] platform_branding carregado", { remote });
        if (active) setPlatformBranding(remote);
      } catch {
        console.log("[BrandingLoad] platform_branding falhou, retornando null");
        if (active) setPlatformBranding(null);
      }
    };
    void loadRemote();
    return () => {
      active = false;
    };
  }, [isMasterRole]);

  useEffect(() => {
    if (!isMasterRole || activeSettingsView !== "platform") return;
    console.log("[LayoutOverflow] Master branding pronto para renderização");
  }, [activeSettingsView, isMasterRole]);

  useEffect(() => {
    if (!isMasterRole) {
      platformBrandingLoadedRef.current = false;
      return;
    }
    if (platformBrandingLoadedRef.current) return;
    platformBrandingLoadedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        console.log("[BrandingLoad] Carregando branding master (platform_branding)");
        const remote = await loadPlatformBranding();
        if (!cancelled) {
          setPlatformBranding(remote);
        }
      } catch (error) {
        console.warn("[BrandingLoad] Falha ao carregar branding master", { error });
        if (!cancelled) {
          setPlatformBranding(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMasterRole]);

  useEffect(() => {
    if (!isMasterRole) return;
    const bucket =
      (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) || "sigapro-logos";
    const allowPublicFallback =
      String(import.meta.env.VITE_R2_PUBLIC_FALLBACK || "").toLowerCase() === "true";
    const resolveUrl = async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("http")) {
        const extractedKey = getObjectKeyFromPublicUrl(trimmed);
        if (extractedKey) {
          try {
            return await getSignedUrlForObject({ bucket, objectKey: extractedKey });
          } catch {
            return allowPublicFallback ? trimmed : "";
          }
        }
        return allowPublicFallback ? trimmed : "";
      }
      try {
        return await getSignedUrlForObject({ bucket, objectKey: trimmed });
      } catch {
        if (!allowPublicFallback) return "";
        const publicUrl = getPublicUrl(trimmed);
        return publicUrl || "";
      }
    };

    const headerRaw =
      platformBranding?.headerLogoObjectKey || platformBranding?.headerLogoUrl || "";
    const footerRaw =
      platformBranding?.footerLogoObjectKey || platformBranding?.footerLogoUrl || "";

    const hasLocalHeader = Boolean(draftMasterHeaderLogoFiles[0]?.file);
    const hasLocalFooter = Boolean(draftMasterFooterLogoFiles[0]?.file);
    const currentHeaderPreview = draftMasterHeaderLogoFiles[0]?.previewUrl ?? "";
    const currentFooterPreview = draftMasterFooterLogoFiles[0]?.previewUrl ?? "";

    void resolveUrl(headerRaw).then((url) => {
      if (url && url !== masterHeaderPersistedUrl) {
        setMasterHeaderPersistedUrl(url);
      }
      if (!hasLocalHeader && !isRenderablePreviewUrl(currentHeaderPreview) && url) {
        setDraftMasterHeaderLogoFiles(imageFiles(url, "master-header-logo"));
      }
    });

    void resolveUrl(footerRaw).then((url) => {
      if (url && url !== masterFooterPersistedUrl) {
        setMasterFooterPersistedUrl(url);
      }
      if (!hasLocalFooter && !isRenderablePreviewUrl(currentFooterPreview) && url) {
        setDraftMasterFooterLogoFiles(imageFiles(url, "master-footer-logo"));
      }
    });
  }, [
    isMasterRole,
    platformBranding,
    draftMasterHeaderLogoFiles,
    draftMasterFooterLogoFiles,
    masterHeaderPersistedUrl,
    masterFooterPersistedUrl,
  ]);

  const handleConfirmMasterLogo = async (variant: InstitutionalLogoConfigVariant) => {
    try {
      console.log("[PlatformBranding] Clique em confirmar logo", { variant });
      setMasterHeaderStatus("");
      setMasterFooterStatus("");
      setMasterLogoSaving(variant);
      if (variant === "footer") {
        setMasterFooterStatus("Aplicando logo do rodapé da plataforma...");
      } else {
        setMasterHeaderStatus("Aplicando logo do cabeçalho da plataforma...");
      }
      const draftFiles =
        variant === "footer" ? draftMasterFooterLogoFiles : draftMasterHeaderLogoFiles;
      let logoUrl = draftFiles[0]?.previewUrl ?? masterBranding.logoUrl ?? "";
      let nextObjectKey = "";
      let nextFileName = "";
      let nextMimeType = "";
      let nextPublicUrl = "";

      if (!logoUrl) {
        const message = "Envie o logo institucional da plataforma para continuar.";
        if (variant === "footer") {
          setMasterFooterStatus(message);
        } else {
          setMasterHeaderStatus(message);
        }
        return;
      }

      if (logoUrl.startsWith("blob:") && !draftFiles[0]?.file) {
        const message = "Reenvie o arquivo do logo para salvar no banco.";
        if (variant === "footer") {
          setMasterFooterStatus(message);
        } else {
          setMasterHeaderStatus(message);
        }
        return;
      }

      if (draftFiles[0]?.file) {
        const assetKey = variant === "footer" ? "footer-logo" : "header-logo";
        const uploaded = await withTimeoutLogged(
          "upload master",
          uploadPlatformBrandingAsset({
            file: draftFiles[0].file,
            assetKey,
          }),
          30000,
        );
        const allowPublicFallback =
          String(import.meta.env.VITE_R2_PUBLIC_FALLBACK || "").toLowerCase() === "true";
        if (allowPublicFallback && uploaded.publicUrl) {
          logoUrl = uploaded.publicUrl;
        }
        nextObjectKey = uploaded.objectKey;
        nextFileName = uploaded.fileName;
        nextMimeType = uploaded.mimeType;
        nextPublicUrl = allowPublicFallback ? uploaded.publicUrl : "";
        console.log("[AssetUpload] Master logo salvo", { variant, objectKey: uploaded.objectKey });
      }

      let existingPlatformBranding = null as Awaited<ReturnType<typeof loadPlatformBranding>> | null;
      if (!nextObjectKey) {
        try {
          existingPlatformBranding = await loadPlatformBranding();
        } catch {
          existingPlatformBranding = null;
        }
      }

      const existingObjectKey =
        existingPlatformBranding && variant === "header"
          ? existingPlatformBranding.headerLogoObjectKey || ""
          : existingPlatformBranding?.footerLogoObjectKey || "";
      const existingFileName =
        existingPlatformBranding && variant === "header"
          ? existingPlatformBranding.headerLogoFileName || ""
          : existingPlatformBranding?.footerLogoFileName || "";
      const existingMimeType =
        existingPlatformBranding && variant === "header"
          ? existingPlatformBranding.headerLogoMimeType || ""
          : existingPlatformBranding?.footerLogoMimeType || "";
      const existingPublicUrl =
        existingPlatformBranding && variant === "header"
          ? existingPlatformBranding.headerLogoUrl || ""
          : existingPlatformBranding?.footerLogoUrl || "";

      if (!nextPublicUrl) {
        nextPublicUrl = existingPublicUrl;
      }

      const finalObjectKey = nextObjectKey || existingObjectKey;
      if (!finalObjectKey) {
        throw new Error("Envie o arquivo do logo da plataforma para concluir.");
      }

      console.log("[BrandingScope] Master save", { variant, scopeType: "platform" });
      await withTimeoutLogged(
        "platform_branding upsert",
        savePlatformBranding({
          variant,
          objectKey: finalObjectKey,
          fileName: nextFileName || draftFiles[0]?.file?.name || existingFileName || "",
          mimeType: nextMimeType || draftFiles[0]?.file?.type || existingMimeType || "application/octet-stream",
          publicUrl: nextPublicUrl || "",
          updatedBy: brandingUpdatedBy,
        }),
        20000,
      );

      if (!nextPublicUrl) {
        try {
          nextPublicUrl = await getSignedUrlForObject({
            bucket:
              (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
              "sigapro-logos",
            objectKey: finalObjectKey,
          });
        } catch {
          nextPublicUrl = "";
        }
      }

      if (isRenderablePreviewUrl(nextPublicUrl)) {
        if (variant === "footer") {
          setMasterFooterPersistedUrl(nextPublicUrl);
        } else {
          setMasterHeaderPersistedUrl(nextPublicUrl);
        }
      }

      try {
        const remote = await withTimeoutLogged("reload platform_branding", loadPlatformBranding(), 15000);
        setPlatformBranding(remote);
      } catch {
        setPlatformBranding(existingPlatformBranding);
      }

      const persistedUrl = nextPublicUrl || (logoUrl.startsWith("http") ? logoUrl : "");
      const updated = updateMasterBranding(masterBranding, {
        logoUrl: persistedUrl,
        logoAlt: "Logo institucional do SIGAPRO",
        logoUpdatedAt: new Date().toISOString(),
        logoUpdatedBy: brandingUpdatedBy,
        footerText: masterFooterText,
        headerLogoScale: draftMasterHeaderConfig.scale,
        headerLogoOffsetX: draftMasterHeaderConfig.offsetX,
        headerLogoOffsetY: draftMasterHeaderConfig.offsetY,
        footerLogoScale: draftMasterFooterConfig.scale,
        footerLogoOffsetX: draftMasterFooterConfig.offsetX,
        footerLogoOffsetY: draftMasterFooterConfig.offsetY,
      });

      setMasterBranding(updated);
      const nextLogoPreview =
        (isRenderablePreviewUrl(logoUrl) ? logoUrl : "") ||
        nextPublicUrl ||
        updated.logoUrl ||
        "";
      // Mantemos o preview local apenas quando houver URL renderizável.
      if (isRenderablePreviewUrl(nextLogoPreview)) {
        if (variant === "footer") {
          setDraftMasterFooterLogoFiles(imageFiles(nextLogoPreview, "master-footer-logo"));
        } else {
          setDraftMasterHeaderLogoFiles(imageFiles(nextLogoPreview, "master-header-logo"));
        }
      }
      saveMasterBranding(updated);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sigapro-master-branding-updated"));
      }

      if (variant === "footer") {
        setMasterFooterStatus("Logo do rodapé da plataforma atualizado com sucesso.");
      } else {
        setMasterHeaderStatus("Logo do cabeçalho da plataforma atualizado com sucesso.");
      }
    } catch (error) {
      const message = resolveBrandingErrorMessage(error, "Falha ao aplicar o logo institucional da plataforma.");
      if (variant === "footer") {
        setMasterFooterStatus(message);
      } else {
        setMasterHeaderStatus(message);
      }
    } finally {
      setMasterLogoSaving(null);
    }
  };

  useEffect(() => {
    setAccountForm((current) => ({
      ...current,
      currentEmail: authenticatedEmail ?? session.email,
      nextEmail: authenticatedEmail ?? session.email,
    }));
  }, [authenticatedEmail, session.email]);

  useEffect(() => {
    setDraftMasterHeaderConfig({
      scale: masterBranding.headerLogoScale ?? masterBranding.logoScale ?? 1,
      offsetX: masterBranding.headerLogoOffsetX ?? masterBranding.logoOffsetX ?? 0,
      offsetY: masterBranding.headerLogoOffsetY ?? masterBranding.logoOffsetY ?? 0,
    });
    setDraftMasterFooterConfig({
      scale: masterBranding.footerLogoScale ?? masterBranding.logoScale ?? 1,
      offsetX: masterBranding.footerLogoOffsetX ?? masterBranding.logoOffsetX ?? 0,
      offsetY: masterBranding.footerLogoOffsetY ?? masterBranding.logoOffsetY ?? 0,
    });
    setMasterFooterText(masterBranding.footerText ?? "");
  }, [masterBranding]);

  const setAccountField = (field: keyof typeof accountForm, value: string) => {
    setAccountForm((current) => ({ ...current, [field]: value }));
  };

  const ensureSelectedTenant = (subdomainOverride?: string) => {
    const normalizedSubdomain = normalizeSubdomainInput(
      subdomainOverride ?? tenantForm.subdomain ?? tenantForm.city ?? tenantForm.name,
    );
    return upsertInstitution({
      institutionId: selectedTenantId || undefined,
      name: tenantForm.name,
      city: tenantForm.city,
      state: tenantForm.state,
      status: tenantForm.status as "ativo" | "implantacao" | "suspenso",
      plan: tenantForm.plan,
      subdomain: normalizedSubdomain,
      primaryColor: tenantForm.primaryColor,
      accentColor: tenantForm.accentColor,
    });
  };

  const handleConfirmLogo = async (variant: InstitutionalLogoConfigVariant) => {
    console.log("[SIGAPRO][LogoSelect] Confirmar logo: clique", { variant });
    if (isMasterRole) {
      console.warn("[SIGAPRO][LogoSelect] Master detectado, bloqueando branding municipal", { variant });
      const message = "Você está no ambiente Master. Edite o logo na seção Plataforma.";
      if (variant === "footer") {
        setFooterLogoStatus(message);
      } else {
        setHeaderLogoStatus(message);
      }
      return;
    }

    if (variant === "footer") {
      setFooterLogoStatus("");
    } else {
      setHeaderLogoStatus("");
    }
    setLogoSaving(variant);

    const setStepStatus = (message: string) => {
      console.log("[SIGAPRO][LogoPreview] Confirmar logo: etapa", { variant, message });
      if (variant === "footer") {
        setFooterLogoStatus(message);
      } else {
        setHeaderLogoStatus(message);
      }
    };

    try {
      // ------------------------------------------------------------------
      // 1. Resolver prefeitura
      // ------------------------------------------------------------------
      setStepStatus("Localizando prefeitura...");

      const normalizedSubdomain = normalizeSubdomainInput(
        tenantContext.subdomain ??
          tenantForm.subdomain ??
          settingsForm.linkPortalCliente ??
          settingsForm.site ??
          tenantForm.city ??
          tenantForm.name,
      );

      console.log("[SIGAPRO][LogoPreview] Confirmar logo: resolucao iniciada", {
        variant,
        scopeId,
        selectedTenantId,
        sessionTenantId: session.tenantId,
        municipalityId: municipality?.id,
        remoteMunicipalityId: municipality?.id,
        normalizedSubdomain,
        hostname: tenantContext.hostname,
        isLocalhost: tenantContext.isLocalhost,
        institutionsCount: availableInstitutions.length,
      });

      let resolvedTenantId = await resolveMunicipalityForBranding(
        normalizedSubdomain,
      );

      if (!resolvedTenantId && isMasterRole && hasSupabaseEnv) {
        if (!tenantForm.name.trim()) {
          throw new Error("Informe o nome institucional antes de aplicar o logo.");
        }
        if (!normalizedSubdomain) {
          throw new Error("Informe um subdomínio válido para aplicar o logo.");
        }
        const remote = await withTimeout(
          upsertRemoteInstitution({
            tenantId: selectedTenantId || undefined,
            name: tenantForm.name,
            city: tenantForm.city,
            state: tenantForm.state,
            status: tenantForm.status as "ativo" | "implantacao" | "suspenso",
            subdomain: normalizedSubdomain,
            cnpj: settingsForm.cnpj || "",
            primaryColor: tenantForm.primaryColor,
            accentColor: tenantForm.accentColor,
            secretariat: settingsForm.secretariaResponsavel || "",
          }),
          "Falha ao registrar a prefeitura no Supabase.",
          15000,
        );
        resolvedTenantId = resolveValidScopeId(remote?.id);
        console.log("[SIGAPRO] Confirmar logo: prefeitura criada/atualizada", {
          normalizedSubdomain,
          resolvedTenantId,
        });
        if (resolvedTenantId) {
          upsertInstitution({
            institutionId: resolvedTenantId,
            name: tenantForm.name,
            city: tenantForm.city,
            state: tenantForm.state,
            status: tenantForm.status as "ativo" | "implantacao" | "suspenso",
            plan: tenantForm.plan,
            subdomain: normalizedSubdomain,
            primaryColor: tenantForm.primaryColor,
            accentColor: tenantForm.accentColor,
          });
          setSelectedTenantId(resolvedTenantId);
        }
      }

      if (!resolvedTenantId) {
        throw new Error(
          "Não foi possível localizar a prefeitura atual. " +
            "Verifique o subdomínio ou recarregue a página.",
        );
      }

      console.log("[SIGAPRO] Confirmar logo: municipio resolvido", {
        resolvedTenantId,
      });

      if (resolvedTenantId && resolvedTenantId !== selectedTenantId) {
        setSelectedTenantId(resolvedTenantId);
      }

      const savedTenant = { id: resolvedTenantId };

      // ------------------------------------------------------------------
      // 2. Definir URL e metadados do logo
      // ------------------------------------------------------------------
      let logoUrl = logoRemovalRequested
        ? ""
        : draftLogoFiles[0]?.previewUrl ?? settings?.logoUrl ?? "";

    // URLs específicas por variante — inicialmente iguais ao genérico,
    // serão sobrescritas após upload ou remoção
    let variantLogoUrl = logoUrl;
    let persistedVariantUrl = "";

      let logoMeta: {
        bucket: string;
        objectKey: string;
        fileName: string;
        mimeType: string;
        fileSize: number;
      } | null = null;

      const draftConfig =
        variant === "footer" ? draftFooterLogoConfig : draftHeaderLogoConfig;
      const activeBranding =
        variant === "footer" ? footerBranding : headerBranding;

      // ------------------------------------------------------------------
      // 3. Upload para o R2 (apenas se houver arquivo novo)
      // ------------------------------------------------------------------
    if (hasSupabaseEnv && draftLogoFiles[0]?.file) {
      setStepStatus("Enviando arquivo para o storage...");

      // Chave de asset por variante para path separado no R2
      const assetKey = variant === "footer" ? "footer-logo" : "header-logo";
      console.log("[AssetUpload] Preparando upload", {
        variant,
        assetKey,
        municipalityId: savedTenant.id,
      });

      const uploaded = await withTimeoutLogged(
        "upload municipio logo",
        uploadInstitutionalBrandingAsset({
          tenantId: savedTenant.id,
          subdomain: normalizeSubdomainInput(
            tenantForm.subdomain ?? tenantForm.city ?? tenantForm.name,
          ),
          file: draftLogoFiles[0].file,
          assetKey,
        }),
        30000,
      );

      const bucket =
        (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
        "sigapro-logos";
      let signedUrl = "";
      try {
        signedUrl = await getSignedUrlForObject({
          bucket,
          objectKey: uploaded.objectKey,
        });
      } catch (error) {
        console.warn("[SIGAPRO][LogoRender] Confirmar logo: falha ao assinar URL", error);
      }

      variantLogoUrl = signedUrl || uploaded.publicUrl;
      persistedVariantUrl = publicBase ? uploaded.publicUrl : "";
      // logoUrl genérico também é atualizado para manter retrocompat
      logoUrl = variantLogoUrl;

      logoMeta = {
        bucket: uploaded.bucket,
        objectKey: uploaded.objectKey,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
      };

      console.log("[SIGAPRO][LogoUpload] Confirmar logo: upload concluido", {
        variant,
        assetKey,
        variantLogoUrl,
        logoMeta,
      });
      console.log("[AssetUpload] object_key gerado", {
        variant,
        objectKey: uploaded.objectKey,
      });
      } else if (hasSupabaseEnv && logoUrl.startsWith("blob:")) {
        throw new Error(
          "Envie o arquivo do logo para concluir o salvamento no Supabase.",
        );
    } else if (hasSupabaseEnv && logoRemovalRequested) {
      // Remoção do logo no R2
      const existingUrl =
        variant === "footer"
          ? (settings as any)?.footerLogoUrl || settings?.logoUrl || ""
          : (settings as any)?.headerLogoUrl || settings?.logoUrl || "";
        const objectKey = getObjectKeyFromPublicUrl(existingUrl);
        const bucket =
          (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
          "sigapro-logos";
        if (objectKey) {
          await withTimeout(
            deleteFile({ bucket, objectKey }),
            "Falha ao remover o logo do storage.",
            15000,
          );
        }
      variantLogoUrl = "";
      persistedVariantUrl = "";
      logoUrl = "";
    } else {
      // Sem arquivo novo, mas pode ter mudado só o enquadramento —
      // preserva a URL já salva para essa variante
      variantLogoUrl =
        variant === "footer"
          ? (settings as any)?.footerLogoUrl || settings?.logoUrl || logoUrl
          : (settings as any)?.headerLogoUrl || settings?.logoUrl || logoUrl;
      persistedVariantUrl =
        publicBase && variantLogoUrl.startsWith(publicBase) ? variantLogoUrl : "";
    }

      // ------------------------------------------------------------------
      // 4. Montar nextSettings com URLs separadas por variante
      // ------------------------------------------------------------------
      const nextSettings = updateInstitutionBranding(
        {
          ...(settings ?? settingsForm),
          ...settingsForm,
          tenantId: savedTenant.id,
          institutionId: savedTenant.id,
          logoUrl,
          brasaoUrl: brasaoFiles[0]?.previewUrl ?? settings?.brasaoUrl ?? "",
          bandeiraUrl:
            bandeiraFiles[0]?.previewUrl ?? settings?.bandeiraUrl ?? "",
          imagemHeroUrl:
            heroFiles[0]?.previewUrl ?? settings?.imagemHeroUrl ?? "",
          planoDiretorArquivoNome:
            planoDiretorFiles[0]?.fileName ??
            settings?.planoDiretorArquivoNome ??
            "",
          planoDiretorArquivoUrl:
            planoDiretorFiles[0]?.previewUrl ??
            settings?.planoDiretorArquivoUrl ??
            "",
          usoSoloArquivoNome:
            usoSoloFiles[0]?.fileName ?? settings?.usoSoloArquivoNome ?? "",
          usoSoloArquivoUrl:
            usoSoloFiles[0]?.previewUrl ?? settings?.usoSoloArquivoUrl ?? "",
          leisArquivoNome:
            leisFiles[0]?.fileName ?? settings?.leisArquivoNome ?? "",
          leisArquivoUrl:
            leisFiles[0]?.previewUrl ?? settings?.leisArquivoUrl ?? "",
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
          logoStorageProvider: logoRemovalRequested
            ? undefined
            : logoMeta
              ? "r2"
              : settings?.logoStorageProvider,
          logoBucket: logoRemovalRequested
            ? undefined
            : logoMeta?.bucket ?? settings?.logoBucket,
          logoObjectKey: logoRemovalRequested
            ? undefined
            : logoMeta?.objectKey ?? settings?.logoObjectKey,
          logoFileName: logoRemovalRequested
            ? undefined
            : logoMeta?.fileName ?? settings?.logoFileName,
          logoMimeType: logoRemovalRequested
            ? undefined
            : logoMeta?.mimeType ?? settings?.logoMimeType,
          logoFileSize: logoRemovalRequested
            ? undefined
            : logoMeta?.fileSize ?? settings?.logoFileSize,
        },
        {
          tenantId: savedTenant.id,
          logoUrl: variantLogoUrl,
          logoScale: draftConfig.scale,
          logoOffsetX: draftConfig.offsetX,
          logoOffsetY: draftConfig.offsetY,
          logoAlt: tenantForm.name
            ? `Logo institucional de ${tenantForm.name}`
            : activeBranding.logoAlt,
          logoUpdatedAt: new Date().toISOString(),
          logoUpdatedBy: brandingUpdatedBy,
          logoFrameMode: "soft-square",
          logoFitMode: "contain",
        },
        variant,
        ) as TenantSettings & {
          headerLogoUrl?: string;
          footerLogoUrl?: string;
          headerLogoObjectKey?: string;
          footerLogoObjectKey?: string;
          headerLogoFileName?: string;
          footerLogoFileName?: string;
          headerLogoMimeType?: string;
          footerLogoMimeType?: string;
          institutionId?: string;
        };

      // Injeta as URLs separadas para o saveRemoteInstitutionSettings
    if (variant === "header") {
      nextSettings.headerLogoUrl = variantLogoUrl;
      nextSettings.headerLogoObjectKey = logoRemovalRequested
        ? ""
        : logoMeta?.objectKey ?? settings?.logoObjectKey ?? "";
      nextSettings.headerLogoFileName = logoRemovalRequested
        ? ""
        : logoMeta?.fileName ?? (settings as any)?.headerLogoFileName ?? "";
      nextSettings.headerLogoMimeType = logoRemovalRequested
        ? ""
        : logoMeta?.mimeType ?? (settings as any)?.headerLogoMimeType ?? "";
          // Preserva footer URL existente
          nextSettings.footerLogoUrl =
            (settings as any)?.footerLogoUrl || settings?.logoUrl || "";
          nextSettings.footerLogoObjectKey =
            (settings as any)?.footerLogoObjectKey || settings?.logoObjectKey || "";
          nextSettings.footerLogoFileName =
            (settings as any)?.footerLogoFileName || "";
          nextSettings.footerLogoMimeType =
            (settings as any)?.footerLogoMimeType || "";
    } else {
      nextSettings.footerLogoUrl = variantLogoUrl;
      nextSettings.footerLogoObjectKey = logoRemovalRequested
        ? ""
        : logoMeta?.objectKey ?? settings?.logoObjectKey ?? "";
      nextSettings.footerLogoFileName = logoRemovalRequested
        ? ""
        : logoMeta?.fileName ?? (settings as any)?.footerLogoFileName ?? "";
      nextSettings.footerLogoMimeType = logoRemovalRequested
        ? ""
        : logoMeta?.mimeType ?? (settings as any)?.footerLogoMimeType ?? "";
          // Preserva header URL existente
          nextSettings.headerLogoUrl =
            (settings as any)?.headerLogoUrl || settings?.logoUrl || "";
          nextSettings.headerLogoObjectKey =
            (settings as any)?.headerLogoObjectKey || settings?.logoObjectKey || "";
          nextSettings.headerLogoFileName =
            (settings as any)?.headerLogoFileName || "";
          nextSettings.headerLogoMimeType =
            (settings as any)?.headerLogoMimeType || "";
        }

    nextSettings.tenantId = savedTenant.id;
    nextSettings.institutionId = savedTenant.id;

    const sanitizePersistedUrl = (value?: string) =>
      publicBase && value && value.startsWith(publicBase) ? value : "";

    const nextSettingsForSave = {
      ...nextSettings,
      headerLogoUrl:
        variant === "header"
          ? persistedVariantUrl
          : sanitizePersistedUrl(nextSettings.headerLogoUrl),
      footerLogoUrl:
        variant === "footer"
          ? persistedVariantUrl
          : sanitizePersistedUrl(nextSettings.footerLogoUrl),
    } as typeof nextSettings;

      // ------------------------------------------------------------------
      // 5. Salvar no Supabase
      // ------------------------------------------------------------------
      if (hasSupabaseEnv) {
        setStepStatus("Salvando referência no banco...");

      console.info("[SIGAPRO][BrandingSave] Confirmar logo: salvando no Supabase", {
        tenantId: savedTenant.id,
        variant,
        logoUrl,
        variantLogoUrl,
        persistedVariantUrl,
        headerLogoUrl: nextSettingsForSave.headerLogoUrl,
        footerLogoUrl: nextSettingsForSave.footerLogoUrl,
        logoMeta,
      });

      await withTimeoutLogged(
        "municipality_branding upsert",
        saveRemoteInstitutionSettings(nextSettingsForSave, {
          skipMunicipalityUpdate: true,
          skipMunicipalitySettings: true,
        }),
        20000,
      );
    }

    // ------------------------------------------------------------------
    // 6. Atualizar estado local + revalidar branding global
    // ------------------------------------------------------------------
    try {
      await bootstrap.refreshMunicipalityBundle(savedTenant.id);
    } catch (error) {
      console.warn("[SIGAPRO][BrandingLoad] Falha ao revalidar bundle", error);
    }
      saveInstitutionSettings(nextSettings);
      setSelectedTenantId(savedTenant.id);
      setLogoFiles(imageFiles(nextSettings.logoUrl ?? "", "logo"));
      setDraftLogoFiles(imageFiles(nextSettings.logoUrl ?? "", "logo"));
      setLogoRemovalRequested(false);
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
        setFooterLogoStatus(
          variantLogoUrl
            ? "Logo do rodapé atualizado com sucesso."
            : "Logo do rodapé removido com sucesso.",
        );
      } else {
        setHeaderLogoStatus(
          variantLogoUrl
            ? "Logo do cabeçalho atualizado com sucesso."
            : "Logo do cabeçalho removido com sucesso.",
        );
      }

      console.log("[SIGAPRO] Confirmar logo: concluido", {
        variant,
        variantLogoUrl,
      });
    } catch (error) {
      console.error("[SIGAPRO] Confirmar logo: falha", { variant, error });
      const message = resolveBrandingErrorMessage(
        error,
        "Falha ao aplicar o logo institucional.",
      );
      if (variant === "footer") {
        setFooterLogoStatus(message);
      } else {
        setHeaderLogoStatus(message);
      }
    } finally {
      clearLogoSavingTimeout();
      setLogoSaving(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");

    const normalizedSubdomain = normalizeSubdomainInput(
      tenantForm.subdomain || tenantForm.name || tenantForm.city,
    );
    if (!tenantForm.name.trim()) {
      setStatus("Informe o nome institucional antes de salvar.");
      return;
    }
    if (!normalizedSubdomain) {
      setStatus("Informe um subdomínio válido (somente o nome, sem .sigapro.com.br).");
      return;
    }
    if (tenantForm.subdomain !== normalizedSubdomain) {
      setTenantField("subdomain", normalizedSubdomain);
    }

    const savedTenant = ensureSelectedTenant(normalizedSubdomain);
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

    try {
      if (hasSupabaseEnv) {
        const sanitizePersistedUrl = (value?: string) =>
          publicBase && value && value.startsWith(publicBase) ? value : "";
        const nextSettingsForSave = {
          ...nextSettings,
          headerLogoUrl: sanitizePersistedUrl((nextSettings as any)?.headerLogoUrl),
          footerLogoUrl: sanitizePersistedUrl((nextSettings as any)?.footerLogoUrl),
        } as typeof nextSettings;
        await withTimeout(
          saveRemoteInstitutionSettings(nextSettingsForSave),
          "Tempo limite ao salvar o branding institucional. Verifique a conexao com o Supabase.",
        );
      }

      saveInstitutionSettings(nextSettings);
      setSelectedTenantId(savedTenant.id);
      setStatus("Configurações da prefeitura salvas com sucesso.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar a prefeitura.");
    }
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
                <p className="text-sm text-slate-900">Preferências operacionais</p>
              </div>
              <div className="space-y-3">
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
                <p className="sig-fit-title mt-2 break-all text-sm font-semibold leading-6 text-slate-900">
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
        eyebrow="Identidade visual"
        title="Identidade e operação institucional"
        description="Organize identidade visual, contatos oficiais, prefixos e preferências da Prefeitura."
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
          { value: "branding", label: "Identidade visual", helper: "Logo e identidade" },
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
        <SectionCard title="Identidade visual" description="Organize prefeitura, paleta e ativos institucionais com leitura objetiva." icon={Building2} contentClassName="space-y-5" headerClassName="gap-2 pb-3">
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
                <Textarea
                  value={tenantForm.subdomain}
                  onChange={(event) => setTenantField("subdomain", normalizeSubdomainInput(event.target.value))}
                  placeholder="campolimpo"
                  className="min-h-[54px] resize-none text-[13px] leading-5"
                />
                <p className="text-xs text-slate-500">Use apenas o subdomínio, sem .sigapro.com.br.</p>
              </div>
            </div>

            {/* Tema do layout removido desta tela para manter o padrão institucional. */}

            {!isMasterRole ? (
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
                      <Button type="button" variant="outline" className="rounded-2xl" onClick={handleTestMunicipality}>
                        Testar prefeitura
                      </Button>
                    </div>
                    {diagnosticStatus ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        {diagnosticStatus}
                      </div>
                    ) : null}
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
                          setLogoRemovalRequested(true);
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
                onFilesSelected={(files) => {
                  setDraftLogoFiles(files);
                  if (files.length > 0) {
                    setLogoRemovalRequested(false);
                  }
                }}
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
            ) : (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                Você está no ambiente Master. O branding da prefeitura é editado apenas no escopo da prefeitura.
              </div>
            )}
        </SectionCard>
        </PageMainContent> : null}
        {activeSettingsView === "platform" && isMasterRole ? (
          <PageMainContent className="xl:col-span-12">
            <SectionCard
              title="Administração da plataforma"
              description="Defina a identidade visual exclusiva do ambiente Master."
              icon={MonitorCog}
              contentClassName="space-y-5"
              headerClassName="gap-2 pb-3"
            >
              <div className="grid gap-4">
                  <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fc_100%)] p-5">
                  <div className="flex min-w-0 items-center gap-2 text-slate-950">
                    <ImageIcon className="h-4 w-4 text-slate-700" />
                    <p className="min-w-0 break-words text-sm text-slate-900">Logo institucional da plataforma (Master)</p>
                  </div>
                  <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-500">
                    Configure o logo exibido no cabeçalho e no rodapé do ambiente Master, sem misturar com a Prefeitura.
                  </p>
                  <div className="mt-4 grid min-w-0 gap-6 2xl:grid-cols-[minmax(520px,1.15fr)_minmax(340px,0.85fr)]">
                    <div
                      className="min-w-0 overflow-hidden rounded-[30px] p-6 shadow-[0_24px_52px_rgba(15,42,68,0.16)]"
                      style={{ background: `linear-gradient(135deg, ${masterPrimaryColor} 0%, ${darken(masterPrimaryColor, -6)} 58%, ${darken(masterPrimaryColor, -10)} 100%)` }}
                    >
                      <div
                        className="rounded-[22px] px-5 pb-4 pt-4"
                        style={{ background: `linear-gradient(90deg, ${darken(masterPrimaryColor, 28)} 0%, ${darken(masterPrimaryColor, 18)} 46%, ${darken(masterPrimaryColor, 10)} 100%)` }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#d4e7f7]">Visual institucional</p>
                        <p className="mt-2 text-sm leading-6 text-white md:text-[15px]">Cabeçalho Master</p>
                      </div>
                      <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center xl:grid-cols-[240px_minmax(0,1fr)]">
                        <InstitutionalLogo
                          branding={previewMasterHeaderBranding}
                          fallbackLabel="SIGAPRO"
                          variant="header"
                          className="mx-auto shrink-0 lg:mx-0"
                        />
                        <div className="min-w-0 flex-1 text-white">
                          <p className="text-balance break-words text-[15px] font-semibold leading-tight text-white md:text-[17px] xl:text-[18px]">
                            SIGAPRO
                          </p>
                          <p className="mt-3 max-w-[30ch] break-words text-sm font-normal leading-6 md:text-sm" style={{ color: masterAccentColor }}>
                            Plataforma institucional
                          </p>
                          <div className="mt-4 inline-flex max-w-full rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-normal leading-5 text-white shadow-[0_12px_26px_rgba(2,6,23,0.16)]">
                            <span className="truncate">Ambiente Master</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-3">
                      {isRenderablePreviewUrl(masterHeaderActiveUrl) ? (
                        <ImageFrameEditor
                          imageUrl={masterHeaderActiveUrl}
                          scale={draftMasterHeaderConfig.scale}
                          offsetX={draftMasterHeaderConfig.offsetX}
                          offsetY={draftMasterHeaderConfig.offsetY}
                          onChange={updateMasterLogoFrame("header")}
                          label="Enquadramento do cabeçalho"
                          hint="Arraste a marca dentro do quadro e use o scroll para posicionar o logo do cabeçalho Master."
                          frameClassName="justify-start"
                          viewportClassName="h-[104px] w-[176px] rounded-[18px]"
                          wrapperClassName="border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                          Envie o logo do SIGAPRO para liberar o ajuste do cabeçalho Master.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => setDraftMasterHeaderConfig({ scale: 1, offsetX: 0, offsetY: 0 })}
                        >
                          Restaurar enquadramento
                        </Button>
                        <Button
                          type="button"
                          className="rounded-2xl bg-slate-950 hover:bg-slate-900"
                          onClick={() => handleConfirmMasterLogo("header")}
                          disabled={masterLogoSaving === "header"}
                        >
                          {masterLogoSaving === "header" ? "Aplicando..." : "Confirmar logo"}
                        </Button>
                      </div>
                      {masterHeaderStatus ? (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            masterHeaderStatusIsSuccess
                              ? "border border-emerald-200 bg-emerald-50/90 text-emerald-700"
                              : "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {masterHeaderStatus}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
                    <div
                      className="min-w-0 rounded-[28px] p-5 shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${darken(masterPrimaryColor, 2)} 0%, ${masterPrimaryColor} 48%, ${darken(masterPrimaryColor, 10)} 100%)` }}
                    >
                      <div className="flex items-center justify-center py-3">
                        <InstitutionalLogo branding={previewMasterFooterBranding} fallbackLabel="SIGAPRO" variant="footer" />
                      </div>
                    </div>
                    <div className="min-w-0 space-y-3">
                      {isRenderablePreviewUrl(masterFooterActiveUrl) ? (
                        <ImageFrameEditor
                          imageUrl={masterFooterActiveUrl}
                          scale={draftMasterFooterConfig.scale}
                          offsetX={draftMasterFooterConfig.offsetX}
                          offsetY={draftMasterFooterConfig.offsetY}
                          onChange={updateMasterLogoFrame("footer")}
                          label="Enquadramento do rodapé"
                          hint="Ajuste o logo especificamente para o rodapé Master, sem afetar o cabeçalho."
                          frameClassName="justify-start"
                          viewportClassName="h-[138px] w-[140px] rounded-[18px]"
                          wrapperClassName="border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                          Envie o logo do SIGAPRO para liberar o ajuste do rodapé Master.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() => setDraftMasterFooterConfig({ scale: 1, offsetX: 0, offsetY: 0 })}
                        >
                          Restaurar enquadramento
                        </Button>
                        <Button
                          type="button"
                          className="rounded-2xl bg-slate-950 hover:bg-slate-900"
                          onClick={() => handleConfirmMasterLogo("footer")}
                          disabled={masterLogoSaving === "footer"}
                        >
                          {masterLogoSaving === "footer" ? "Aplicando..." : "Confirmar logo"}
                        </Button>
                      </div>
                      {masterFooterStatus ? (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            masterFooterStatusIsSuccess
                              ? "border border-emerald-200 bg-emerald-50/90 text-emerald-700"
                              : "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {masterFooterStatus}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <FileDropZone
                        title="Logo do cabeçalho Master"
                        description="Logo usado no cabeçalho institucional do SIGAPRO."
                        accept="image/*"
                        multiple={false}
                        allowPreview
                        files={draftMasterHeaderLogoFiles}
                        onFilesSelected={setDraftMasterHeaderLogoFiles}
                      />
                      <FileDropZone
                        title="Logo do rodapé Master"
                        description="Logo usado no rodapé institucional do SIGAPRO."
                        accept="image/*"
                        multiple={false}
                        allowPreview
                        files={draftMasterFooterLogoFiles}
                        onFilesSelected={setDraftMasterFooterLogoFiles}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label>Texto do rodapé Master</Label>
                      <Textarea
                        rows={3}
                        value={masterFooterText}
                        onChange={(event) => setMasterFooterText(event.target.value)}
                        className="min-h-[90px]"
                        placeholder="SIGAPRO — Plataforma institucional para aprovação de projetos"
                      />
                      <p className="break-words text-xs text-slate-500">Esse texto aparece no rodapé institucional do ambiente Master.</p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </PageMainContent>
        ) : null}

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
                <Textarea
                  value={settingsForm.linkPortalCliente}
                  onChange={(event) => setSettingsField("linkPortalCliente", event.target.value)}
                  className="min-h-[64px] resize-none text-[13px] leading-5"
                />
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

              {status ? (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    statusIsSuccess
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {status}
                </div>
              ) : null}

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




