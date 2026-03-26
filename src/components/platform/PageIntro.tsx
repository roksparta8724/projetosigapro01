import { type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/platform/PageLayout";

interface PageIntroProps {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export function PageIntro({ eyebrow, title, description, icon: Icon, actions, className }: PageIntroProps) {
  return <PageHeader eyebrow={eyebrow} title={title} description={description} icon={Icon} actions={actions} className={className} />;
}
