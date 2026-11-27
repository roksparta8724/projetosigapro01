import { useEffect, useLayoutEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Building2, CheckCircle2, LockKeyhole, ShieldCheck, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageShell } from "@/components/platform/PageShell";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { fetchPlanCapacityDashboard } from "@/hooks/usePlanCapacityLive";
import { roleLabels, roleSuggestedTitles, type UserRole } from "@/lib/platform";
import { assignRemoteProfileDepartment, listRemoteMunicipalDepartments, type MunicipalDepartmentRecord } from "@/integrations/backend/platform";

const internalRoles: UserRole[] = [
  "prefeitura_admin", "prefeitura_supervisor", "analista",
  "financeiro", "setor_intersetorial", "fiscal",
];

const rolePresets = [
  { key: "secretario_municipal", label: "Secretário Municipal", role: "prefeitura_supervisor" as UserRole, accessLevel: "3" },
  { key: "diretor_municipal", label: "Diretor Municipal", role: "prefeitura_supervisor" as UserRole, accessLevel: "2" },
  { key: "chefe_divisao", label: "Chefe de Divisão", role: "prefeitura_supervisor" as UserRole, accessLevel: "2" },
  { key: "assistente_administrativo", label: "Assistente Administrativo", role: "setor_intersetorial" as UserRole, accessLevel: "1" },
  { key: "auxiliar_administrativo", label: "Auxiliar Administrativo", role: "setor_intersetorial" as UserRole, accessLevel: "1" },
] as const;

const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

function resolvePreset(role: UserRole, title: string): string {
  return rolePresets.find((preset) => preset.role === role && clean(preset.label) === clean(title))?.key ?? role;
}

type NewStaffForm = {
  fullName: string; email: string; role: UserRole; title: string;
  department: string; accessLevel: string; temporaryPassword: string; confirmPassword: string;
};

const emptyForm = (): NewStaffForm => ({
  fullName: "", email: "", role: "analista", title: roleSuggestedTitles.analista,
  department: "", accessLevel: "1", temporaryPassword: "", confirmPassword: "",
});

type Feedback = { tone: "success" | "error" | "loading"; message: string } | null;

