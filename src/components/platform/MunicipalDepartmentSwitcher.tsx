import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { preloadLoginLanding } from "@/lib/loginLandingAccess";
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
  const [rowState, setRowState] = useState<{profileId:string;municipalityId:string;rows:MunicipalStaffAssignment[]}|null>(null);
  const transition = useMunicipalContextTransition(session.id);
  const busyId = transition?.assignmentId ?? null;
  const municipalityId = session.municipalityId || session.tenantId || "";
  const rows = rowState?.profileId===session.id && rowState.municipalityId===municipalityId ? rowState.rows : [];
  const landingFor = (assignment:MunicipalStaffAssignment) => getSessionLandingPath({...session,role:assignment.role,department:assignment.departmentName,title:roleLabels[assignment.role]});

  useEffect(() => {
    let alive = true;
    if (!session.id || session.id === "unknown" || !municipalityId ||
        !isSwitchableMunicipalStaffRole(session.role) || session.accountStatus !== "active") {
      return () => { alive = false; };
    }
    // No invented roles: only rows returned by the authenticated, scoped RPC.
    void listRemoteMunicipalStaffAssignments()
      .then((all) => { if (alive) { const scoped=getMunicipalAssignmentForAccount(all,session.id,municipalityId);setRowState({profileId:session.id,municipalityId,rows:scoped});
        // Warm authorized route code, never data or permissions.
        const paths=[...new Set(scoped.map(landingFor))]; void Promise.allSettled(paths.map(preloadLoginLanding)); } })
      .catch(() => { if (alive) setRowState(null); });
    return () => { alive = false; };
  }, [session.id,session.role,session.department,session.accountStatus,municipalityId]);

  if (rows.length < 2 || !isSwitchableMunicipalStaffRole(session.role) || session.accountStatus!=="active") return null;

  const switchTo = async (assignment: MunicipalStaffAssignment) => {
    if (busyId || assignment.isCurrent || assignment.profileId!==session.id || assignment.municipalityId!==municipalityId) return;
    const operation = beginMunicipalContextTransition(assignment);
    if (!operation) return;
    const destination=landingFor(assignment);
    // Only downloads code; no destination component is mounted or authorized yet.
    const routeReady=preloadLoginLanding(destination).catch(()=>undefined);
    try {
      const activated = await activateRemoteMunicipalStaffAssignment(assignment.id);
      if(!isCurrentMunicipalContextTransition(operation)) return;
      if (activated.profileId !== session.id ||
          activated.municipalityId !== municipalityId ||
          activated.departmentId !== assignment.departmentId) {
        throw new Error("O banco confirmou um vínculo diferente do solicitado.");
      }
      // Confirm the active context through a second authenticated database read.
      // An RPC response alone is not enough: a revoked/mismatched assignment
      // must never appear as a successful role switch in the topbar.
      const confirmAssignment = async () => {
        const verified = getMunicipalAssignmentForAccount(
          await listRemoteMunicipalStaffAssignments(), session.id, municipalityId,
        );
        const active = verified.filter((item) => item.isCurrent);
        if (active.length !== 1 || active[0].id !== assignment.id ||
            active[0].role !== activated.role ||
            active[0].departmentId !== activated.departmentId) {
          throw new Error("O departamento ativo não foi confirmado pelo banco.");
        }
        if(isCurrentMunicipalContextTransition(operation))setRowState({profileId:session.id,municipalityId,rows:verified});
      };
      // These read-only requests are independent after the transactional switch.
      // The provider waits for confirmation BEFORE publishing the scoped store.
      await refreshRemoteStore(null, assignment, async()=>{ await Promise.all([confirmAssignment(),routeReady]); });
      if (!isCurrentMunicipalContextTransition(operation)) return;
      // Commit the confirmed store and navigation together, before reopening
      // operational content. No optimistic profile or success toast.
      const nextSession = {...session,role:activated.role,department:activated.departmentName,title:roleLabels[activated.role]};
      flushSync(() => {
        navigate(getSessionLandingPath(nextSession), { replace: true, state:{sigaproContextLanding:true} });
        finishMunicipalContextTransition(operation);
      });
    } catch {
      if(isCurrentMunicipalContextTransition(operation)) {
        // A timeout can occur after the database committed the switch.
        // Revalidate the scoped store; failure invalidates its authorization.
        try {
          const current = getMunicipalAssignmentForAccount(await listRemoteMunicipalStaffAssignments(),session.id,municipalityId).filter(item=>item.isCurrent);
          if(!isCurrentMunicipalContextTransition(operation)) return;
          if(current.length!==1) throw Error("Lotação ativa não confirmada.");
          await refreshRemoteStore(null,current[0]);
          if(!isCurrentMunicipalContextTransition(operation)) return;
          if(current[0].id===assignment.id){
            await routeReady;
            if(!isCurrentMunicipalContextTransition(operation)) return;
            flushSync(()=>{navigate(getSessionLandingPath({...session,role:current[0].role,department:current[0].departmentName,title:roleLabels[current[0].role]}),{replace:true,state:{sigaproContextLanding:true}});finishMunicipalContextTransition(operation);});
            return;
          }
        } catch {
          if(!isCurrentMunicipalContextTransition(operation)) return;
          // Force a verified refresh; on mismatch/network failure the provider
          // clears the confirmed identity rather than reopening stale data.
          try {await refreshRemoteStore(null,assignment);} catch { /* provider invalidates authorization */ }
        }
        if(isCurrentMunicipalContextTransition(operation)) toast.error("Não foi possível confirmar a troca de departamento. Tente novamente.");
      }
    } finally {
      finishMunicipalContextTransition(operation);
    }
  };

  return (
    <div data-municipal-department-switcher="true" className="mt-3">
      <DropdownMenuSeparator className={dark ? "bg-white/15" : "bg-slate-200"} />
      <DropdownMenuLabel className={dark ? "px-3 py-2 text-slate-100" : "px-3 py-2 text-slate-900"}>
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em]">Departamentos autorizados</span>
        <span className={dark ? "mt-1 block text-xs font-normal text-slate-300" : "mt-1 block text-xs font-normal text-slate-600"}>
          Escolha a unidade de trabalho
        </span>
      </DropdownMenuLabel>
      <div className="max-h-[250px] space-y-1 overflow-y-auto">
        {rows.map((item) => (
          <DropdownMenuItem key={item.id} disabled={Boolean(busyId) || item.isCurrent}
            onPointerEnter={() => { if(!busyId&&!item.isCurrent)void preloadLoginLanding(landingFor(item)).catch(()=>undefined); }}
            onFocus={() => { if(!busyId&&!item.isCurrent)void preloadLoginLanding(landingFor(item)).catch(()=>undefined); }}
            onSelect={() => { void switchTo(item); }}
            className={dark
              ? "min-h-11 cursor-pointer rounded-xl px-3 py-2.5 text-slate-100 focus:bg-white/10 focus:text-white data-[disabled]:opacity-100"
              : "min-h-11 cursor-pointer rounded-xl px-3 py-2.5 text-slate-800 focus:bg-slate-100 focus:text-slate-950 data-[disabled]:opacity-100"}>
            <Building2 className="mr-2 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold" title={item.departmentName}>{item.departmentName}</span>
              <span className={dark ? "mt-0.5 block text-[11px] text-slate-300" : "mt-0.5 block text-[11px] text-slate-500"}>
                {roleLabels[item.role]}
              </span>
            </span>
            {item.isCurrent ? <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-500 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true"/> Ativo</span> : busyId===item.id ? <span className="shrink-0 text-[10px] font-medium">Abrindo…</span> : null}
          </DropdownMenuItem>
        ))}
      </div>
    </div>
  );
}
