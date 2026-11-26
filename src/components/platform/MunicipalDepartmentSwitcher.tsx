import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import {beginMunicipalContextTransition,finishMunicipalContextTransition,isCurrentMunicipalContextTransition,useMunicipalContextTransition} from "@/lib/municipalContextTransition";
import { Building2, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  activateRemoteMunicipalStaffAssignment,
  listRemoteMunicipalStaffAssignments,
} from "@/integrations/backend/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { getSessionLandingPath, roleLabels } from "@/lib/platform";
import {
  getMunicipalAssignmentForAccount,
  isSwitchableMunicipalStaffRole,
  type MunicipalStaffAssignment,
} from "@/lib/municipalStaffAssignments";

export function MunicipalDepartmentSwitcher({ dark }: { dark: boolean }) {
  const { session } = usePlatformSession();
  const { refreshRemoteStore } = usePlatformData();
  const navigate = useNavigate();
  const [rows, setRows] = useState<MunicipalStaffAssignment[]>([]);
  const transition = useMunicipalContextTransition(session.id);
  const busyId = transition?.assignmentId ?? null;
  const municipalityId = session.municipalityId || session.tenantId || "";

  useEffect(() => {
    let alive = true;
    setRows([]);
    if (!session.id || session.id === "unknown" || !municipalityId ||
        !isSwitchableMunicipalStaffRole(session.role) || session.accountStatus !== "active") {
      return () => { alive = false; };
    }
    // No invented roles: only rows returned by the authenticated, scoped RPC.
    void listRemoteMunicipalStaffAssignments()
      .then((all) => { if (alive) setRows(getMunicipalAssignmentForAccount(all,session.id,municipalityId)); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [session.id,session.role,session.department,session.accountStatus,municipalityId]);

  if (rows.length < 2) return null;

  const switchTo = async (assignment: MunicipalStaffAssignment) => {
    if (busyId || assignment.isCurrent) return;
    const operation = beginMunicipalContextTransition(assignment);
    if (!operation) return;
    try {
      const activated = await activateRemoteMunicipalStaffAssignment(assignment.id);
      if (activated.profileId !== session.id ||
          activated.municipalityId !== municipalityId ||
          activated.departmentId !== assignment.departmentId) {
        throw new Error("O banco confirmou um vínculo diferente do solicitado.");
      }
      // Confirm the active context through a second authenticated database read.
      // An RPC response alone is not enough: a revoked/mismatched assignment
      // must never appear as a successful role switch in the topbar.
      const verified = getMunicipalAssignmentForAccount(
        await listRemoteMunicipalStaffAssignments(), session.id, municipalityId,
      );
      const active = verified.filter((item) => item.isCurrent);
      if (active.length !== 1 || active[0].id !== assignment.id ||
          active[0].role !== activated.role ||
          active[0].departmentId !== activated.departmentId) {
        throw new Error("O departamento ativo não foi confirmado pelo banco. Atualize os vínculos e tente novamente.");
      }
      // Refresh canonical profile, permissions and process scopes BEFORE
      // navigating or advertising the activated context.
      await refreshRemoteStore(null, assignment);
      if (!isCurrentMunicipalContextTransition(operation)) return;
      // Commit the confirmed store and navigation together, before reopening
      // operational content. No optimistic profile or success toast.
      const nextSession = {...session,role:activated.role,department:activated.departmentName,title:roleLabels[activated.role]};
      flushSync(() => {
        navigate(getSessionLandingPath(nextSession), { replace: true, state:{sigaproContextLanding:true} });
      });
    } catch (error) {
      if(isCurrentMunicipalContextTransition(operation)) toast.error(error instanceof Error ? error.message : "Não foi possível trocar o departamento.");
    } finally {
      finishMunicipalContextTransition(operation);
    }
  };

  return (
    <div data-municipal-department-switcher="true" className="mt-3">
      <DropdownMenuSeparator className={dark ? "bg-white/15" : "bg-slate-200"} />
      <DropdownMenuLabel className={dark ? "px-3 py-2 text-slate-100" : "px-3 py-2 text-slate-900"}>
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em]">Trocar departamento</span>
        <span className={dark ? "mt-1 block text-xs font-normal text-slate-300" : "mt-1 block text-xs font-normal text-slate-600"}>
          Uma sessão · perfis autorizados
        </span>
      </DropdownMenuLabel>
      <div className="max-h-[250px] space-y-1 overflow-y-auto">
        {rows.map((item) => (
          <DropdownMenuItem key={item.id} disabled={Boolean(busyId) || item.isCurrent}
            onSelect={() => { void switchTo(item); }}
            className={dark
              ? "cursor-pointer rounded-xl px-3 py-2.5 text-slate-100 focus:bg-white/10 focus:text-white"
              : "cursor-pointer rounded-xl px-3 py-2.5 text-slate-800 focus:bg-slate-100 focus:text-slate-950"}>
            <Building2 className="mr-2 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{item.departmentName}</span>
              <span className={dark ? "mt-0.5 block text-[11px] text-slate-300" : "mt-0.5 block text-[11px] text-slate-500"}>
                {roleLabels[item.role]}
              </span>
            </span>
            {item.isCurrent ? <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-300" /> : null}
          </DropdownMenuItem>
        ))}
      </div>
    </div>
  );
}
