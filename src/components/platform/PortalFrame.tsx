import {
  Bell,
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
import { can, matchesOperationalScope, roleLabels, themePresets, type Permission } from "@/lib/platform";
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
  { to: "/prefeitura/protocolos", label: "Protocolos", icon: ScrollText, permission: "manage_tenant_users" as Permission },
  { to: "/prefeitura/analise", label: "Análise", icon: FileText, permission: "review_processes" as Permission },
  { to: "/prefeitura/financeiro", label: "Financeiro", icon: Wallet, permission: "manage_financial" as Permission },
  { to: "/notificacoes", label: "Notificações", icon: Bell, permission: "manage_own_profile" as Permission },
  { to: "/historico", label: "Histórico", icon: History, permission: "manage_own_profile" as Permission },
  { to: "/legislacao", label: "Legislação", icon: BookOpenText, permission: "manage_own_profile" as Permission },
  { to: "/externo", label: "Acesso Externo", icon: LayoutDashboard, permission: "submit_processes" as Permission },
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

function isDarkSurface(hex: string) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.56;
}

export function PortalFrame({ title, eyebrow, children }: PortalFrameProps) {
  const [topSearch, setTopSearch] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
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
  const activeInstitutionId = scopeId ?? session.tenantId;
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

  const primaryColor = themeOverride?.primary || municipalityTheme.primary || ("theme" in (activeInstitution ?? {}) ? activeInstitution?.theme.primary : undefined) || "#0F2A44";
  const accentColor = themeOverride?.accent || municipalityTheme.accent || ("theme" in (activeInstitution ?? {}) ? activeInstitution?.theme.accent : undefined) || "#5ee8d9";
  const inverseThemeHint = !!themeOverride?.inverseMain;
  const pageBackground = inverseThemeHint ? "#f8fafc" : themeOverride?.background || "#f6f8fb";
  const sidebarBase = primaryColor;
  const sidebarBottom = darken(sidebarBase, 8);
  const sidebarFill = darken(primaryColor, 10);
  const darkSidebar = isDarkSurface(sidebarFill);
  const darkTopbar = isDarkSurface(primaryColor);
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

  const visibleTenantProcesses = processes.filter((process) => matchesOperationalScope(scopeId, process));
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
    themePresets.find(
      (preset) =>
        preset.primary === primaryColor &&
        preset.accent === accentColor &&
        (preset.background || "#f6f8fb") === pageBackground &&
        !!preset.inverseMain === !!themeOverride?.inverseMain,
    ) ?? null;
  const activeThemePresetId = activeThemePreset?.id ?? null;
  const inverseMainTheme = inverseThemeHint || !!activeThemePreset?.inverseMain;

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
      className="min-h-screen text-[#1A1A1A]"
      data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}
      style={
        {
          backgroundColor: pageBackground,
          backgroundImage: sidebarExpanded
            ? `linear-gradient(90deg, var(--sig-sidebar-fill) 0px, var(--sig-sidebar-fill) 244px, ${pageBackground} 244px, ${pageBackground} 100%)`
            : "none",
          "--sig-sidebar-fill": sidebarFill,
          "--sig-inverse-accent-soft": withAlpha(accentColor, "0.08"),
          "--sig-inverse-accent-medium": withAlpha(accentColor, "0.16"),
          "--sig-inverse-accent-strong": withAlpha(accentColor, "0.28"),
          "--sig-inverse-border": withAlpha(accentColor, "0.18"),
          "--sig-inverse-icon": accentColor,
          "--sig-inverse-shell-top": darken(primaryColor, 4),
          "--sig-inverse-shell-bottom": darken(primaryColor, -2),
        } as React.CSSProperties
      }
    >
      <div
        className="fixed inset-x-0 top-0 z-50 h-[66px] shadow-[0_10px_26px_rgba(15,23,42,0.08)]"
        style={{
          borderBottom: `1px solid ${withAlpha(darken(primaryColor, 10), "0.36")}`,
          background: `linear-gradient(90deg, ${darken(primaryColor, 10)} 0%, ${primaryColor} 52%, ${bannerMid} 100%)`,
        }}
      >
        <div className="flex h-full items-center justify-between gap-4 px-4 lg:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-slate-200 bg-white p-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.12)]">
              <SigaproLogo bare compact showInternalWordmark={false} />
            </div>
            <div className="min-w-0">
              <p className={cn("truncate text-xs font-normal uppercase tracking-[0.08em]", darkTopbar ? "text-white/90" : "text-slate-900")}>SIGAPRO</p>
              <p className={cn("truncate text-xs font-normal leading-5", darkTopbar ? "text-white/70" : "text-slate-600")}>
                Plataforma institucional de projetos
              </p>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
            <Button
              type="button"
              variant="outline"
              className="h-[40px] rounded-[14px] border border-slate-200 bg-white px-3.5 text-[13px] text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950"
              onClick={() => setSidebarExpanded((current) => !current)}
            >
              <Menu className="mr-2 h-4 w-4" />
              Menu
            </Button>

            <div className="relative w-[280px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={topSearch}
                onChange={(event) => setTopSearch(event.target.value)}
                placeholder="Pesquisa rapida"
                className="h-[40px] rounded-[14px] border border-slate-200 bg-slate-50 pl-11 text-[13px] text-slate-700 shadow-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-300"
              />
            </div>

            <button
              type="button"
              onClick={() => navigate("/notificacoes")}
              className="inline-flex h-[40px] items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              aria-label="Notificações"
              title="Notificações"
            >
              <Bell className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {notificationCount}
              </span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-[40px] items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-slate-700 shadow-sm transition hover:bg-slate-50"
                  aria-label="Selecionar tema"
                  title={activeThemePreset?.label || "Tema"}
                >
                  <Palette className="h-4 w-4 text-rose-400" aria-hidden="true" />
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: primaryColor }} />
                    <span className="h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: accentColor }} />
                    <span className="h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: pageBackground }} />
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px] rounded-[18px] border border-slate-200 bg-white p-2 shadow-[0_20px_42px_rgba(15,42,68,0.18)]">
                <DropdownMenuLabel className="px-3 py-2.5">
                  <p className="text-xs uppercase tracking-[0.08em] text-slate-500">Tema do layout</p>
                  <p className="mt-1 text-sm font-normal text-slate-500">Escolha uma paleta rápida.</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {themePresets.map((preset) => (
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
                    <span className="mr-3 flex items-center gap-1.5">
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: preset.primary }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: preset.accent }} />
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-200" style={{ backgroundColor: preset.background || '#f6f8fb' }} />
                    </span>
                    <span className="flex-1 truncate">{preset.label}</span>
                    {activeThemePresetId === preset.id ? (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                        Ativo
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-[14px] px-3 py-2.5 text-[14px] text-slate-700" onClick={() => applyLayoutTheme(null)}>
                  Restaurar cores da Prefeitura
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-[40px] items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 pr-3 text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <UserAvatar
                    name={displayUserName}
                    imageUrl={userProfile?.avatarUrl}
                    size="md"
                    className="border-slate-200 bg-white"
                  />
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px] rounded-[18px] border border-slate-200 bg-white p-2 shadow-[0_20px_42px_rgba(15,42,68,0.18)]">
                <DropdownMenuLabel className="px-3 py-3">
                  <div className="flex items-start gap-3">
                    <UserAvatar name={displayUserName} imageUrl={userProfile?.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="sig-truncate text-sm font-semibold text-slate-900" title={displayUserName}>
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
                    await signOut();
                    navigate("/acesso", { replace: true });
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
                        <span className="sig-truncate" title={getSessionDisplayLabel(item)}>
                          {getSessionDisplayLabel(item)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-[12px] px-3 py-2.5 text-[13px] text-rose-700 focus:text-rose-700"
                  onClick={async () => {
                    await signOut();
                    navigate("/acesso", { replace: true });
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

      <div className="flex min-h-screen pt-[66px]">
        <AppSidebar
          pathname={location.pathname}
          groups={sidebarGroups}
          expanded={sidebarExpanded}
          inverseMain={inverseMainTheme}
          darkSurface={darkSidebar}
          footer={
            <>
              <SidebarProfilePanel
                name={displayUserName}
                role={roleLabel}
                email={session.email}
                imageUrl={userProfile?.avatarUrl}
                statusLabel={loading ? "carregando" : source === "local" ? "dados persistidos" : "ambiente remoto"}
                onClick={() => navigate("/perfil")}
                darkSurface={darkSidebar}
              />

              <Button
                type="button"
                variant="outline"
                className={cn(
                  "mt-2 h-9 w-full rounded-[14px] bg-transparent px-3 text-[12px] font-medium shadow-none",
                  darkSidebar
                    ? "border-white/18 text-white/90 hover:bg-white/[0.08] hover:text-white"
                    : "border-slate-300/80 text-slate-700 hover:bg-black/[0.04] hover:text-slate-950",
                )}
                onClick={async () => {
                  await signOut();
                  navigate("/acesso", { replace: true });
                }}
              >
                <LogOut className={cn("mr-2 h-[13px] w-[13px]", darkSidebar ? "!text-white/80" : "!text-slate-500")} />
                Sair
              </Button>
            </>
          }
        />

        <main className="min-w-0 flex-1 px-4 py-4 lg:px-6 lg:py-5 2xl:px-8">
          <div
            className={cn(
              "sig-main-shell rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 shadow-sm md:p-5 lg:p-6",
              inverseMainTheme && "border-white/10 shadow-[0_18px_36px_rgba(2,6,23,0.32)]",
            )}
          >
            <div className="mb-4 sig-strong-card rounded-[22px] p-3 shadow-sm lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="sig-label truncate">{eyebrow}</p>
                  <p className={cn("truncate text-xl font-medium leading-tight text-slate-900", inverseMainTheme && "text-white")}>{title}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-[#E5E7EB]"
                  onClick={() => setSidebarExpanded((current) => !current)}
                >
                  <Menu className="mr-2 h-4 w-4" />
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
                    <h1 className="mt-1 max-w-[56ch] truncate whitespace-nowrap text-lg font-medium leading-tight text-[#FFFFFF] md:text-[1.0625rem] lg:text-[1.125rem]" title={title}>{title}</h1>
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
                      <p className="max-w-[64ch] truncate text-base font-medium leading-tight text-[#FFFFFF] drop-shadow-[0_2px_10px_rgba(2,6,23,0.18)] md:text-[1.02rem] lg:text-[1.08rem]" title={institutionDisplayName}>
                        {institutionDisplayName}
                      </p>
                      <p className="mt-2 max-w-[60ch] text-sm font-normal leading-5 text-[#DCEAF7] lg:text-sm">
                        {institutionDisplaySubtitle}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2.5">
                        <div
                          className="sig-chip inline-flex min-w-0 items-center gap-2 rounded-full border border-white/12 px-3.5 py-2 text-[11px] font-semibold text-white shadow-[0_12px_26px_rgba(2,6,23,0.16)]"
                          style={{ background: `linear-gradient(180deg, ${withAlpha(accentColor, "0.18")} 0%, rgba(255,255,255,0.11) 100%)` }}
                        >
                          <UserAvatar
                            name={displayUserName}
                            imageUrl={userProfile?.useAvatarInHeader ? userProfile?.avatarUrl : undefined}
                            size="sm"
                            className="border-white/16 bg-white/12"
                            fallbackClassName="bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(225,235,245,0.96)_100%)] text-[#16324a]"
                          />
                          <span className="sig-truncate max-w-[28ch] text-sm font-normal leading-5" title={`${displayUserName} - ${roleLabel}`}>
                            {displayUserName} - {roleLabel}
                          </span>
                        </div>
                      </div>
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
                      <p className="sig-email sig-truncate max-w-[28ch] text-white/82" title={tenantSettings.diretoriaEmail}>
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
                    <span className="sig-email sig-truncate block text-[#D6E7F4]" title={tenantSettings?.email || "E-mail não informado"}>
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



