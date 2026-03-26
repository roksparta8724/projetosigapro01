import { type LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/platform/PageLayout";

interface SectionPanelProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
}

export function SectionPanel({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: SectionPanelProps) {
  return (
    <SectionCard
      title={title}
      description={description}
      icon={Icon}
      actions={actions}
      className={className}
      contentClassName={contentClassName}
      headerClassName={headerClassName}
    >
      {children}
    </SectionCard>
  );
}
