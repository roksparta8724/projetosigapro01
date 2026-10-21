import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageShell } from "@/components/platform/PageShell";
import { MunicipalCollectionSettings } from "@/components/platform/MunicipalCollectionSettings";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function CollectionSettingsPage() {
  const { municipality, scopeId, name } = useMunicipality(); const { session } = usePlatformSession();
  const municipalityId = municipality?.id || scopeId || session.tenantId || "";
  const canEdit = session.role === "master_admin" || session.role === "master_ops" || (session.role === "prefeitura_admin" && session.accessLevel >= 3);
  const isolatedQa = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
  return <PortalFrame eyebrow="Administração da Prefeitura" title="Guias e arrecadação"><PageShell>
    {isolatedQa ? <div role="status" data-collection-qa-banner="true" className="rounded-2xl border border-sky-300 bg-sky-50 px-5 py-4 text-sm font-semibold text-sky-950">
      <strong>HOMOLOGAÇÃO ISOLADA — Neon QA</strong> · Esta página usa o banco de testes da Prefeitura.
      Cobranças externas, gravações no R2 e assinaturas estão bloqueadas no servidor local para proteger a produção.
      Ao trocar de 8080 para 8081, entre novamente neste ambiente.
    </div> : null}
    {municipalityId?<MunicipalCollectionSettings municipalityId={municipalityId} municipalityName={name} readOnly={!canEdit}/>:<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">Prefeitura não identificada.</div>}
  </PageShell></PortalFrame>;
}
