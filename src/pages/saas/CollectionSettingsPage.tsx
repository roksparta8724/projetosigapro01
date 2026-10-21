import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageShell } from "@/components/platform/PageShell";
import { MunicipalCollectionSettings } from "@/components/platform/MunicipalCollectionSettings";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function CollectionSettingsPage() {
  const { municipality, scopeId, name } = useMunicipality(); const { session } = usePlatformSession();
  const municipalityId = municipality?.id || scopeId || session.tenantId || "";
  const canEdit = session.role === "master_admin" || session.role === "master_ops" || (session.role === "prefeitura_admin" && session.accessLevel >= 3);
  return <PortalFrame eyebrow="Administração da Prefeitura" title="Guias e arrecadação"><PageShell>{municipalityId?<MunicipalCollectionSettings municipalityId={municipalityId} municipalityName={name} readOnly={!canEdit}/>:<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Prefeitura não identificada.</div>}</PageShell></PortalFrame>;
}
