import { useCallback, useEffect, useState } from "react";
import { Building2, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listRemoteMunicipalStaffAssignments,
  setRemoteMunicipalStaffDepartment,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import type { MunicipalStaffAssignment } from "@/lib/municipalStaffAssignments";

export function MunicipalStaffAssignmentsEditor({
  municipalityId, profileId, currentDepartment, departments, onChanged,
}: {
  municipalityId: string;
  profileId: string;
  currentDepartment: string;
  departments: MunicipalDepartmentRecord[];
  onChanged?: () => Promise<unknown>;
}) {
  const [assignments, setAssignments] = useState<MunicipalStaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
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
    setError("");
    void listRemoteMunicipalStaffAssignments(profileId)
      .then((rows) => {
        if (!alive) return;
        if (rows.some((item) => item.profileId !== profileId || item.municipalityId !== municipalityId)) {
          throw new Error("Vínculos municipais fora do escopo autorizado.");
        }
        setAssignments(rows);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Falha ao consultar os departamentos."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [profileId, municipalityId]);

  const change = async (departmentId: string, enabled: boolean) => {
    if (savingId) return;
    setSavingId(departmentId);
    setMessage("");
    setError("");
    try {
      await setRemoteMunicipalStaffDepartment({ municipalityId, profileId, departmentId, enabled });
      await load();
      await onChanged?.();
      setMessage(enabled
        ? "Departamento autorizado. O profissional poderá escolhê-lo com o mesmo login."
        : "Vínculo retirado e registrado no histórico de acesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "O banco não confirmou a alteração.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section data-municipal-multi-department="true" className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-sky-700 dark:text-sky-300" />
        <h4 className="text-[13px] font-bold">Atuação em múltiplos departamentos</h4>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
        Um cadastro e uma senha. Autorize as unidades necessárias; o servidor escolherá o perfil operacional no topbar.
        Cada troca é validada e registrada pelo banco.
      </p>
      {loading ? <p role="status" className="mt-3 text-xs text-slate-600 dark:text-slate-300">Conferindo vínculos autorizados...</p> : null}
      {!loading && !error && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {departments.map((department) => {
            const selected = assignments.some((item) => item.departmentId === department.id) ||
              (assignments.length === 0 && department.name === currentDepartment);
            const busy = savingId === department.id;
            const isLast = selected && assignments.length <= 1;
            return (
              <div key={department.id} className="flex items-center justify-between gap-3 rounded-[15px] border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {department.code ? department.code + " · " : ""}{department.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                    {selected ? "Autorizado" : "Não autorizado"}
                  </p>
                </div>
                <Button type="button" size="sm" variant={selected ? "outline" : "default"}
                  aria-label={selected ? "Retirar " + department.name : "Autorizar " + department.name}
                  aria-pressed={selected}
                  disabled={Boolean(savingId) || isLast}
                  onClick={() => void change(department.id,!selected)}
                  className={selected
                    ? "shrink-0 border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-700 dark:text-white"
                    : "shrink-0 bg-sky-800 text-white hover:bg-sky-700"}>
                  {selected ? <><Check className="mr-1 h-3.5 w-3.5" />Ativo</> : "Autorizar"}
                  {busy ? "..." : null}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {departments.length === 0 && !loading
        ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Cadastre departamentos no organograma para atribuir acesso.</p>
        : null}
      {message ? <p role="status" className="mt-3 flex items-start gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs font-semibold text-rose-700 dark:text-rose-300">{error}</p> : null}
    </section>
  );
}
