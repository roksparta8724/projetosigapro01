import { type LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/platform/SectionCard";
import { Button } from "@/components/ui/button";

export type QuickActionItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
};

export function QuickActionsCard({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: QuickActionItem[];
}) {
  return (
    <SectionCard title={title} description={description}>
      <div className="space-y-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return action.href ? (
            <Button key={action.id} asChild variant="outline" className="sig-dark-action-btn h-12 w-full justify-start rounded-2xl px-4 text-left sm:h-11">
              <a href={action.href}>
                <Icon className="mr-2 h-4 w-4 shrink-0" />
                {action.label}
              </a>
            </Button>
          ) : (
            <Button key={action.id} type="button" variant="outline" className="sig-dark-action-btn h-12 w-full justify-start rounded-2xl px-4 text-left sm:h-11" onClick={action.onClick}>
              <Icon className="mr-2 h-4 w-4 shrink-0" />
              {action.label}
            </Button>
          );
        })}
      </div>
    </SectionCard>
  );
}
