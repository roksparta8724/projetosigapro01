import {
  Bell,
  BookOpenText,
  Building2,
  Check,
  ChevronDown,
  FileText,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MonitorCog,
  Palette,
  PencilLine,
  Phone,
  Power,
  ScrollText,
  Search,
  Settings2,
  UserRound,
  Wallet,
  Layers,
  PlusCircle,
  ListChecks,
  FileBarChart2,
  Trash2,
  Flag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useUserMenuPreferences, type MenuPreferenceKey } from "@/hooks/useUserMenuPreferences";
import { can, desktopThemePresets, matchesOperationalScope, mobileThemePresets, parseMarker, roleLabels, type Permission } from "@/lib/platform";
import { AppSidebar } from "@/components/platform/AppSidebar";
import { InstitutionalLogo } from "@/components/platform/InstitutionalLogo";
import { SidebarProfilePanel } from "@/components/platform/SidebarProfilePanel";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { SYSTEM_MARKER_IDS, useMarkerPresets, type MarkerPreset } from "@/hooks/useMarkerPresets";

interface PortalFrameProps {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}

const navItems = [
  { key: "dashboard", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "manage_own_profile" as Permission, essential: true },
  { key: "dashboard-master", to: "/master", label: "Administrador Geral", icon: Building2, permission: "view_master_dashboard" as Permission, essential: true },
  { key: "dashboard-tenant", to: "/prefeitura", label: "Prefeitura", icon: Landmark, permission: "manage_tenant_users" as Permission, essential: true },
  {
    key: "protocols",
    to: "/prefeitura/protocolos",
    label: "Protocolos",
    icon: ScrollText,
    permission: "manage_tenant_users" as Permission,
    children: [
      { to: "/prefeitura/protocolos", label: "Visão geral", icon: LayoutDashboard },
      { to: "/prefeitura/protocolos/novo", label: "Novo protocolo", icon: PlusCircle },
    ],
  },
  { key: "analysis", to: "/prefeitura/analise", label: "Análise", icon: FileText, permission: "review_processes" as Permission },
  {
    key: "finance",
    to: "/prefeitura/financeiro",
    label: "Financeiro",
    icon: Wallet,
    permission: "manage_financial" as Permission,
    children: [
      { to: "/prefeitura/financeiro", label: "Visão geral", icon: LayoutDashboard },
      { to: "/prefeitura/financeiro/protocolos", label: "Protocolos e recolhimento", icon: FileBarChart2 },
      { to: "/prefeitura/financeiro/iptu", label: "IPTU e ISSQN", icon: Layers },
    ],
  },
  { key: "notifications", to: "/notificacoes", label: "Notificações", icon: Bell, permission: "manage_own_profile" as Permission },
  { key: "history", to: "/historico", label: "Histórico", icon: History, permission: "manage_own_profile" as Permission },
  { key: "legislation", to: "/legislacao", label: "Legislação", icon: BookOpenText, permission: "manage_own_profile" as Permission },
  {
      key: "external",
      to: "/externo",
      label: "Acesso Externo",
      icon: LayoutDashboard,
      permission: "submit_processes" as Permission,
      children: [
        { to: "/externo", label: "Visão geral", icon: LayoutDashboard },
        { to: "/externo/protocolar", label: "Protocolar", icon: ListChecks },
        { to: "/externo/controle", label: "Controle de processos", icon: FileBarChart2 },
        { to: "/externo/pagamentos", label: "Pagamentos", icon: Wallet },
        { to: "/externo/historico", label: "Histórico", icon: History },
        { to: "/externo/mensagens", label: "Mensagens", icon: Mail },
      ],
    },
  { key: "settings", to: "/configuracoes", label: "Cadastro e Gestão", icon: Settings2, permission: "manage_tenant_branding" as Permission, essential: true },
];

const managementNavItems = ["/master", "/prefeitura", "/configuracoes"];

const MARKER_COLOR_OPTIONS = [
  { value: "#3b82f6", label: "Fluxo azul" },
  { value: "#14b8a6", label: "Triagem verde-azulada" },
  { value: "#8b5cf6", label: "Análise violeta" },
  { value: "#f59e0b", label: "Atenção âmbar" },
  { value: "#ef4444", label: "Urgência coral" },
  { value: "#22c55e", label: "Aprovado verde" },
  { value: "#0ea5e9", label: "Protocolo céu" },
  { value: "#64748b", label: "Neutro institucional" },
];
const operationalNavItems = [
  "/dashboard",
  "/prefeitura/protocolos",
  "/prefeitura/analise",
  "/prefeitura/financeiro",
  "/notificacoes",
  "/historico",
  "/legislacao",
  "/externo",
];
const financeNavItems = ["/prefeitura/financeiro"];
const supportNavItems = ["/notificacoes", "/historico", "/legislacao"];

