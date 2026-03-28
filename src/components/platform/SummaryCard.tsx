import { type LucideIcon } from "lucide-react";
import { StatCard } from "@/components/platform/StatCard";

export function SummaryCard({
  title,
  value,
  helper,
  icon,
  tone = "default",
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "default" | "emerald" | "blue" | "amber" | "rose";
}) {
  return <StatCard label={title} value={value} description={helper} icon={icon} tone={tone} />;
}
