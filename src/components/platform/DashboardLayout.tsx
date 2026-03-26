import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageContainer } from "@/components/platform/PageLayout";

export function DashboardLayout({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <PortalFrame title={title} eyebrow={eyebrow}>
      <PageContainer className={className}>{children}</PageContainer>
    </PortalFrame>
  );
}
