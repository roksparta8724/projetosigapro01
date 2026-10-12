import { useEffect, useState } from "react";
import { Network } from "lucide-react";
import { MunicipalOrganizationChart } from "@/components/platform/MunicipalOrganizationChart";
import { PageHero } from "@/components/platform/PageHero";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageShell } from "@/components/platform/PageShell";
import { TableCard } from "@/components/platform/TableCard";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  listRemoteMunicipalDepartments,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import { isInternalRole } from "@/lib/platform";

export function MunicipalOrganizationPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId, name: municipalityName } = useMunicipality();
  const municipalityId = municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? null;
  const [departments, setDepartments] = useState<MunicipalDepartmentRecord[]>([]);
  const [status, setStatus] = useState("Carregando organograma...");

  useEffect(() => {
    let active = true;
    if (!municipalityId || !isInternalRole(session.role)) {
      setDepartments([]);
      setStatus("Organograma disponível somente para usuários internos da Prefeitura.");
      return () => {
        active = false;
      };
    }

    void listRemoteMunicipalDepartments(municipalityId)
      .then((rows) => {
        if (!active) return;
        setDepartments(rows);
        setStatus("");
      })
      .catch((error) => {
        if (!active) return;
        setDepartments([]);
        setStatus(error instanceof Error ? error.message : "Não foi possível carregar o organograma.");
      });

    return () => {
      active = false;
    };
  }, [municipalityId, session.role]);

  return (
    <PortalFrame eyebrow="Estrutura institucional" title="Organograma municipal">
      <PageShell>
        <PageHero
          eyebrow={municipalityName || municipality?.name || "Prefeitura"}
          title="Estrutura da Prefeitura"
          description="Consulta institucional por siglas das secretarias, diretorias, departamentos, coordenadorias e setores. Nomes de servidores não são exibidos."
          icon={Network}
        />

        {status ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {status}
          </div>
        ) : null}

        <TableCard
          title="Organograma"
          description="Visão institucional de consulta para toda a equipe municipal."
          icon={Network}
        >
          <MunicipalOrganizationChart departments={departments} />
        </TableCard>
      </PageShell>
    </PortalFrame>
  );
}
