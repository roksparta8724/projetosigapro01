import { MainContent, MainGrid, PageContainer, SideContent, StatsCards } from "@/components/platform/PageLayout";

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <PageContainer className={className}>{children}</PageContainer>;
}

export const PageMainGrid = MainGrid;
export const PageMainContent = MainContent;
export const PageSideContent = SideContent;
export const PageStatsRow = StatsCards;