function darken(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(parseInt(value.slice(0, 2), 16) - amount);
  const g = clamp(parseInt(value.slice(2, 4), 16) - amount);
  const b = clamp(parseInt(value.slice(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function withAlpha(hex: string, alpha: string) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkSurface(hex: string, threshold = 0.56) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < threshold;
}

function resolveBrandingLogoUrl(
  branding:
    | (Partial<{
        logoUrl: string;
        headerLogoUrl: string;
        footerLogoUrl: string;
        coatOfArmsUrl: string;
      }> & { [key: string]: unknown })
    | null
    | undefined,
  variant: "header" | "footer",
) {
  if (!branding) return "";
  return variant === "footer"
    ? branding.footerLogoUrl || branding.logoUrl || branding.coatOfArmsUrl || ""
    : branding.headerLogoUrl || branding.logoUrl || branding.coatOfArmsUrl || "";
}

export function PortalFrame({ title, eyebrow, children }: PortalFrameProps) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerColor, setMarkerColor] = useState("#3b82f6");
  const [markerSavePulse, setMarkerSavePulse] = useState(false);
  const [pendingMarkerRemovalId, setPendingMarkerRemovalId] = useState<string | null>(null);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editingMarkerLabel, setEditingMarkerLabel] = useState("");
  const [editingMarkerColor, setEditingMarkerColor] = useState("#3b82f6");
  const [themeOverride, setThemeOverride] = useState<{ primary?: string; accent?: string; background?: string; inverseMain?: boolean } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("sigapro-layout-theme");
      return raw ? (JSON.parse(raw) as { primary?: string; accent?: string; background?: string; inverseMain?: boolean }) : null;
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const isConfigPage = location.pathname.startsWith("/configuracoes");
  const { signOut } = useAuthGateway();
  const { session, sessions, setActiveSession } = usePlatformSession();
  const { municipality, tenantSettingsCompat, theme: municipalityTheme, name: municipalityName, scopeId } = useMunicipality();
  const { source, loading, institutions, getInstitutionSettings, getUserProfile, processes } = usePlatformData();
  const { isItemVisible } = useUserMenuPreferences();
  const { presets: markerPresets, addPreset, updatePreset, togglePresetActive, removePreset } = useMarkerPresets();
  const activeInstitutionId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const isMasterUser = session.role === "master_admin" || session.role === "master_ops";
  const brandingTenantId = isMasterUser ? null : activeInstitutionId;
  const { headerBranding, footerBranding, officialHeaderText, officialFooterText } = useInstitutionBranding(brandingTenantId);
  const resolvedHeaderLogoUrl = resolveBrandingLogoUrl(headerBranding as Record<string, unknown>, "header");
  const resolvedFooterLogoUrl = resolveBrandingLogoUrl(footerBranding as Record<string, unknown>, "footer");
  const stableHeaderBranding = useMemo(
    () => ({
      ...headerBranding,
      logoUrl: resolvedHeaderLogoUrl || headerBranding.logoUrl,
    }),
    [headerBranding, resolvedHeaderLogoUrl],
  );
  const stableFooterBranding = useMemo(
    () => ({
      ...footerBranding,
      logoUrl: resolvedFooterLogoUrl || footerBranding.logoUrl,
    }),
    [footerBranding, resolvedFooterLogoUrl],
  );

  const activeInstitution = municipality ?? institutions.find((item) => item.id === activeInstitutionId) ?? null;
  const tenantSettings = tenantSettingsCompat ?? getInstitutionSettings(activeInstitutionId);
  const userProfile = getUserProfile(session.id, session.email);

  useEffect(() => {
    const syncTheme = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem("sigapro-layout-theme");
        setThemeOverride(raw ? (JSON.parse(raw) as { primary?: string; accent?: string; background?: string; inverseMain?: boolean }) : null);
      } catch {
        setThemeOverride(null);
      }
    };

    window.addEventListener("sigapro-theme-change", syncTheme as EventListener);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("sigapro-theme-change", syncTheme as EventListener);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobileViewport(media.matches);

    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const availableThemePresets = isMobileViewport ? mobileThemePresets : desktopThemePresets;

  const appliedTheme = themeOverride ?? null;
  const resolvedThemePreset =
    desktopThemePresets.find(
      (preset) =>
        preset.primary === appliedTheme?.primary &&
        preset.accent === appliedTheme?.accent &&
        preset.background === appliedTheme?.background &&
        !!preset.inverseMain === !!appliedTheme?.inverseMain,
    ) ??
    desktopThemePresets.find(
      (preset) =>
        preset.primary === municipalityTheme.primary &&
        preset.accent === municipalityTheme.accent &&
        (!!preset.inverseMain ? preset.background === municipalityTheme.background : true),
    ) ??
    desktopThemePresets[0];
  const primaryColor =
    appliedTheme?.primary ||
    municipalityTheme.primary ||
    ("theme" in (activeInstitution ?? {}) ? activeInstitution?.theme.primary : undefined) ||
    resolvedThemePreset.primary ||
    "#163b63";
  const accentColor =
    appliedTheme?.accent ||
    municipalityTheme.accent ||
    ("theme" in (activeInstitution ?? {}) ? activeInstitution?.theme.accent : undefined) ||
    resolvedThemePreset.accent ||
    "#3b82f6";
  const inverseThemeHint = appliedTheme?.inverseMain ?? resolvedThemePreset.inverseMain ?? false;
  const pageBackground = appliedTheme?.background || resolvedThemePreset.background || "#f5f8fc";
  const sidebarBase = primaryColor;
  const sidebarBottom = darken(sidebarBase, 8);
  const sidebarFill = darken(primaryColor, 10);
  const darkSidebar = isDarkSurface(sidebarFill);
  const bannerMid = darken(primaryColor, -4);
  const activeBg = darken(primaryColor, -14);

  const visibleNavItems = navItems.filter((item) => {
    if (!can(session, item.permission)) return false;
    if (!item.key) return true;
    if (item.essential) return true;
    return isItemVisible(item.key as MenuPreferenceKey);
  });
  const visibleNavItemsResolved = visibleNavItems.flatMap((item) => {
    if ((session.role === "master_admin" || session.role === "master_ops") && item.to === "/master") {
      return [{ ...item, label: "Cadastro e Gestão" }];
    }
    if ((session.role === "master_admin" || session.role === "master_ops") && item.to === "/configuracoes") {
      return [];
    }
    return [item];
  });

  const isAdministrativeSidebar =
    session.role === "master_admin" || session.role === "master_ops" || session.role === "prefeitura_admin";

  const visibleManagementItems = visibleNavItemsResolved.filter((item) => managementNavItems.includes(item.to));
  const visibleOperationalItems = visibleNavItemsResolved.filter((item) =>
    isAdministrativeSidebar ? operationalNavItems.includes(item.to) : !managementNavItems.includes(item.to),
  );
  const visibleFinanceItems = visibleOperationalItems.filter((item) => financeNavItems.includes(item.to));
  const visibleSupportItems = visibleOperationalItems.filter((item) => supportNavItems.includes(item.to));
  const visiblePrimaryItems = visibleOperationalItems.filter((item) => !financeNavItems.includes(item.to) && !supportNavItems.includes(item.to));
  const sidebarGroups = [
    ...(isAdministrativeSidebar ? [{ title: "Administração", items: visibleManagementItems }] : []),
    { title: "Operação", items: visiblePrimaryItems },
    { title: "Financeiro", items: visibleFinanceItems },
    { title: "Apoio", items: visibleSupportItems },
  ];

  const visibleTenantProcesses = processes.filter((process) => matchesOperationalScope(activeInstitutionId, process));
  const bookmarkedProcesses = visibleTenantProcesses.filter((process) => (process.tags ?? []).length > 0);
  const bookmarkedMarkers = useMemo(
    () =>
      bookmarkedProcesses.map((process) => {
        const firstTag = (process.tags ?? [])[0] ?? "";
        const parsed = parseMarker(firstTag);
        return {
          process,
          marker: parsed,
        };
      }),
    [bookmarkedProcesses],
  );
  const systemMarkerPresets = useMemo(
    () => markerPresets.filter((preset) => preset.system || SYSTEM_MARKER_IDS.has(preset.id)),
    [markerPresets],
  );
  const customMarkerPresets = useMemo(
    () => markerPresets.filter((preset) => !(preset.system || SYSTEM_MARKER_IDS.has(preset.id))),
    [markerPresets],
  );
  const activeMarkerCount = useMemo(
    () => markerPresets.filter((preset) => preset.active).length,
    [markerPresets],
  );
  const inactiveMarkerCount = markerPresets.length - activeMarkerCount;
  const recentMarkerEntries = useMemo(() => bookmarkedMarkers.slice(0, 6), [bookmarkedMarkers]);
  const selectedMarkerColorLabel =
    MARKER_COLOR_OPTIONS.find((option) => option.value === markerColor)?.label ?? "Cor personalizada";
  const notificationCount = visibleTenantProcesses.reduce(
    (count, process) => count + (process.messages?.length ?? 0) + (process.dispatches?.length ?? 0),
    0,
  );

  const globalSearchItems = useMemo(() => {
    const items: {
      id: string;
      label: string;
      description?: string;
      group: string;
      onSelect: () => void;
    }[] = [];

    visibleNavItemsResolved.forEach((item) => {
      items.push({
        id: `page-${item.to}`,
        label: item.label,
        description: "Acesso rápido",
        group: "Páginas",
        onSelect: () => navigate(item.to),
      });
      (item.children ?? []).forEach((child) => {
        items.push({
          id: `page-${child.to}`,
          label: child.label,
          description: item.label,
          group: "Páginas",
          onSelect: () => navigate(child.to),
        });
      });
    });

    visibleTenantProcesses.slice(0, 8).forEach((process) => {
      items.push({
        id: `process-${process.id}`,
        label: process.protocol || process.title || "Processo sem título",
        description: process.title || "Processo administrativo",
        group: "Processos",
        onSelect: () => navigate(`/processos/${process.id}`),
      });
    });

    if ((session.role === "master_admin" || session.role === "master_ops") && institutions.length > 0) {
      institutions.slice(0, 6).forEach((institution) => {
        items.push({
          id: `tenant-${institution.id}`,
          label: institution.name,
          description: institution.city ? `${institution.city} • ${institution.state}` : "Prefeitura cliente",
          group: "Prefeituras",
          onSelect: () => navigate("/master"),
        });
      });
    }

    items.push({
      id: "action-settings",
      label: "Configurações institucionais",
      description: "Branding e preferências",
      group: "Ações rápidas",
      onSelect: () => navigate("/configuracoes"),
    });
    items.push({
      id: "action-profile",
      label: "Meu perfil",
      description: "Conta e identidade",
      group: "Ações rápidas",
      onSelect: () => navigate("/perfil"),
    });

    return items;
  }, [institutions, navigate, session.role, visibleNavItemsResolved, visibleTenantProcesses]);

  const filteredSearchItems = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return globalSearchItems;
    return globalSearchItems.filter((item) => {
      const content = `${item.label} ${item.description || ""}`.toLowerCase();
      return content.includes(query);
    });
  }, [commandQuery, globalSearchItems]);

  const groupedSearchItems = useMemo(() => {
    const groups = new Map<string, typeof filteredSearchItems>();
    filteredSearchItems.forEach((item) => {
      const groupItems = groups.get(item.group) ?? [];
      groupItems.push(item);
      groups.set(item.group, groupItems);
    });
    return Array.from(groups.entries());
  }, [filteredSearchItems]);

  const displayUserName = userProfile?.fullName?.trim() || session.name;
  const topbarAvatarImageUrl = userProfile?.avatarUrl?.trim() || null;
  const topbarAvatarImageStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!topbarAvatarImageUrl) return undefined;

    const scale = Number(userProfile?.avatarScale ?? 1);
    const offsetX = Number(userProfile?.avatarOffsetX ?? 0);
    const offsetY = Number(userProfile?.avatarOffsetY ?? 0);

    return {
      transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
      transformOrigin: "center center",
    };
  }, [topbarAvatarImageUrl, userProfile?.avatarOffsetX, userProfile?.avatarOffsetY, userProfile?.avatarScale]);
  const roleLabel = userProfile?.professionalType?.trim() || roleLabels[session.role];
  const institutionDisplayName = municipalityName || activeInstitution?.name || "SIGAPRO";
  const institutionDisplaySubtitle = officialHeaderText || tenantSettings?.secretariaResponsavel || "Departamento responsável";
  const institutionFooterTitle = officialHeaderText || tenantSettings?.secretariaResponsavel || "Secretaria não informada";
  const institutionFooterSignature =
    officialFooterText || "SIGAPRO — Plataforma institucional para aprovação de projetos";
  const activeThemePreset =
    availableThemePresets.find(
      (preset) =>
        preset.primary === primaryColor &&
        preset.accent === accentColor &&
        (preset.background || "#f5f8fc") === pageBackground &&
        !!preset.inverseMain === !!inverseThemeHint,
    ) ??
    desktopThemePresets.find(
      (preset) =>
        preset.primary === primaryColor &&
        preset.accent === accentColor &&
        (preset.background || "#f5f8fc") === pageBackground &&
        !!preset.inverseMain === !!inverseThemeHint,
    ) ??
    resolvedThemePreset;
  const activeThemePresetId = activeThemePreset?.id ?? null;
  const inverseMainTheme = inverseThemeHint || !!activeThemePreset?.inverseMain;
  const darkTopbar = inverseMainTheme || isDarkSurface(primaryColor, 0.7);
  const topbarBrandTitle = "SIGAPRO";
  const topbarBrandSubtitle = "Sistema integrado de gestão e aprovação de projetos";
  const topbarGhostButton = "sig-topbar-control sig-topbar-ghost";
