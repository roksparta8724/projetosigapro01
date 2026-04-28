import { type ComponentType } from "react";
import { SectionCard as BaseSectionCard } from "@/components/platform/PageLayout";

export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
}) {
  return (
    <BaseSectionCard
      title={title}
      description={description}
      icon={icon}
      actions={actions}
      className={className}
      contentClassName={contentClassName}
      headerClassName={headerClassName}
    >
      {children}
    </BaseSectionCard>
  );
}
