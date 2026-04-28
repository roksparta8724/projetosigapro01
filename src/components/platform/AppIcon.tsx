import type { ComponentType } from "react";
import {
  AccountCard,
  Bell,
  BookOpenText,
  Building2,
  Camera,
  Check,
  CreditCard,
  FileBarChart2,
  FileText,
  Flag,
  History,
  IdCard,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  Mail,
  MapPin,
  Menu,
  MonitorCog,
  Palette,
  PencilLine,
  Phone,
  PlusCircle,
  Power,
  ScrollText,
  Search,
  Settings2,
  ShieldPlus,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "@/components/platform/PremiumIcons";
import { cn } from "@/lib/utils";

type AppIconComponent = ComponentType<{ className?: string }>;

const iconMap: Record<string, AppIconComponent> = {
  Bell,
  BellIcon: Bell,
  BookOpenText,
  Building2,
  Camera,
  Check,
  CreditCard,
  FileBarChart2,
  FileText,
  Flag,
  History,
  IdCard,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  Mail,
  MapPin,
  Menu,
  MonitorCog,
  Palette,
  PencilLine,
  Phone,
  PlusCircle,
  Power,
  ScrollText,
  Search,
  Settings2,
  ShieldPlus,
  Trash2,
  UserRound,
  Wallet,
  X,
  AlertTriangle: ShieldPlus,
  Building: Building2,
  BuildingOffice: Building2,
  Clock3: History,
  FileCheck: FileText,
  Files: FileText,
  Grid2x2: LayoutDashboard,
  Grid3x3: LayoutDashboard,
  Home: LayoutDashboard,
  LandmarkIcon: Landmark,
  ListTodo: ListChecks,
  MailIcon: Mail,
  Shield: ShieldPlus,
  ShieldCheck: ShieldPlus,
  User: UserRound,
  UserCircle: UserRound,
  UserCog: Settings2,
  WalletCards: AccountCard,
};

function resolvePremiumIcon(icon?: AppIconComponent | null) {
  if (!icon) return null;
  const key = (icon as { displayName?: string; name?: string }).displayName || (icon as { name?: string }).name || "";
  return iconMap[key] || icon;
}

export function AppIcon({
  icon,
  className,
}: {
  icon?: AppIconComponent | null;
  className?: string;
}) {
  const Icon = resolvePremiumIcon(icon);
  if (!Icon) return null;
  return <Icon className={cn(className)} />;
}
