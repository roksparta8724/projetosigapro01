import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageShell } from "@/components/platform/PageShell";
import { PlatformStaffCreator } from "@/components/platform/PlatformStaffCreator";
import { usePlatformData } from "@/hooks/usePlatformData";

export function PlatformStaffCreationPage() {
  const { refreshRemoteStore } = usePlatformData();
  return (
    <PortalFrame eyebrow="Administrador Geral" title="Equipe SIGAPRO" hideSectionHeader>
      <PageShell>
        <PlatformStaffCreator standalone onCreated={refreshRemoteStore} />
      </PageShell>
    </PortalFrame>
  );
}