export function MunicipalStaffCreationPage() {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const { municipality, name: municipalityName } = useMunicipality();
  const { createTenantUser, refreshRemoteStore } = usePlatformData();
  const { maxUsers } = usePlanEntitlements();

  // O ID autenticado define o vínculo; nunca adotar uma Prefeitura em cache de outra sessão.
  const municipalityId = session.municipalityId ?? session.tenantId ?? null;
  const displayMunicipalityName = municipality?.id === municipalityId
    ? municipalityName || municipality.name
    : "Prefeitura da sessão autenticada";

  const [form, setForm] = useState<NewStaffForm>(emptyForm);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<MunicipalDepartmentRecord[]>([]);
  const [departmentState, setDepartmentState] = useState({ municipalityId: "", ready: false, error: "" });
  const [departmentRequest, setDepartmentRequest] = useState(0);

  // Uma nova rota sempre inicia no cabeçalho, mesmo após navegar no fim de uma lista grande.
  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, []);

  useEffect(() => {
    let active = true;
    setDepartments([]);
    setDepartmentState({ municipalityId: municipalityId || "", ready: false, error: "" });
    if (!municipalityId) {
      setDepartmentState({ municipalityId: "", ready: false, error: "A Prefeitura autenticada não foi identificada." });
      return () => { active = false; };
    }
    void listRemoteMunicipalDepartments(municipalityId)
      .then((rows) => {
        if (!active) return;
        setDepartments(rows);
        setDepartmentState({ municipalityId, ready: true, error: "" });
      })
      .catch((error) => {
        if (!active) return;
        setDepartmentState({
          municipalityId, ready: false,
          error: error instanceof Error ? error.message : "Não foi possível verificar os departamentos da Prefeitura.",
        });
      });
    return () => { active = false; };
  }, [municipalityId, departmentRequest]);

  const activeDepartments = useMemo(
    () => departments.filter((item) => item.isActive)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "pt-BR")),
    [departments],
  );

  const departmentVerified = Boolean(municipalityId && departmentState.municipalityId === municipalityId && departmentState.ready);
  const returnToUsers = () => navigate("/prefeitura?secao=usuarios");

  const handleRoleChange = (value: string) => {
    const preset = rolePresets.find((item) => item.key === value);
    if (preset) {
      setForm((current) => ({ ...current, role: preset.role, title: preset.label, accessLevel: preset.accessLevel }));
      return;
    }
    const role = value as UserRole;
    setForm((current) => ({
      ...current,
      role,
      title: !current.title.trim() || Object.values(roleSuggestedTitles).includes(current.title)
        ? roleSuggestedTitles[role] || "" : current.title,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const fail = (message: string) => setFeedback({ tone: "error", message });

    if (!municipalityId || !departmentVerified) {
      fail(departmentState.error || "Aguarde a confirmação da Prefeitura e dos departamentos.");
      return;
    }

    const normalizedName = form.fullName.trim();
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedTitle = form.title.trim();
    const normalizedDepartment = form.department.trim();
    const temporaryPassword = form.temporaryPassword.trim();

    if (!normalizedName || !normalizedEmail || !normalizedTitle) {
      fail("Preencha nome, e-mail e cargo/função para criar a conta.");
      return;
    }
    if (form.role !== "prefeitura_admin" && activeDepartments.length && !normalizedDepartment) {
      fail("Selecione o departamento/unidade do servidor.");
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(temporaryPassword)) {
      fail("A senha provisória precisa ter 8 caracteres ou mais, incluindo maiúscula, minúscula, número e símbolo.");
      return;
    }
    if (temporaryPassword !== form.confirmPassword) {
      fail("A confirmação da senha provisória não confere.");
      return;
    }

    setSaving(true);
    setFeedback({ tone: "loading", message: "Verificando o plano e salvando a conta..." });
    try {
      // Uma consulta de contagem contratual no momento de salvar, sem carregar 1.500 usuários
      // na tela de criação. Falhas nesta verificação não liberam cadastro além do limite.
      if (maxUsers != null) {
        const rows = await fetchPlanCapacityDashboard(municipalityId);
        const capacity = rows.find((row) => row.municipalityId === municipalityId);
        if (!capacity) throw new Error("Não foi possível confirmar a capacidade contratual desta Prefeitura.");
        if (capacity.usage.users >= maxUsers) {
          throw new Error("Limite do plano atingido: " + capacity.usage.users + "/" + maxUsers + " usuários internos. Faça upgrade antes de cadastrar outra conta.");
        }
      }

      const account = await createTenantUser({
        tenantId: municipalityId,
        fullName: normalizedName,
        email: normalizedEmail,
        role: form.role,
        title: normalizedTitle,
        accessLevel: Number(form.accessLevel) as 1 | 2 | 3,
        temporaryPassword,
      });

      const department = activeDepartments.find((item) => item.name === normalizedDepartment);
      let assignmentError = "";
      if (department) {
        try {
          await assignRemoteProfileDepartment({
            municipalityId, profileId: account.id, departmentId: department.id,
          });
        } catch (error) {
          assignmentError = error instanceof Error ? error.message : "Falha na lotação municipal.";
        }
      }

      let syncError = false;
      try { await refreshRemoteStore(); } catch { syncError = true; }
      if (assignmentError) {
        setFeedback({
          tone: "error",
          message: "A conta foi criada, mas o vínculo departamental não foi concluído: " +
            assignmentError + ". Revise as lotações na lista de usuários; não cadastre a mesma conta novamente.",
        });
        return;
      }
      setFeedback({
        tone: "success",
        message: "A conta de " + account.name + " foi criada para esta Prefeitura." +
          (syncError ? " Atualize a listagem para confirmar a exibição." : " Você pode voltar à lista ou cadastrar outra pessoa."),
      });
      setForm(emptyForm());
    } catch (error) {
      fail(error instanceof Error ? error.message : "Não foi possível criar a conta do servidor.");
    } finally {
      setSaving(false);
    }
  };

  const control = "h-11 rounded-xl border-slate-300 bg-white text-slate-950 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
  const sectionHeading = "text-base font-bold text-[#163d57] dark:text-white";

  return (
    <PortalFrame eyebrow="Administração da Prefeitura" title="Cadastrar servidor" hideSectionHeader>
      <PageShell>
        <section data-sigapro-create-user-page="dedicated" aria-labelledby="staff-page-title"
          className="min-w-0 overflow-hidden rounded-[24px] border border-[#c4d9e8] bg-[#f8fbfe] shadow-[0_16px_40px_rgba(12,41,65,0.1)] dark:border-slate-700 dark:bg-slate-900">
          <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(110deg,#0d304b,#13516e)] px-5 py-6 text-white sm:px-7">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-sky-200">Prefeitura / Gestão de usuários / Novo cadastro</p>
              <h1 id="staff-page-title" className="mt-2 text-2xl font-bold tracking-tight text-white">Cadastrar servidor</h1>
              <p className="mt-2 max-w-[640px] text-sm leading-6 text-sky-100">
                Tela exclusiva de cadastro. Sem listagens, cards de usuários ou necessidade de rolar até o fim da página.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={returnToUsers} disabled={saving}
              className="h-10 w-full shrink-0 rounded-xl border-white/30 bg-white/10 px-4 !text-white hover:bg-white/20 hover:!text-white sm:w-auto">
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />Voltar aos usuários
            </Button>
          </header>

          <form data-municipal-staff-create-form="standalone" onSubmit={handleSubmit}
            className="min-w-0 space-y-7 px-5 py-6 sm:px-7 sm:py-8">
            <section aria-labelledby="staff-identity-heading" className="space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
                <Building2 aria-hidden="true" className="mt-0.5 h-5 w-5 text-sky-800 dark:text-sky-200" />
                <div className="min-w-0">
                  <h2 id="staff-identity-heading" className={sectionHeading}>01 · Identificação institucional</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Dados vinculados à Prefeitura autenticada.</p>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="municipal-staff-municipality">Prefeitura</Label>
                  <Input id="municipal-staff-municipality" readOnly value={displayMunicipalityName}
                    className="h-11 rounded-xl border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">A unidade administrativa é determinada pela sessão; não é permitido selecionar outra Prefeitura.</p>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-name">Nome completo</Label>
                  <Input id="municipal-staff-name" required autoComplete="name" maxLength={160}
                    placeholder="Nome do servidor" value={form.fullName}
                    onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                    className={control} />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-email">E-mail institucional / acesso</Label>
                  <Input id="municipal-staff-email" type="email" required autoComplete="off"
                    placeholder="servidor@prefeitura.gov.br" value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className={control} />
                </div>
              </div>
            </section>

            <section aria-labelledby="staff-role-heading" className="space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-sky-800 dark:text-sky-200" />
                <div className="min-w-0">
                  <h2 id="staff-role-heading" className={sectionHeading}>02 · Lotação e permissões</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Perfil de trabalho, departamento e nível institucional.</p>
                </div>
              </div>
              {departmentState.error ? (
                <div role="alert" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <span>{departmentState.error}</span>
                  <Button type="button" variant="outline" className="h-9 rounded-lg border-amber-500 bg-white text-amber-950"
                    onClick={() => setDepartmentRequest((current) => current + 1)}>Tentar novamente</Button>
                </div>
              ) : null}
              {!departmentVerified && !departmentState.error ? (
                <p role="status" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Confirmando os departamentos desta Prefeitura...
                </p>
              ) : null}
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-role">Perfil interno</Label>
                  <Select value={resolvePreset(form.role, form.title)} onValueChange={handleRoleChange}>
                    <SelectTrigger id="municipal-staff-role" className={control}><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                    <SelectContent>
                      {internalRoles.map((role) => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}
                      {rolePresets.map((preset) => <SelectItem key={preset.key} value={preset.key}>{preset.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-department">Departamento / unidade</Label>
                  <Select value={form.department || "__none__"} disabled={!departmentVerified}
                    onValueChange={(value) => setForm((current) => ({ ...current, department: value === "__none__" ? "" : value }))}>
                    <SelectTrigger id="municipal-staff-department" className={control}><SelectValue placeholder="Selecione o departamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informado</SelectItem>
                      {activeDepartments.map((department) => <SelectItem key={department.id} value={department.name}>
                        {department.code ? department.code + " — " + department.name : department.name}
                      </SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">A lotação controla o escopo operacional. Outros departamentos podem ser vinculados depois.</p>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-title">Cargo / função</Label>
                  <Input id="municipal-staff-title" required maxLength={120} list="municipal-staff-title-options"
                    placeholder="Ex.: Diretor, Fiscal de Obras" value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    className={control} />
                  <datalist id="municipal-staff-title-options">
                    {["Secretário Municipal", "Diretor Municipal", "Chefe de Divisão", "Analista Técnico",
                      "Fiscal de Obras", "Assistente Administrativo", "Engenheiro Civil", "Arquiteto",
                      "Topógrafo", "Técnico em Edificações"].map((title) => <option key={title} value={title} />)}
                  </datalist>
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-access">Nível de acesso</Label>
                  <Select value={form.accessLevel} onValueChange={(value) => setForm((current) => ({ ...current, accessLevel: value }))}>
                    <SelectTrigger id="municipal-staff-access" className={control}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Nível 1 · Operacional</SelectItem>
                      <SelectItem value="2">Nível 2 · Coordenação</SelectItem>
                      <SelectItem value="3">Nível 3 · Gestão total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section aria-labelledby="staff-password-heading" className="space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
                <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 text-sky-800 dark:text-sky-200" />
                <div className="min-w-0">
                  <h2 id="staff-password-heading" className={sectionHeading}>03 · Credenciais de primeiro acesso</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Senha temporária conforme a política de segurança do SIGAPRO.</p>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-password">Senha provisória</Label>
                  <Input id="municipal-staff-password" type="password" required autoComplete="new-password"
                    value={form.temporaryPassword} placeholder="Mínimo 8 caracteres"
                    onChange={(event) => setForm((current) => ({ ...current, temporaryPassword: event.target.value }))}
                    className={control} />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="municipal-staff-password-confirm">Confirmar senha</Label>
                  <Input id="municipal-staff-password-confirm" type="password" required autoComplete="new-password"
                    value={form.confirmPassword} placeholder="Repita a senha provisória"
                    onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    className={control} />
                </div>
              </div>
              <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
                Utilize maiúscula, minúscula, número e símbolo. Se o e-mail já existir, o SIGAPRO não altera a senha atual; apenas valida o vínculo autorizado.
              </p>
            </section>

            {feedback ? (
              <div role={feedback.tone === "error" ? "alert" : "status"} aria-live="polite"
                className={feedback.tone === "success"
                  ? "flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900"
                  : feedback.tone === "error"
                    ? "rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-900"
                    : "rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold leading-6 text-sky-900"}>
                {feedback.tone === "success" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /> : null}
                <span>{feedback.message}</span>
              </div>
            ) : null}

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end dark:border-slate-700">
              <Button type="button" variant="outline" onClick={returnToUsers} disabled={saving}
                className="h-11 w-full rounded-xl border-slate-300 bg-white px-5 !text-slate-900 hover:bg-slate-100 sm:w-auto">
                Voltar à lista
              </Button>
              <Button type="submit" disabled={saving || !departmentVerified}
                className="h-11 w-full rounded-xl bg-[#0e3853] px-6 !text-white hover:bg-[#18516d] sm:w-auto">
                <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />
                {saving ? "Salvando conta..." : "Criar conta de servidor"}
              </Button>
            </footer>
          </form>
        </section>
      </PageShell>
    </PortalFrame>
  );
}
