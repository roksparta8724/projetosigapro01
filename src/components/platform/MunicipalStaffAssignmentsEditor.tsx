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
        {!loading && !error ? (
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

      {!loading && !error ? (
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:grid-cols-2">
          {departments.map((department) => {
            const assignment = assignments.find((item) => item.departmentId === department.id);
            // A legacy text label is NOT an authorized assignment in Neon.
            const selected = Boolean(assignment);
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
                className={`flex min-w-0 flex-col gap-3 rounded-[17px] border p-3.5 shadow-[0_3px_12px_rgba(15,23,42,0.035)] transition-colors sm:flex-row sm:items-center sm:justify-between ${surfaceTone}`}
              >
                <div className="min-w-0">
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
                  disabled={Boolean(savingId) || isLast}
                  onClick={() => void change(department.id, !selected)}
                  className={selected
                    ? "h-9 shrink-0 rounded-xl !border-slate-300 !bg-white px-3 !text-slate-950 hover:!border-slate-400 hover:!bg-slate-100 hover:!text-slate-950 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-100 dark:!border-slate-500 dark:!bg-slate-700 dark:!text-white dark:hover:!bg-slate-600"
                    : "h-9 shrink-0 rounded-xl !bg-sky-800 px-3 !text-white hover:!bg-sky-700 hover:!text-white focus-visible:ring-2 focus-visible:ring-sky-500 dark:!bg-sky-600 dark:!text-white dark:hover:!bg-sky-500"}
                >
                  {selected ? <><Check className="mr-1 h-3.5 w-3.5" />Autorizado</> : "Autorizar"}
                  {busy ? "..." : null}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

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
        </p>
      ) : null}
    </section>
  );
}
