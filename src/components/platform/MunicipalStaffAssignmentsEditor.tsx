import { useCallback, useEffect, useState } from "react";
import { Building2, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listRemoteMunicipalStaffAssignments,
  setRemoteMunicipalStaffDepartment,
  setRemoteMunicipalStaffIdentityPrimary,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import {MUNICIPAL_AUTHORITY_UPDATED} from "@/hooks/useMunicipalAuthority";
import type {MunicipalIdentityBadge} from "@/lib/municipalAuthorityDesignations";
import type { MunicipalStaffAssignment } from "@/lib/municipalStaffAssignments";

export function MunicipalStaffAssignmentsEditor({
  municipalityId, profileId, currentDepartment, departments, onChanged, identityBadge,
}: {
  municipalityId: string;
  profileId: string;
  currentDepartment: string;
  departments: MunicipalDepartmentRecord[];
  onChanged?: () => Promise<unknown>;
  identityBadge?: MunicipalIdentityBadge;
}) {
  const [assignments, setAssignments] = useState<MunicipalStaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const rows = await listRemoteMunicipalStaffAssignments(profileId);
    if (rows.some((row) => row.profileId !== profileId || row.municipalityId !== municipalityId)) {
      throw new Error("Resposta do banco contém vínculo de outra conta ou Prefeitura.");
    }
    setAssignments(rows);
  }, [municipalityId, profileId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setHasLoaded(false);
    setAssignments([]);
    setMessage("");
    setError("");
    void listRemoteMunicipalStaffAssignments(profileId)
      .then((rows) => {
        if (!alive) return;
        if (rows.some((item) => item.profileId !== profileId || item.municipalityId !== municipalityId)) {
          throw new Error("Vínculos municipais fora do escopo autorizado.");
        }
        setAssignments(rows);
        setHasLoaded(true);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Falha ao consultar os departamentos."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [profileId, municipalityId, retryVersion]);

  const change = async (departmentId: string, enabled: boolean) => {
    if (savingId || loading || !hasLoaded) return;
    setSavingId(departmentId);
    setMessage("");
    setError("");
    try {
      await setRemoteMunicipalStaffDepartment({ municipalityId, profileId, departmentId, enabled });
      window.dispatchEvent(new Event(MUNICIPAL_AUTHORITY_UPDATED));
      setMessage(enabled
        ? "Departamento autorizado. O profissional poderá escolhê-lo com o mesmo login."
        : "Vínculo retirado e registrado no histórico de acesso.");
      try {
        await load();
      } catch {
        setHasLoaded(false);
        setError("Vínculo salvo. Não foi possível atualizar a lista; consulte novamente antes de alterar outra unidade.");
        return;
      }
      try { await onChanged?.(); } catch { setError("Vínculo salvo. Não foi possível atualizar o restante do cadastro."); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "O banco não confirmou a alteração.");
    } finally {
      setSavingId(null);
    }
  };

  const fixIdentity=async(departmentId:string|null)=>{
    if(savingId || loading || !hasLoaded)return;
    setSavingId(departmentId||"identity");setError("");setMessage("");
    try{await setRemoteMunicipalStaffIdentityPrimary(municipalityId,profileId,departmentId);window.dispatchEvent(new Event(MUNICIPAL_AUTHORITY_UPDATED));setMessage(departmentId ? "Sigla fixada antes do nome, sem alterar o departamento em uso." : "Identificação voltou a acompanhar a lotação atual.");}
    catch(e){setError(e instanceof Error?e.message:"Não foi possível fixar a identificação.");}finally{setSavingId(null);}
  };
  return (
    <section
      data-municipal-multi-department="true"
      className="min-w-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 text-slate-950 shadow-[0_10px_28px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
            <Building2 className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-bold leading-5 tracking-[-0.01em] text-slate-950 dark:text-white">
              Atuação em múltiplos departamentos
            </h4>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Um cadastro e uma senha. Autorize as unidades necessárias; o servidor escolherá o perfil operacional no topbar.
              Cada troca é validada e registrada pelo banco.
            </p>
          </div>
        </div>
        {!loading && hasLoaded ? (
          <span
            data-municipal-assignment-count="true"
            className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {assignments.length} {assignments.length === 1 ? "unidade autorizada" : "unidades autorizadas"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          Conferindo vínculos autorizados...
        </p>
      ) : null}

      {!loading && hasLoaded ? (
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:grid-cols-2">
          {departments.map((department) => {
            const assignment = assignments.find((item) => item.departmentId === department.id);
            // A legacy text label is NOT an authorized assignment in Neon.
            const selected = Boolean(assignment?.isActive);
            const legacyDepartment = !selected && assignments.length === 0 &&
              department.name.trim() === currentDepartment.trim();
            const busy = savingId === department.id;
            const isLast = selected && assignments.length <= 1;
            const isCurrent = Boolean(assignment?.isCurrent);
            const surfaceTone = isCurrent
              ? "border-emerald-300 bg-emerald-50/90 dark:border-emerald-700 dark:bg-emerald-950/45"
              : selected
                ? "border-sky-200 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/35"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/80";
            return (
              <div
                key={department.id}
                data-municipal-assignment-card="true"
                data-assignment-state={isCurrent ? "current" : selected ? "authorized" : "available"}
                className={`flex min-w-0 flex-wrap items-center gap-2 rounded-[17px] border p-3.5 shadow-[0_3px_12px_rgba(15,23,42,0.035)] transition-colors ${surfaceTone}`}
              >
                <div className="min-w-0 flex-1 basis-[130px]">
                  <p className="truncate text-[13px] font-bold leading-5 text-slate-950 dark:text-white" title={department.name}>
                    {department.code ? department.code + " · " : ""}{department.name}
                  </p>
                  <p className={`mt-1 text-[11px] font-medium leading-4 ${
                    isCurrent
                      ? "text-emerald-900 dark:text-emerald-200"
                      : selected
                        ? "text-sky-900 dark:text-sky-200"
                        : "text-slate-600 dark:text-slate-300"
                  }`}>
                    {isCurrent
                      ? "Departamento em uso"
                      : selected ? "Autorizado para troca"
                        : legacyDepartment ? "Lotação antiga — autorize para vincular" : "Não autorizado"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? "outline" : "default"}
                  aria-label={selected ? "Retirar " + department.name : "Autorizar " + department.name}
                  aria-pressed={selected}
                  disabled={Boolean(savingId) || loading || !hasLoaded || isLast}
                  onClick={() => void change(department.id, !selected)}
                  className={selected
                    ? "h-9 shrink-0 rounded-xl !border-slate-300 !bg-white px-3 !text-slate-950 hover:!border-slate-400 hover:!bg-slate-100 hover:!text-slate-950 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-100 dark:!border-slate-500 dark:!bg-slate-700 dark:!text-white dark:hover:!bg-slate-600"
                    : "h-9 shrink-0 rounded-xl !bg-sky-800 px-3 !text-white hover:!bg-sky-700 hover:!text-white focus-visible:ring-2 focus-visible:ring-sky-500 dark:!bg-sky-600 dark:!text-white dark:hover:!bg-sky-500"}
                >
                  {selected ? <><Check className="mr-1 h-3.5 w-3.5" />Autorizado</> : "Autorizar"}
                  {busy ? "..." : null}
                </Button>
                {selected&&department.code?.trim()?<label className="flex min-w-0 shrink-0 items-center gap-1.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200" title="Fixar esta lotação como sigla antes do nome"><input type="radio" name={"staff-identity-"+profileId} checked={Boolean(identityBadge?.fixed&&!identityBadge.authority&&identityBadge.departmentId===department.id)} disabled={Boolean(savingId) || loading || !hasLoaded} onChange={()=>void fixIdentity(department.id)} className="h-4 w-4 shrink-0 accent-sky-700"/><span>Fixar sigla</span></label>:null}
              </div>
            );
          })}
        </div>
      ) : null}

      {identityBadge?.fixed&&!identityBadge.authority?<div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs text-slate-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-slate-200"><span className="min-w-0">Identificação fixa: <strong>{identityBadge.code}</strong></span><Button type="button" variant="outline" size="sm" disabled={Boolean(savingId) || loading || !hasLoaded} onClick={()=>void fixIdentity(null)} className="h-8 shrink-0 rounded-lg">Usar lotação atual</Button></div>:null}
      {departments.length === 0 && !loading ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Cadastre departamentos no organograma para atribuir acesso.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold leading-5 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-950 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-100">
          {error}
          {!hasLoaded && !loading ? <Button type="button" variant="outline" size="sm" disabled={Boolean(savingId)} onClick={() => setRetryVersion(v => v + 1)} className="ml-auto h-8 shrink-0 rounded-lg border-rose-300 bg-white text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100">Tentar novamente</Button> : null}
        </p>
      ) : null}
    </section>
  );
}
