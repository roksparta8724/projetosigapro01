import { type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/platform/PageLayout";

export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  actions,
  breadcrumb,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      icon={icon}
      actions={actions}
      breadcrumb={breadcrumb}
      className={className}
    />
  );
}
