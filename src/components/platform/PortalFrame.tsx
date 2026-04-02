import {
  Bell,
  Bookmark,
  BookOpenText,
  Building2,
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
  Phone,
  ScrollText,
  Search,
  Settings2,
  UserRound,
  Wallet,
  Layers,
  PlusCircle,
  ListChecks,
  FileBarChart2,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { can, desktopThemePresets, matchesOperationalScope, mobileThemePresets, parseMarker, roleLabels, type Permission } from "@/lib/platform";
import { AppSidebar } from "@/components/platform/AppSidebar";
import { InstitutionalLogo } from "@/components/platform/InstitutionalLogo";
import { SidebarProfilePanel } from "@/components/platform/SidebarProfilePanel";
import { SigaproLogo } from "@/components/platform/SigaproLogo";
import { UserAvatar } from "@/components/platform/UserAvatar";

interface PortalFrameProps {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}

const navItems = [
  { to: "/master", label: "Administrador Geral", icon: Building2, permission: "view_master_dashboard" as Permission },
  { to: "/prefeitura", label: "Prefeitura", icon: Landmark, permission: "manage_tenant_users" as Permission },
  {
    to: "/prefeitura/protocolos",
    label: "Protocolos",
    icon: ScrollText,
    permission: "manage_tenant_users" as Permission,
    children: [
      { to: "/prefeitura/protocolos", label: "Visão geral", icon: LayoutDashboard },
      { to: "/prefeitura/protocolos/novo", label: "Novo protocolo", icon: PlusCircle },
    ],
  },
  { to: "/prefeitura/analise", label: "Análise", icon: FileText, permission: "review_processes" as Permission },
  {
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
  { to: "/notificacoes", label: "Notificações", icon: Bell, permission: "manage_own_profile" as Permission },
  { to: "/historico", label: "Histórico", icon: History, permission: "manage_own_profile" as Permission },
  { to: "/legislacao", label: "Legislação", icon: BookOpenText, permission: "manage_own_profile" as Permission },
  {
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
  { to: "/configuracoes", label: "Cadastro e Gestão", icon: Settings2, permission: "manage_tenant_branding" as Permission },
];

const managementNavItems = ["/master", "/prefeitura", "/configuracoes"];
const operationalNavItems = [
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

export function PortalFrame({ title, eyebrow, children }: PortalFrameProps) {
  const [topSearch, setTopSearch] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
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
  const { signOut } = useAuthGateway();
  const { session, sessions, setActiveSession } = usePlatformSession();
  const { municipality, tenantSettingsCompat, theme: municipalityTheme, name: municipalityName, scopeId } = useMunicipality();
  const { source, loading, institutions, getInstitutionSettings, getUserProfile, processes } = usePlatformData();
  const activeInstitutionId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const { headerBranding, footerBranding, officialHeaderText, officialFooterText } = useInstitutionBranding(activeInstitutionId);

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

  const visibleNavItems = navItems.filter((item) => can(session, item.permission));
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
  const bookmarkedProcesses = visibleTenantProcesses.filter((process) =>
    (process.tags ?? []).some((tag) => {
      const parsed = parseMarker(tag);
      return parsed.label === "marcado" || parsed.label === "favorito" || parsed.label === "favoritos";
    }),
  );
  const notificationCount = visibleTenantProcesses.reduce(
    (count, process) => count + (process.messages?.length ?? 0) + (process.dispatches?.length ?? 0),
    0,
  );

  const displayUserName = userProfile?.fullName?.trim() || session.name;
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

  const handleSignOut = async (destination = "/acesso") => {
    try {
      await signOut();
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign(destination);
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
      className="sig-app-frame min-h-screen text-[#1A1A1A]"
      data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}
      data-viewport={isMobileViewport ? "mobile" : "desktop"}
      style={
        {
          backgroundColor: pageBackground,
          "--sig-sidebar-stripe-width": sidebarExpanded ? "244px" : "0px",
          "--sig-sidebar-fill": sidebarFill,
          "--sig-inverse-accent-soft": withAlpha(accentColor, "0.08"),
          "--sig-inverse-accent-medium": withAlpha(accentColor, "0.16"),
          "--sig-inverse-accent-strong": withAlpha(accentColor, "0.28"),
          "--sig-inverse-border": withAlpha(accentColor, "0.18"),
          "--sig-inverse-icon": accentColor,
          "--sig-inverse-shell-top": darken(primaryColor, 4),
          "--sig-inverse-shell-bottom": darken(primaryColor, -2),
          "--sig-page-background": pageBackground,
        } as React.CSSProperties
      }
    >
      <div
        className="fixed inset-x-0 top-0 z-50 h-[50px] shadow-[0_10px_26px_rgba(15,23,42,0.08)] lg:h-[56px]"
        style={{
          borderBottom: `1px solid ${withAlpha(darken(primaryColor, 10), "0.36")}`,
          background: `linear-gradient(90deg, ${darken(primaryColor, 10)} 0%, ${primaryColor} 52%, ${bannerMid} 100%)`,
        }}
      >
        <div className="flex h-full items-center justify-between gap-2 px-2.5 lg:gap-4 lg:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-[10px] border border-white/14 bg-white/10 text-white shadow-[0_8px_18px_rgba(15,23,42,0.12)] transition hover:bg-white/16 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
              <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] border border-slate-200 bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.12)]">
                <SigaproLogo bare compact showInternalWordmark={false} className="scale-[0.78]" />
              </div>
              <div className="min-w-0">
                <p className={cn("sig-fit-title text-xs font-semibold uppercase tracking-[0.08em] leading-none", darkTopbar ? "text-white" : "text-slate-900")}>
                  SIGAPRO
                </p>
                <p className={cn("sig-fit-copy mt-0.5 text-[11px] font-medium leading-[1.15]", darkTopbar ? "text-white/90" : "text-slate-700")}>
                  Plataforma institucional de projetos
                </p>
              </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => navigate("/notificacoes")}
              className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-full border border-white/14 bg-white/10 text-white shadow-sm transition hover:bg-white/16"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4 text-[#facc15]" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="flex h-[32px] items-center rounded-full border border-white/14 bg-white/10 px-1.5 text-white shadow-sm transition hover:bg-white/16"
              aria-label="Meu perfil"
            >
              <UserAvatar
                name={displayUserName}
                imageUrl={userProfile?.avatarUrl}
                size="sm"
                className="border-white/14 bg-white/12"
              />
            </button>
          </div>

          <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-[40px] rounded-[14px] px-3.5 text-[13px] shadow-sm",
                darkTopbar
                  ? "sig-topbar-dark border border-white/14 bg-white/10 text-white hover:bg-white/16"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950",
              )}
              onClick={() => setSidebarExpanded((current) => !current)}
            >
              <Menu className="mr-2 h-4 w-4" />
              Menu
            </Button>

            <div className="relative w-[280px]">
              <button
                type="button"
                className={cn(
                  "absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border p-1 shadow-sm transition",
                  darkTopbar
                    ? "border-white/14 bg-white/10 text-white/85 hover:text-white"
                    : "border-slate-200/80 bg-slate-50/90 text-slate-600 hover:text-slate-800",
                )}
                aria-label="Pesquisar no sistema"
                onClick={() => {
                  const term = topSearch.trim();
                  if (!term) return;
                  navigate(`/buscar?query=${encodeURIComponent(term)}`);
                }}
              >
                <Search className={cn("h-4 w-4", darkTopbar ? "text-white/85" : "text-slate-600")} />
              </button>
              <Input
                value={topSearch}
                onChange={(event) => setTopSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const term = topSearch.trim();
                  if (!term) return;
                  navigate(`/buscar?query=${encodeURIComponent(term)}`);
                }}
                placeholder="Busca rápida"
                className={cn(
                  "h-[40px] rounded-[14px] pl-11 text-[13px] shadow-none focus-visible:ring-2",
                  darkTopbar
                    ? "sig-topbar-dark border border-white/16 bg-white/10 text-white placeholder:text-white/65 focus-visible:ring-white/30"
                    : "border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus-visible:ring-slate-300",
                )}
              />
            </div>

            <button
              type="button"
              onClick={() => navigate("/notificacoes")}
              className={cn(
                "inline-flex h-[40px] items-center gap-2 rounded-full px-3 text-xs shadow-sm transition",
                darkTopbar
                  ? "sig-topbar-dark border border-white/16 bg-white/10 text-white hover:bg-white/16"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
              aria-label="Notificações"
              title="Notificações"
            >
              <Bell className={cn("h-4 w-4", darkTopbar ? "text-amber-300" : "text-amber-500")} aria-hidden="true" />
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", darkTopbar ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600")}>
                {notificationCount}
              </span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-[40px] items-center gap-2 rounded-full px-3 text-xs shadow-sm transition",
                    darkTopbar
                      ? "sig-topbar-dark border border-white/16 bg-white/10 text-white hover:bg-white/16"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                  aria-label="Marcadores"
                  title="Marcadores"
                >
                  <Bookmark className={cn("h-4 w-4", darkTopbar ? "text-sky-200" : "text-slate-500")} />
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px]", darkTopbar ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600")}>
                    {bookmarkedProcesses.length}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px] rounded-[18px] border border-slate-200 bg-white p-2 shadow-[0_20px_42px_rgba(15,42,68,0.18)]">
                <DropdownMenuLabel className="px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Marcadores</p>
                  <p className="mt-1 text-[12px] text-slate-500">Acesso rápido aos seus processos marcados.</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {bookmarkedProcesses.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-500">Nenhum marcador ainda.</div>
                ) : (
                  bookmarkedProcesses.slice(0, 6).map((process) => (
                    <DropdownMenuItem
                      key={process.id}
                      className="rounded-[12px] px-3 py-2.5 text-[13px] text-slate-700"
                      onClick={() => navigate(`/processos/${process.id}`)}
                    >
                      <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                        {process.protocol.slice(0, 2)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{process.protocol}</span>
                        <span className="block text-xs text-slate-500">{process.title}</span>
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-[40px] items-center gap-2 rounded-full px-3 shadow-sm transition",
                    darkTopbar
                      ? "sig-topbar-dark border border-white/16 bg-white/10 text-white hover:bg-white/16"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                  aria-label="Selecionar tema"
                  title={activeThemePreset?.label || "Tema"}
                >
                  <Palette className={cn("h-4 w-4", darkTopbar ? "text-white/85" : "text-slate-500")} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[calc(100vh-70px)] w-[272px] overflow-y-auto rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-[0_20px_42px_rgba(15,42,68,0.18)] sm:max-h-[calc(100vh-88px)] sm:w-[304px]">
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-[40px] items-center gap-2 rounded-full px-2.5 pr-3 shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition hover:-translate-y-[1px]",
                    darkTopbar
                      ? "sig-topbar-dark !border-white/18 !bg-white/10 !text-white hover:!bg-white/16"
                      : "!border-slate-200 !bg-white !text-slate-900 hover:!bg-slate-50",
                  )}
                >
                  <UserAvatar
                    name={displayUserName}
                    imageUrl={userProfile?.avatarUrl}
                    size="md"
                    className={cn("bg-white", darkTopbar ? "border-white/22" : "border-slate-200")}
                  />
                  <ChevronDown className={cn("h-4 w-4", darkTopbar ? "!text-white/80" : "!text-slate-600")} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px] rounded-[18px] border border-slate-200 bg-white p-2 shadow-[0_20px_42px_rgba(15,42,68,0.18)]">
                <DropdownMenuLabel className="px-3 py-3">
                  <div className="flex items-start gap-3 rounded-[14px] border border-slate-300 bg-slate-200 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                    <UserAvatar name={displayUserName} imageUrl={userProfile?.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="sig-fit-title text-sm font-semibold text-slate-900" title={displayUserName}>
                        {displayUserName}
                      </p>
                      <p className="mt-1 text-xs font-normal text-slate-500">{roleLabel}</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-[12px] px-3 py-2.5 text-[13px] text-slate-700" onClick={() => navigate("/perfil")}>
                  <UserRound className="mr-2 h-4 w-4" />
                  Meu Perfil
                </DropdownMenuItem>
                {can(session, "manage_tenant_branding") ? (
                  <DropdownMenuItem className="rounded-[12px] px-3 py-2.5 text-[13px] text-slate-700" onClick={() => navigate("/configuracoes")}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    Configurações
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="rounded-[12px] px-3 py-2.5 text-[13px] text-slate-700"
                  onClick={async () => {
                    await handleSignOut("/acesso");
                  }}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Entrar com outra conta
                </DropdownMenuItem>
                {sessions.length > 1 ? (
                  <>
                    <DropdownMenuSeparator />
                    {sessions.map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        className={cn(
                          "rounded-[12px] px-3 py-2.5 text-[13px]",
                          item.id === session.id ? "bg-slate-100 text-slate-950" : "text-slate-700",
                        )}
                        onClick={() => setActiveSession(item.id)}
                      >
                        <UserRound className="mr-2 h-4 w-4" />
                        <span className="sig-fit-title" title={getSessionDisplayLabel(item)}>
                          {getSessionDisplayLabel(item)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-[12px] px-3 py-2.5 text-[13px] text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                  onClick={async () => {
                    await handleSignOut("/acesso");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex min-h-screen pt-[50px] lg:pt-[56px]">
        <AppSidebar
          pathname={location.pathname}
          groups={sidebarGroups}
          expanded={sidebarExpanded}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          inverseMain={inverseMainTheme}
          darkSurface={darkSidebar}
          footer={
            <div className="space-y-3">
                <SidebarProfilePanel
                  name={displayUserName}
                  role={roleLabel}
                  email={session.email}
                  imageUrl={userProfile?.avatarUrl}
                  statusLabel={loading ? "" : source === "local" ? "dados persistidos" : "ambiente remoto"}
                  onClick={() => navigate("/perfil")}
                  darkSurface={darkSidebar}
                />

              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-10 w-full rounded-[14px] px-3 text-[12px] font-semibold shadow-sm transition-all duration-200",
                  darkSidebar
                    ? "border-rose-400/20 bg-[linear-gradient(180deg,rgba(127,29,29,0.88)_0%,rgba(136,19,55,0.82)_100%)] text-rose-50 hover:bg-[linear-gradient(180deg,rgba(153,27,27,0.92)_0%,rgba(157,23,77,0.88)_100%)] hover:text-white"
                    : "border-slate-900/85 bg-slate-900 text-white hover:bg-slate-800 hover:text-white",
                )}
                onClick={async () => {
                  await handleSignOut("/acesso");
                }}
              >
                <LogOut className={cn("mr-2 h-[13px] w-[13px]", darkSidebar ? "!text-rose-50" : "!text-white/90")} />
                Sair
              </Button>
            </div>
          }
        />

        <main className="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5 2xl:px-8">
          <div
            className={cn(
              "sig-main-shell rounded-[20px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-3 shadow-sm sm:rounded-[24px] sm:p-4 md:p-5 lg:p-6",
              inverseMainTheme && "border-white/10 shadow-[0_18px_36px_rgba(2,6,23,0.32)]",
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
                        branding={headerBranding}
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
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/84">Diretoria responsável</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 px-5 py-4 md:px-6">
                    <p className="text-sm font-medium text-white">{tenantSettings?.diretoriaResponsavel || "Diretoria do processo"}</p>
                    {tenantSettings?.diretoriaTelefone ? <p className="text-sm font-normal text-white/82">{tenantSettings.diretoriaTelefone}</p> : null}
                    {tenantSettings?.diretoriaEmail ? (
                      <p className="sig-fit-copy max-w-[28ch] text-white/82" title={tenantSettings.diretoriaEmail}>
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
                  branding={footerBranding}
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