const topbarSearchButton = "sig-topbar-control sig-topbar-searchbar";
const topbarIconButton = "sig-topbar-control sig-topbar-icon-button";
const topbarProfileButton = "sig-topbar-control sig-topbar-profile-trigger";
  const accountContextLabel = isMasterUser ? "Master" : "Ambiente ativo";
  const accountContextDescription = isMasterUser
    ? "Governança central da plataforma"
    : institutionDisplayName;
  const accountStatusLabel = loading ? "Sincronizando" : "Conta ativa";

  const resetMarkerEditor = () => {
    setEditingMarkerId(null);
    setEditingMarkerLabel("");
    setEditingMarkerColor("#3b82f6");
  };

  const startMarkerEdit = (preset: MarkerPreset) => {
    setEditingMarkerId(preset.id);
    setEditingMarkerLabel(preset.label);
    setEditingMarkerColor(preset.color || "#3b82f6");
    setPendingMarkerRemovalId(null);
  };

  const saveMarkerEdit = (presetId: string) => {
    const nextLabel = editingMarkerLabel.trim();
    if (!nextLabel) return;
    updatePreset(presetId, { label: nextLabel, color: editingMarkerColor });
    resetMarkerEditor();
  };

  const getMarkerDescription = (preset: MarkerPreset) => {
    const description = preset.description?.trim();
    if (description) return description;
    if (preset.system) return "Disponivel para filtros rapidos, triagens e destaques institucionais.";
    return preset.active
      ? "Marcador personalizado ativo para organizar etapas, exigencias e prioridades."
      : "Marcador personalizado pausado. Reative quando quiser voltar a usa-lo.";
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!commandOpen) {
      setCommandQuery("");
    }
  }, [commandOpen]);

  const handleSignOut = async (destination = "/acesso") => {
    try {
      console.log("[Logout] click");
      console.log("[Logout] signOut start");
      await signOut();
      console.log("[Logout] signOut result");
    } catch (error) {
      console.warn("[SIGAPRO] Falha ao encerrar sessão, forçando redirecionamento.", error);
    } finally {
      console.log("[Logout] redirect", { destination });
      if (typeof window !== "undefined") {
        window.location.replace(destination);
      } else {
        navigate(destination, { replace: true });
      }
    }
  };

  const applyLayoutTheme = (theme: { primary?: string; accent?: string; background?: string; inverseMain?: boolean } | null) => {
    setThemeOverride(theme);
    if (typeof window === "undefined") return;

    try {
      if (theme?.primary || theme?.accent || theme?.background) {
        window.localStorage.setItem("sigapro-layout-theme", JSON.stringify(theme));
      } else {
        window.localStorage.removeItem("sigapro-layout-theme");
      }
      window.dispatchEvent(new Event("sigapro-theme-change"));
    } catch {
      // noop
    }
  };
  const getSessionDisplayLabel = (item: typeof session) => {
    const profile = getUserProfile(item.id, item.email);
    const profileName = profile?.fullName?.trim() || item.name;
    const profileRole = profile?.professionalType?.trim() || roleLabels[item.role];
    return `${profileName} - ${profileRole}`;
  };
  const renderMarkerCard = (preset: MarkerPreset, sectionLabel: string) => {
    const isEditing = editingMarkerId === preset.id;
    const isPendingRemoval = pendingMarkerRemovalId === preset.id;
    const statusLabel = preset.active ? "Ativo" : "Inativo";
    const badgeLabel = preset.system ? "Sistema" : "Personalizado";

    return (
      <div
        key={preset.id}
        className={cn(
          "sig-marker-item rounded-[18px] border px-3 py-3",
          !preset.active && "sig-marker-item-inactive",
        )}
        title={preset.label}
      >
        {isEditing ? (
          <div className="sig-marker-editor space-y-3">
            <div className="flex items-start gap-3">
              <span className="sig-marker-item-icon inline-flex h-10 w-10 items-center justify-center rounded-[14px] border">
                <Flag
                  className="h-4 w-4 sig-flag-glow sig-flag-filled"
                  style={{ color: editingMarkerColor || "#3b82f6", fill: editingMarkerColor || "#3b82f6" }}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Editar marcador</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                  Atualize o nome e a cor sem perder o historico de uso.
                </p>
              </div>
            </div>

            <Input
              value={editingMarkerLabel}
              onChange={(event) => setEditingMarkerLabel(event.target.value)}
              placeholder="Nome do marcador"
              className="sig-marker-input h-10 rounded-[14px] border-slate-200 bg-white/90 px-3 text-[13px]"
            />

            <div className="grid grid-cols-4 gap-2">
              {MARKER_COLOR_OPTIONS.map((option) => {
                const isActiveOption = option.value === editingMarkerColor;
                return (
                  <button
                    key={`${preset.id}-${option.value}`}
                    type="button"
                    className={cn(
                      "sig-marker-swatch rounded-[14px] border px-2.5 py-2 text-left transition",
                      isActiveOption && "sig-marker-swatch-active",
                    )}
                    onClick={() => setEditingMarkerColor(option.value)}
                    aria-label={`Selecionar ${option.label}`}
                    title={option.label}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-[0_0_0_2px_rgba(255,255,255,0.06)]"
                        style={{ backgroundColor: option.value }}
                      />
                      <span className="truncate text-[11px] font-medium">{option.label.replace(/^.*\s/, "")}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="sig-marker-inline-action sig-marker-inline-action-muted"
                onClick={resetMarkerEditor}
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
              <button
                type="button"
                className="sig-marker-inline-action sig-marker-inline-action-primary"
                onClick={() => saveMarkerEdit(preset.id)}
              >
                <Check className="h-3.5 w-3.5" />
                Salvar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="sig-marker-item-icon inline-flex h-10 w-10 items-center justify-center rounded-[14px] border">
              <Flag
                className="h-4 w-4 sig-flag-glow sig-flag-filled"
                style={{ color: preset.color || "#3b82f6", fill: preset.color || "#3b82f6" }}
              />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[13px] font-semibold text-slate-900">{preset.label}</p>
                <span className={cn("sig-marker-status inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", preset.active ? "sig-marker-status-active" : "sig-marker-status-inactive")}>
                  {statusLabel}
                </span>
                <span className="sig-marker-item-badge inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  {badgeLabel}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{getMarkerDescription(preset)}</p>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                {sectionLabel}
              </p>
            </div>

            <div className="sig-marker-actions flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="sig-marker-action"
                onClick={() => startMarkerEdit(preset)}
                aria-label="Editar marcador"
                title="Editar marcador"
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn("sig-marker-action", !preset.active && "sig-marker-action-active")}
                onClick={() => {
                  togglePresetActive(preset.id);
                  setPendingMarkerRemovalId(null);
                }}
                aria-label={preset.active ? "Desativar marcador" : "Ativar marcador"}
                title={preset.active ? "Desativar marcador" : "Ativar marcador"}
              >
                <Power className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "sig-marker-delete inline-flex h-9 w-9 items-center justify-center rounded-[12px] transition",
                  isPendingRemoval && "sig-marker-delete-pending",
                )}
                onClick={() => {
                  if (isPendingRemoval) {
                    removePreset(preset.id);
                    if (editingMarkerId === preset.id) resetMarkerEditor();
                    setPendingMarkerRemovalId(null);
                    return;
                  }
                  setPendingMarkerRemovalId(preset.id);
                }}
                aria-label={isPendingRemoval ? "Confirmar exclusao do marcador" : "Excluir marcador"}
                title={isPendingRemoval ? "Confirmar exclusao" : "Excluir marcador"}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  const SectionGlyph = location.pathname.startsWith("/prefeitura/financeiro")
    ? Wallet
    : location.pathname.startsWith("/prefeitura/protocolos")
      ? ScrollText
      : location.pathname.startsWith("/prefeitura/analise")
        ? FileText
        : location.pathname.startsWith("/master")
          ? Building2
          : location.pathname.startsWith("/perfil")
            ? UserRound
            : location.pathname.startsWith("/configuracoes")
              ? Settings2
              : location.pathname.startsWith("/externo")
                ? LayoutDashboard
                : location.pathname.startsWith("/historico")
                  ? History
                  : location.pathname.startsWith("/notificacoes")
                    ? Bell
                    : location.pathname.startsWith("/legislacao")
                      ? BookOpenText
                      : MonitorCog;

  return (
    <div
      className="sig-app-frame min-h-screen text-foreground"
      data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}
      data-viewport={isMobileViewport ? "mobile" : "desktop"}
      style={
        {
          backgroundColor: pageBackground,
          "--sig-sidebar-stripe-width": sidebarExpanded ? "264px" : "92px",
          "--sig-sidebar-fill": sidebarFill,
          "--sig-inverse-accent-soft": withAlpha(accentColor, "0.08"),
          "--sig-inverse-accent-medium": withAlpha(accentColor, "0.16"),
          "--sig-inverse-accent-strong": withAlpha(accentColor, "0.28"),
          "--sig-inverse-border": withAlpha(accentColor, "0.18"),
          "--sig-inverse-icon": "#7dd3fc",
          "--sig-inverse-icon-strong": "#38bdf8",
          "--sig-inverse-surface": darken(primaryColor, 1),
          "--sig-inverse-surface-soft": darken(primaryColor, -4),
          "--sig-inverse-shell-top": darken(primaryColor, 4),
          "--sig-inverse-shell-bottom": darken(primaryColor, -2),
          "--sig-page-background": pageBackground,
        } as React.CSSProperties
      }
    >
      <div
        className="sig-premium-topbar fixed inset-x-0 top-0 z-50 border-b"
        style={{
          borderBottomColor: withAlpha(accentColor, "0.08"),
          background: `linear-gradient(180deg, ${withAlpha(darken(primaryColor, 26), "0.985")} 0%, ${withAlpha(darken(primaryColor, 22), "0.965")} 48%, ${withAlpha(darken(primaryColor, 19), "0.948")} 100%)`,
          boxShadow: `0 16px 30px ${withAlpha("#020617", "0.11")}`,
        }}
      >
        <div className="sig-topbar-shell flex min-h-[66px] items-center gap-3 px-3 sm:px-4 lg:min-h-[74px] lg:gap-4 lg:px-6 2xl:px-8">
          <div className="sig-topbar-brand-cluster flex min-w-0 items-center gap-3 pr-1 lg:hidden lg:pr-4">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/10 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
            <div className="sig-topbar-brand-logo flex h-[56px] w-[56px] items-center justify-center">
              <div className="sig-topbar-brand-badge flex items-center justify-center">
                <img src="/favicon-sigapro.svg" alt="SIGAPRO" className="sig-topbar-brand-image" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="sig-topbar-brand-title text-[11px] font-semibold uppercase tracking-[0.14em] leading-none lg:text-[12px]">
                {topbarBrandTitle}
              </p>
              <p className="sig-topbar-brand-subtitle mt-1 max-w-[220px] text-[11px] font-medium leading-[1.28] lg:max-w-[320px] lg:text-[12px]">
                {topbarBrandSubtitle}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => navigate("/notificacoes")}
              className={cn(
                "inline-flex h-[34px] w-[34px] items-center justify-center rounded-[14px] transition duration-200 hover:-translate-y-[1px]",
                topbarIconButton,
              )}
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4 text-amber-200 drop-shadow-[0_2px_6px_rgba(15,23,42,0.32)]" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className={cn(
                "flex h-[34px] items-center rounded-[16px] px-1.5 transition duration-200 hover:-translate-y-[1px]",
                topbarGhostButton,
              )}
              aria-label="Meu perfil"
            >
              <UserAvatar
                name={displayUserName}
                imageUrl={topbarAvatarImageUrl}
                imageStyle={topbarAvatarImageStyle}
                size="sm"
                className="sig-topbar-user-avatar"
                fallbackClassName="sig-topbar-user-avatar-fallback !bg-[linear-gradient(180deg,#ffffff_0%,#dde7f1_100%)] !text-[#17324a]"
              />
            </button>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-between gap-5 lg:flex">
            <div className="sig-topbar-primary-group flex min-w-0 flex-1 items-center gap-4">
              <div className="sig-topbar-brand-cluster flex min-w-0 items-center gap-3.5 pr-1">
                <div className="sig-topbar-brand-logo flex h-[68px] w-[68px] items-center justify-center">
                  <div className="sig-topbar-brand-badge flex items-center justify-center">
                    <img src="/favicon-sigapro.svg" alt="SIGAPRO" className="sig-topbar-brand-image" />
                  </div>
                </div>
                <div className="sig-topbar-brand-copy min-w-0">
                  <p className="sig-topbar-brand-title text-[13px] font-semibold uppercase tracking-[0.16em] leading-none">
                    {topbarBrandTitle}
                  </p>
                  <p
                    className="sig-topbar-brand-subtitle mt-1 max-w-[330px] overflow-hidden text-[12px] font-medium leading-[1.28] text-ellipsis whitespace-nowrap xl:max-w-[420px]"
                    title={topbarBrandSubtitle}
                  >
                    {topbarBrandSubtitle}
                  </p>
                </div>
              </div>

              <div className="sig-topbar-search-wrap relative w-full max-w-[360px] xl:max-w-[420px]">
                <button
                  type="button"
                  onClick={() => setCommandOpen(true)}
                  className={cn(
                    "sig-topbar-search sig-topbar-search-trigger group flex h-[44px] w-full items-center gap-3 rounded-[16px] px-4 transition duration-200 hover:-translate-y-[1px] focus-visible:outline-none",
                    topbarSearchButton,
                  )}
                  aria-label="Busca global"
                >
                  <span className="sig-topbar-search-icon inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/[0.05] text-sky-100 transition group-hover:bg-white/[0.09] group-hover:text-white">
                    <Search className="h-4 w-4" />
                  </span>
                  <span className="sig-topbar-search-label min-w-0 flex-1 truncate text-left text-[14px] font-medium tracking-[0.01em] text-white/90">
                    Pesquisar
                  </span>
                  <span className="sig-topbar-search-hint hidden items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] xl:inline-flex">
                    Ctrl K
                  </span>
                </button>
              </div>
            </div>

            <div className="sig-topbar-actions-wrap flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              className={cn(
                "sig-topbar-menu-trigger inline-flex h-[42px] items-center gap-2.5 rounded-[15px] px-3.5 text-[13px] font-medium transition duration-200 hover:-translate-y-[1px]",
                topbarGhostButton,
              )}
              onClick={() => setSidebarExpanded((current) => !current)}
              aria-label="Alternar menu lateral"
            >
              <span className="sig-topbar-menu-icon inline-flex h-9 w-9 items-center justify-center rounded-[12px]">
                <Menu className="h-4 w-4" />
              </span>
              <span className="font-semibold tracking-[0.01em]">Menu</span>
            </button>
            <div className="sig-topbar-group sig-topbar-utility-group flex items-center gap-1.5 rounded-[18px] px-1.5 py-1.5">
              <button
                type="button"
                onClick={() => navigate("/notificacoes")}
                className={cn(
                  "sig-topbar-action-trigger relative inline-flex h-[40px] w-[40px] items-center justify-center rounded-[14px] transition duration-200 hover:-translate-y-[1px]",
                  topbarIconButton,
                )}
                aria-label="Notificações"
                title="Notificações"
              >
                <Bell className="h-4 w-4 text-amber-200 drop-shadow-[0_2px_6px_rgba(15,23,42,0.18)]" aria-hidden="true" />
                <span className="sig-topbar-notification-badge absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                  {notificationCount}
                </span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "sig-topbar-action-trigger inline-flex h-[40px] w-[40px] items-center justify-center rounded-[14px] transition duration-200 hover:-translate-y-[1px]",
                      topbarIconButton,
                    )}
                    aria-label="Marcadores"
                    title="Marcadores"
                  >
                    <Flag
                      className="h-4.5 w-4.5 sig-flag-glow-strong sig-flag-filled sig-flag-grad drop-shadow-[0_2px_6px_rgba(15,23,42,0.45)] text-sky-200"
                      style={{ fill: "#bae6fd" }}
                    />
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="sig-marker-panel max-h-[min(78vh,720px)] w-[min(100vw-24px,416px)] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_28px_60px_rgba(15,42,68,0.22)]">
                <DropdownMenuLabel className="px-0 py-0">
                  <div className="sig-marker-header rounded-[22px] border px-4 py-4">
                    <div className="flex items-start gap-3.5">
                      <div className="sig-marker-header-icon flex h-11 w-11 items-center justify-center rounded-[16px] border">
                        <Flag className="h-5 w-5 sig-flag-glow-strong sig-flag-filled text-sky-300" style={{ fill: "#7dd3fc" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marcadores</p>
                            <p className="mt-1 text-[13px] leading-5 text-slate-500">
                              Gerencie atalhos visuais com status real, edicao rapida e rastreabilidade coerente.
                            </p>
                          </div>
                          <div className="sig-marker-header-badge shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                            {activeMarkerCount} ativos
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {systemMarkerPresets.length > 0 ? (
                            <span className="sig-marker-meta-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                              <Layers className="h-3.5 w-3.5" />
                              {systemMarkerPresets.length} do sistema
                            </span>
                          ) : null}
                          {customMarkerPresets.length > 0 ? (
                            <span className="sig-marker-meta-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                              <PlusCircle className="h-3.5 w-3.5" />
                              {customMarkerPresets.length} personalizados
                            </span>
                          ) : null}
                          {inactiveMarkerCount > 0 ? (
                            <span className="sig-marker-meta-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                              <Power className="h-3.5 w-3.5" />
                              {inactiveMarkerCount} inativos
                            </span>
                          ) : null}
                          {recentMarkerEntries.length > 0 ? (
                            <span className="sig-marker-meta-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                              <History className="h-3.5 w-3.5" />
                              {recentMarkerEntries.length} em uso
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <div className="mt-3 space-y-3">
                  <section className="sig-marker-composer rounded-[22px] border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Novo marcador</p>
                        <p className="mt-1 text-[12px] leading-5 text-slate-500">
                          Crie um rotulo institucional para destacar etapas, exigencias e prioridades reais da tramitacao.
                        </p>
                      </div>
                      {markerSavePulse ? (
                        <span className="sig-marker-success inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                          Salvo
                        </span>
                      ) : null}
                    </div>

                    <div className="sig-marker-preview mt-4 flex items-center gap-3 rounded-[18px] border px-3 py-3">
                      <span className="sig-marker-preview-icon inline-flex h-10 w-10 items-center justify-center rounded-[14px] border">
                        <Flag
                          className={cn("h-4.5 w-4.5 sig-flag-glow-strong sig-flag-filled", markerSavePulse && "sig-flag-pulse")}
                          style={{ color: markerColor, fill: markerColor }}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-slate-900">{markerLabel.trim() || "Novo marcador institucional"}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{selectedMarkerColorLabel}</p>
                      </div>
                    </div>

                    <Input
                      value={markerLabel}
                      onChange={(event) => setMarkerLabel(event.target.value)}
                      placeholder="Ex.: Prioridade de despacho"
                      className="sig-marker-input mt-3 h-11 rounded-[16px] border-slate-200 bg-white/90 px-3 text-[13px]"
                    />

                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Paleta institucional</p>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {MARKER_COLOR_OPTIONS.map((option) => {
                          const isActive = option.value === markerColor;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "sig-marker-swatch group rounded-[16px] border px-2.5 py-2 text-left transition",
                                isActive && "sig-marker-swatch-active",
                              )}
                              onClick={() => setMarkerColor(option.value)}
                              aria-label={`Selecionar ${option.label}`}
                              title={option.label}
                            >
                              <span className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 rounded-full border border-white/40 shadow-[0_0_0_2px_rgba(255,255,255,0.06)]" style={{ backgroundColor: option.value }} />
                                <span className="truncate text-[11px] font-medium">{option.label.replace(/^.*\s/, "")}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Button
                      type="button"
                      className={cn(
                        "sig-marker-save-btn mt-4 h-10 w-full rounded-[16px] text-[12px] font-semibold",
                        markerSavePulse && "sig-flag-pulse",
                      )}
                      onClick={() => {
                        const nextLabel = markerLabel.trim();
                        if (!nextLabel) return;
                        addPreset({
                          label: nextLabel,
                          emoji: "",
                          color: markerColor,
                          description: "Marcador personalizado da operacao municipal.",
                        });
                        setMarkerLabel("");
                        setPendingMarkerRemovalId(null);
                        resetMarkerEditor();
                        setMarkerSavePulse(true);
                        window.setTimeout(() => setMarkerSavePulse(false), 640);
                      }}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Salvar marcador
                    </Button>
                  </section>

                  {systemMarkerPresets.length > 0 ? (
                    <section className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <Layers className="h-4 w-4 text-sky-300" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marcadores do sistema</p>
                      </div>
                      <div className="space-y-2">
                        {systemMarkerPresets.map((preset) => renderMarkerCard(preset, "Base institucional"))}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <ListChecks className="h-4 w-4 text-sky-300" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marcadores personalizados</p>
                    </div>
                    {customMarkerPresets.length === 0 ? (
                      <div className="sig-marker-empty rounded-[18px] border border-dashed px-3 py-4 text-[12px] text-slate-500">
                        Nenhum marcador personalizado cadastrado neste usuario.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {customMarkerPresets.map((preset) => renderMarkerCard(preset, "Gestao personalizada"))}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <History className="h-4 w-4 text-sky-300" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marcadores em uso</p>
                    </div>
                    {recentMarkerEntries.length === 0 ? (
                      <div className="sig-marker-empty rounded-[18px] border border-dashed px-3 py-4 text-[12px] text-slate-500">
                        Nenhum processo marcado recentemente neste contexto.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentMarkerEntries.map(({ process, marker }) => (
                          <DropdownMenuItem
                            key={process.id}
                            className="sig-marker-recent group rounded-[18px] border px-3 py-3 text-[13px] text-slate-700"
                            onClick={() => navigate(`/processos/${process.id}`)}
                            title={marker.label || process.title}
                          >
                            <span className="sig-marker-item-icon mr-3 inline-flex h-10 w-10 items-center justify-center rounded-[14px] border">
                              <Flag className="h-4 w-4 sig-flag-glow sig-flag-filled" style={{ color: marker.color ?? "#3b82f6", fill: marker.color ?? "#3b82f6" }} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">{process.protocol}</span>
                              <span className="mt-1 block text-xs text-slate-500">{marker.label || process.title}</span>
                            </span>
                            <span className="ml-auto flex flex-col items-end gap-1">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: marker.color }} />
                              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">Abrir</span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "sig-topbar-action-trigger inline-flex h-[40px] w-[40px] items-center justify-center rounded-[14px] transition duration-200 hover:-translate-y-[1px]",
                      topbarIconButton,
                    )}
                    aria-label="Selecionar tema"
                    title={activeThemePreset?.label || "Tema"}
                  >
                    <Palette
                      className="h-4.5 w-4.5 text-white/92 drop-shadow-[0_2px_6px_rgba(15,23,42,0.45)]"
                      aria-hidden="true"
                    />
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[calc(100vh-70px)] w-[min(100vw-24px,272px)] overflow-y-auto rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-[0_20px_42px_rgba(15,42,68,0.18)] sm:max-h-[calc(100vh-88px)] sm:w-[304px]">
                <DropdownMenuLabel className="px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Tema do layout</p>
                  <p className="mt-1 text-[13px] font-normal leading-5 text-slate-500">
                    {isMobileViewport ? "Escolha entre 4 temas premium do sistema." : "Escolha um tema premium do sistema."}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableThemePresets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    className={cn(
                      "rounded-[14px] px-3 py-2.5 text-[13px] text-slate-700",
                      activeThemePresetId === preset.id && "bg-slate-100 text-slate-950",
                    )}
                    onClick={() =>
                      applyLayoutTheme({
                        primary: preset.primary,
                        accent: preset.accent,
                        background: preset.background,
                        inverseMain: preset.inverseMain,
                      })
                    }
                  >
                    <span className="mr-3 flex h-9 w-11 shrink-0 overflow-hidden rounded-[11px] border border-slate-200">
                      <span className="h-full w-[34%]" style={{ backgroundColor: darken(preset.primary, 10) }} />
                      <span className="h-full w-[38%]" style={{ backgroundColor: preset.primary }} />
                      <span className="h-full w-[28%]" style={{ backgroundColor: preset.background || "#f5f8fc" }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sig-fit-title block text-[13px] font-medium">{preset.label}</span>
                      <span className={cn("sig-fit-copy mt-0.5 block text-[11px] leading-5 text-slate-500", isMobileViewport && "line-clamp-2")}>
                        {preset.description}
                      </span>
                    </span>
                    {activeThemePresetId === preset.id ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        Ativo
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="sig-topbar-separator h-9 w-px shrink-0" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "sig-topbar-profile-cluster flex h-[46px] items-center gap-3 rounded-[16px] px-2.5 pr-3 transition duration-200 hover:-translate-y-[1px]",
                    topbarProfileButton,
                  )}
                >
                  <UserAvatar
                    name={displayUserName}
                    imageUrl={topbarAvatarImageUrl}
                    imageStyle={topbarAvatarImageStyle}
                    size="md"
                    className="sig-topbar-user-avatar"
                    fallbackClassName="sig-topbar-user-avatar-fallback !bg-[linear-gradient(180deg,#ffffff_0%,#dde7f1_100%)] !text-[#17324a]"
                  />
                  <div className="hidden min-w-0 text-left xl:block">
                    <p className="sig-topbar-profile-name sig-fit-title text-[13px] font-semibold leading-tight" title={displayUserName}>
                      {displayUserName}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      <p className="sig-topbar-profile-meta sig-fit-copy text-[10px] font-medium uppercase tracking-[0.14em]">
                        {accountStatusLabel}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 !text-slate-700/80" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className={cn(
                  "w-[min(100vw-24px,360px)] rounded-[28px] border p-2.5 shadow-[0_28px_64px_rgba(15,42,68,0.26)] backdrop-blur-xl",
                  darkTopbar
                    ? "border-white/12 bg-[linear-gradient(180deg,rgba(8,22,38,0.98)_0%,rgba(10,28,47,0.96)_100%)] text-slate-100"
                    : "border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(247,250,253,0.98)_100%)] text-slate-900",
                )}
              >
                <DropdownMenuLabel className="px-0 py-0">
                  <div
                    className={cn(
                      "rounded-[22px] border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                      darkTopbar
                        ? "border-white/10 bg-[linear-gradient(135deg,rgba(20,88,143,0.24)_0%,rgba(10,25,42,0.74)_100%)]"
                        : "border-slate-200 bg-[linear-gradient(135deg,rgba(219,234,254,0.72)_0%,rgba(255,255,255,0.94)_58%,rgba(241,245,249,0.92)_100%)]",
                    )}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="relative shrink-0">
                        <UserAvatar
                          name={displayUserName}
                          imageUrl={topbarAvatarImageUrl}
                          imageStyle={topbarAvatarImageStyle}
                          size="lg"
                          className={cn(
                            "sig-topbar-user-avatar !text-[#17324a] ring-4 shadow-[0_18px_38px_rgba(15,23,42,0.16)]",
                            darkTopbar ? "border-white/18 ring-white/8" : "border-white ring-slate-100",
                          )}
                          fallbackClassName="sig-topbar-user-avatar-fallback !bg-[linear-gradient(180deg,#ffffff_0%,#dde7f1_100%)] !text-[#17324a]"
                        />
                        <span className={cn("absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2", darkTopbar ? "border-[#0d2237] bg-emerald-300" : "border-white bg-emerald-500")} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("sig-fit-title text-[15px] font-semibold leading-tight", darkTopbar ? "text-white" : "text-slate-950")} title={displayUserName}>
                            {displayUserName}
                          </p>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                              darkTopbar
                                ? "border-sky-300/18 bg-sky-300/12 text-sky-100"
                                : "border-slate-200 bg-white/90 text-slate-600",
                            )}
                          >
                            {accountContextLabel}
                          </span>
                        </div>

                        <p className={cn("mt-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-medium", darkTopbar ? "bg-white/10 text-slate-100" : "bg-slate-900/[0.045] text-slate-700")}>
                          {roleLabel}
                        </p>

                        {session.email ? (
                          <p className={cn("sig-fit-copy mt-2 text-[12px] leading-5", darkTopbar ? "text-slate-300" : "text-slate-500")} title={session.email}>
                            {session.email}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", darkTopbar ? "bg-emerald-400/10 text-emerald-200" : "bg-emerald-50 text-emerald-700")}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", darkTopbar ? "bg-emerald-300" : "bg-emerald-500")} />
                            {accountStatusLabel}
                          </span>
                          <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium", darkTopbar ? "bg-white/8 text-slate-300" : "bg-white/80 text-slate-500")}>
                            {accountContextDescription}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>

                <div className="px-1 pt-3">
                  <p className={cn("px-2 text-[10px] font-semibold uppercase tracking-[0.18em]", darkTopbar ? "text-slate-400" : "text-slate-500")}>
                    Ações principais
                  </p>
                </div>

                <div className="mt-2 space-y-1">
                  <DropdownMenuItem
                    className={cn(
                      "group rounded-[18px] px-3 py-3 text-left text-[13px]",
                      darkTopbar ? "text-slate-100 focus:bg-white/8" : "text-slate-700 focus:bg-slate-100/90",
                    )}
                    onClick={() => navigate("/perfil")}
                  >
                    <span className={cn("mr-3 flex h-10 w-10 items-center justify-center rounded-[14px] border transition", darkTopbar ? "border-white/10 bg-white/8 text-sky-100 group-hover:border-white/14 group-hover:bg-white/12 group-hover:text-white" : "border-slate-200 bg-white text-slate-600 group-hover:border-slate-300 group-hover:bg-slate-100 group-hover:text-slate-900")}>
                      <UserRound className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("sig-fit-title block text-[13px] font-semibold", darkTopbar ? "text-white" : "text-slate-900")}>
                        Meu perfil
                      </span>
                      <span className={cn("sig-fit-copy mt-1 block text-[11px] leading-5", darkTopbar ? "text-slate-400" : "text-slate-500")}>
                        Dados pessoais, avatar e identidade da conta.
                      </span>
                    </span>
                  </DropdownMenuItem>

                  {can(session, "manage_tenant_branding") ? (
                    <DropdownMenuItem
                      className={cn(
                        "group rounded-[18px] px-3 py-3 text-left text-[13px]",
                        darkTopbar ? "text-slate-100 focus:bg-white/8" : "text-slate-700 focus:bg-slate-100/90",
                      )}
                      onClick={() => navigate("/configuracoes")}
                    >
                      <span className={cn("mr-3 flex h-10 w-10 items-center justify-center rounded-[14px] border transition", darkTopbar ? "border-white/10 bg-white/8 text-sky-100 group-hover:border-white/14 group-hover:bg-white/12 group-hover:text-white" : "border-slate-200 bg-white text-slate-600 group-hover:border-slate-300 group-hover:bg-slate-100 group-hover:text-slate-900")}>
                        <Settings2 className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("sig-fit-title block text-[13px] font-semibold", darkTopbar ? "text-white" : "text-slate-900")}>
                          Configurações
                        </span>
                        <span className={cn("sig-fit-copy mt-1 block text-[11px] leading-5", darkTopbar ? "text-slate-400" : "text-slate-500")}>
                          Branding, parâmetros e preferências operacionais.
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ) : null}

                  <DropdownMenuItem
                    className={cn(
                      "group rounded-[18px] px-3 py-3 text-left text-[13px]",
                      darkTopbar ? "text-slate-100 focus:bg-white/8" : "text-slate-700 focus:bg-slate-100/90",
                    )}
                    onClick={async () => {
                      await handleSignOut("/acesso");
                    }}
                  >
                    <span className={cn("mr-3 flex h-10 w-10 items-center justify-center rounded-[14px] border transition", darkTopbar ? "border-white/10 bg-white/8 text-sky-100 group-hover:border-white/14 group-hover:bg-white/12 group-hover:text-white" : "border-slate-200 bg-white text-slate-600 group-hover:border-slate-300 group-hover:bg-slate-100 group-hover:text-slate-900")}>
                      <LayoutDashboard className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("sig-fit-title block text-[13px] font-semibold", darkTopbar ? "text-white" : "text-slate-900")}>
                        Trocar conta
                      </span>
                      <span className={cn("sig-fit-copy mt-1 block text-[11px] leading-5", darkTopbar ? "text-slate-400" : "text-slate-500")}>
                        Retorna ao acesso para entrar com outra credencial.
                      </span>
                    </span>
                  </DropdownMenuItem>
                </div>

                {sessions.length > 1 ? (
                  <>
                    <DropdownMenuSeparator className={cn("mx-2 my-3", darkTopbar ? "bg-white/10" : "bg-slate-200")} />
                    <div className="px-3 pb-1">
                      <p className={cn("text-[10px] font-semibold uppercase tracking-[0.18em]", darkTopbar ? "text-slate-400" : "text-slate-500")}>
                        Contas disponíveis
                      </p>
                    </div>
                    <div className="space-y-1">
                      {sessions.map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          className={cn(
                            "group rounded-[16px] px-3 py-2.5 text-left text-[13px]",
                            darkTopbar
                              ? item.id === session.id
                                ? "bg-white/10 text-white"
                                : "text-slate-200 focus:bg-white/8"
                              : item.id === session.id
                                ? "bg-slate-100 text-slate-950"
                                : "text-slate-700 focus:bg-slate-100/90",
                          )}
                          onClick={() => setActiveSession(item.id)}
                        >
                          <span className={cn("mr-3 flex h-9 w-9 items-center justify-center rounded-[12px] border transition", darkTopbar ? "border-white/10 bg-white/8 text-sky-100" : "border-slate-200 bg-white text-slate-600")}>
                            <UserRound className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("sig-fit-title block text-[13px] font-semibold", darkTopbar ? "text-white" : "text-slate-900")} title={getSessionDisplayLabel(item)}>
                              {getSessionDisplayLabel(item)}
                            </span>
                            <span className={cn("mt-1 block text-[11px]", darkTopbar ? "text-slate-400" : "text-slate-500")}>
                              {item.id === session.id ? "Sessão em uso" : "Trocar para esta conta"}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </>
                ) : null}

                <DropdownMenuSeparator className={cn("mx-2 my-3", darkTopbar ? "bg-white/10" : "bg-slate-200")} />

                <DropdownMenuItem
                  className={cn(
                    "group rounded-[18px] px-3 py-3 text-left text-[13px]",
                    darkTopbar
                      ? "text-rose-100 focus:bg-rose-400/10"
                      : "text-rose-700 focus:bg-rose-50",
                  )}
                  onClick={async () => {
                    await handleSignOut("/acesso");
                  }}
                >
                  <span className={cn("mr-3 flex h-10 w-10 items-center justify-center rounded-[14px] border transition", darkTopbar ? "border-rose-300/16 bg-rose-400/10 text-rose-200 group-hover:bg-rose-400/14 group-hover:text-rose-100" : "border-rose-200 bg-rose-50 text-rose-500 group-hover:bg-rose-100 group-hover:text-rose-600")}>
                    <LogOut className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("sig-fit-title block text-[13px] font-semibold", darkTopbar ? "text-rose-100" : "text-rose-700")}>
                      Sair
                    </span>
                    <span className={cn("mt-1 block text-[11px] leading-5", darkTopbar ? "text-rose-200/72" : "text-rose-500")}>
                      Encerrar a sessão atual com segurança.
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput
          placeholder="Buscar protocolos, usuários, páginas ou ações..."
          value={commandQuery}
          onValueChange={setCommandQuery}
        />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          {groupedSearchItems.map(([group, items], index) => (
            <div key={group}>
              <CommandGroup heading={group}>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    onSelect={() => {
                      item.onSelect();
                      setCommandOpen(false);
                    }}
                    className="rounded-[12px]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.description ? (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {index < groupedSearchItems.length - 1 ? <CommandSeparator /> : null}
            </div>
          ))}
        </CommandList>
      </CommandDialog>

      <div className="flex min-h-screen pt-[78px] lg:pt-[92px]">
        <AppSidebar
          pathname={location.pathname}
          groups={sidebarGroups}
          expanded={sidebarExpanded}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          inverseMain={inverseMainTheme}
          darkSurface={darkSidebar}
          footer={
            <div className={cn("space-y-3", !sidebarExpanded && "space-y-2")}>
                <SidebarProfilePanel
                  name={displayUserName}
                  role={roleLabel}
                  email={session.email}
                  imageUrl={userProfile?.avatarUrl}
                  statusLabel={loading ? "" : source === "local" ? "dados persistidos" : "ambiente remoto"}
                  compact={!sidebarExpanded}
                  onClick={() => navigate("/perfil")}
                  darkSurface={darkSidebar}
                />

              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-10 w-full rounded-[14px] px-3 text-[12px] font-semibold shadow-sm transition-all duration-200",
                  !sidebarExpanded && "px-0",
                  darkSidebar
                    ? "border-rose-400/20 bg-[linear-gradient(180deg,rgba(127,29,29,0.88)_0%,rgba(136,19,55,0.82)_100%)] text-rose-50 hover:bg-[linear-gradient(180deg,rgba(153,27,27,0.92)_0%,rgba(157,23,77,0.88)_100%)] hover:text-white"
                    : "border-slate-900/85 bg-slate-900 text-white hover:bg-slate-800 hover:text-white",
                )}
                title={!sidebarExpanded ? "Sair" : undefined}
                onClick={async () => {
                  await handleSignOut("/acesso");
                }}
              >
                <LogOut className={cn("h-[13px] w-[13px]", sidebarExpanded && "mr-2", darkSidebar ? "!text-rose-50" : "!text-white/90")} />
                {sidebarExpanded ? "Sair" : null}
              </Button>
            </div>
          }
        />

        <main className="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5 2xl:px-8">
          <div
            className={cn(
              "sig-main-shell rounded-[20px] border p-3 shadow-sm sm:rounded-[24px] sm:p-4 md:p-5 lg:p-6",
              inverseMainTheme
                ? "border-white/10 bg-transparent shadow-[0_18px_36px_rgba(2,6,23,0.32)]"
                : "border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)]",
            )}
          >
            <div className="mb-4 sig-strong-card rounded-[20px] p-3 shadow-sm lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="sig-label sig-fit-title">{eyebrow}</p>
                  <p className={cn("sig-fit-title text-xl font-medium leading-tight text-slate-900", inverseMainTheme && "text-white")}>{title}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="sig-dark-action-btn rounded-full border-[#E5E7EB] text-slate-50"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <Menu className="mr-2 h-4 w-4 text-sky-200" />
                  Menu
                </Button>
              </div>
            </div>

            <header className="mb-6 border-b border-slate-200 pb-5">
              <div
                className="overflow-hidden rounded-[24px] border shadow-[0_14px_32px_rgba(15,42,68,0.10)]"
                style={{
                  borderColor: withAlpha(primaryColor, "0.26"),
                  background: `linear-gradient(135deg, ${darken(primaryColor, 2)} 0%, ${primaryColor} 44%, ${bannerMid} 100%)`,
                }}
              >
                <div className="border-b border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0.04)_42%,rgba(255,255,255,0.02)_100%)] px-5 py-3.5 md:px-7 lg:px-8">
                  <div className="flex flex-wrap items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/18 shadow-[0_12px_28px_rgba(2,6,23,0.18)]"
                      style={{ background: `linear-gradient(180deg, ${withAlpha(accentColor, "0.24")} 0%, rgba(255,255,255,0.10) 100%)` }}
                    >
                      <SectionGlyph className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                    <p className="text-[11px] font-normal uppercase tracking-[0.1em] text-[#D8E9F5]">{eyebrow}</p>
                    <h1 className="mt-1 sig-fit-title max-w-[56ch] text-lg font-medium leading-tight text-[#FFFFFF] md:text-[1.0625rem] lg:text-[1.125rem]" title={title}>{title}</h1>
                  </div>
                </div>
                </div>

                <div className="px-5 pb-6 pt-5 md:px-7 lg:px-8">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-6 lg:gap-7">
                    <div className="shrink-0">
                      <InstitutionalLogo
                        branding={stableHeaderBranding}
                        fallbackLabel={institutionDisplayName}
                        variant="header"
                        className="mx-auto md:mx-0"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="sig-fit-title max-w-[64ch] text-base font-medium leading-tight text-[#FFFFFF] drop-shadow-[0_2px_10px_rgba(2,6,23,0.18)] md:text-[1.02rem] lg:text-[1.08rem]" title={institutionDisplayName}>
                        {institutionDisplayName}
                      </p>
                      <p className="mt-2 max-w-[60ch] text-sm font-normal leading-5 text-[#DCEAF7] lg:text-sm">
                        {institutionDisplaySubtitle}
                      </p>

                      {/* chip do usuario removido conforme solicitado */}
                    </div>
                  </div>
                </div>
              </div>

              {(tenantSettings?.diretoriaResponsavel || tenantSettings?.diretoriaTelefone || tenantSettings?.diretoriaEmail) ? (
                <div
                  className="mt-4 overflow-hidden rounded-[10px] border shadow-sm"
                  style={{
                    borderColor: withAlpha(primaryColor, "0.24"),
                    background: `linear-gradient(90deg, ${darken(primaryColor, 10)} 0%, ${primaryColor} 54%, ${activeBg} 100%)`,
                  }}
                >
                  <div className="px-5 py-2.5 md:px-6">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white">Diretoria responsável</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 px-5 py-4 md:px-6">
                    <p className="text-sm font-medium text-white">{tenantSettings?.diretoriaResponsavel || "Diretoria do processo"}</p>
                    {tenantSettings?.diretoriaTelefone ? <p className="text-sm font-normal text-white/90">{tenantSettings.diretoriaTelefone}</p> : null}
                    {tenantSettings?.diretoriaEmail ? (
                      <p className="sig-fit-copy whitespace-nowrap text-white/90" title={tenantSettings.diretoriaEmail}>
                        {tenantSettings.diretoriaEmail}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </header>

            {children}
          </div>
        </main>
      </div>

      <footer className="mt-auto pt-8">
        <div
          className={cn(
            "sig-page-footer overflow-hidden border-t shadow-[0_-16px_36px_rgba(15,42,68,0.12)]",
            inverseMainTheme && "shadow-[0_-10px_24px_rgba(15,23,42,0.08)]",
          )}
          style={{
            borderColor: inverseMainTheme ? darken(primaryColor, 10) : darken(primaryColor, 10),
            background: `linear-gradient(135deg, ${darken(primaryColor, 2)} 0%, ${primaryColor} 48%, ${activeBg} 100%)`,
          }}
        >
          <div className="px-8 py-8 lg:px-12 lg:py-10">
            <div className="grid items-center gap-8 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,0.95fr)]">
              <div className="flex justify-center xl:justify-start xl:pl-3">
                <InstitutionalLogo
                  branding={stableFooterBranding}
                  fallbackLabel={institutionDisplayName}
                  variant="footer"
                  className="mt-3"
                />
              </div>

              <div className="flex items-start gap-4 xl:pl-2">
                <div className="mt-1 rounded-[14px] border border-white/14 bg-white/10 p-3">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-normal uppercase tracking-[0.08em] text-white">Secretaria</p>
                  <p className="max-w-[560px] text-sm font-medium leading-6 text-[#F8FBFF] lg:text-[15px]">
                    {institutionFooterTitle}
                  </p>
                  <p className="text-sm font-normal leading-6 text-[#D6E7F4] lg:text-[14px]">
                    {tenantSettings?.diretoriaResponsavel || "Diretoria de Urbanismo"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 xl:justify-center">
                <div className="mt-1 rounded-[14px] border border-white/14 bg-white/10 p-3">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-normal uppercase tracking-[0.08em] text-white">Endereço</p>
                  <p className="text-sm font-medium leading-6 text-[#F8FBFF] lg:text-[15px]">
                    {tenantSettings?.endereco || "Endereço não informado"}
                  </p>
                  <p className="text-sm font-normal leading-6 text-[#D6E7F4] lg:text-[14px]">
                    {municipality?.name
                      ? `${municipality.name}${municipality.state ? ` / ${municipality.state}` : ""}`
                      : "city" in (activeInstitution ?? {}) && activeInstitution?.city
                        ? `${activeInstitution.city}${activeInstitution?.state ? ` / ${activeInstitution.state}` : ""}`
                        : "Campo Limpo Paulista / SP"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 xl:justify-end">
                <div className="mt-1 rounded-[14px] border border-white/14 bg-white/10 p-3">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-normal uppercase tracking-[0.08em] text-white">Contato</p>
                  <p className="text-sm font-medium leading-6 text-[#F8FBFF] lg:text-[15px]">
                    {tenantSettings?.telefone || "Telefone não informado"}
                  </p>
                  <div className="flex min-w-0 items-center gap-2 text-sm font-normal leading-6 text-[#D6E7F4] lg:text-[14px]">
                    <Mail className="h-4 w-4 shrink-0 text-white/72" />
                    <span className="sig-fit-copy block text-[#D6E7F4]" title={tenantSettings?.email || "E-mail não informado"}>
                      {tenantSettings?.email || "E-mail não informado"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#0B2236] px-6 py-3 lg:px-8">
            <div className="flex items-center justify-center text-center">
              <p className="text-xs font-normal text-[#D6E6F2]">{institutionFooterSignature}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
