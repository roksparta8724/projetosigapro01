import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { createRemotePlatformStaffAccount } from "@/integrations/backend/platform";

type Props = { onCreated?: () => Promise<unknown>; standalone?: boolean };

export function PlatformStaffCreator({ onCreated, standalone = false }: Props) {
  const { session } = usePlatformSession();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Only platform owner can create platform operators, not municipal admins or peers.
  if (session.role !== "master_admin") {
    return (
      <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        Apenas o Administrador Geral SIGAPRO pode cadastrar funcionários da plataforma.
      </p>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setFeedback(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFeedback({ success: false, message: "Informe um e-mail válido." });
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) {
      setFeedback({ success: false, message: "Senha provisória: mínimo de 8 caracteres, maiúscula, minúscula, número e símbolo." });
      return;
    }
    if (password !== confirmation) {
      setFeedback({ success: false, message: "A confirmação da senha não confere." });
      return;
    }
    setSaving(true);
    try {
      const saved = await createRemotePlatformStaffAccount({
        fullName: name, email, temporaryPassword: password,
      });
      setName("");
      setEmail("");
      setPassword("");
      setConfirmation("");
      try {
        if (onCreated) await onCreated();
        setFeedback({ success: true, message: "Conta da equipe SIGAPRO vinculada: " + saved.email + ". O funcionário deve confirmar seu e-mail e alterar a senha provisória." });
      } catch {
        setFeedback({ success: true, message: "Conta criada para " + saved.email + ", mas a lista ainda precisa ser atualizada para exibi-la." });
      }
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : "Não foi possível cadastrar o funcionário." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-platform-staff-creator={standalone ? "dedicated" : "summary"}
      className={standalone
        ? "min-w-0 overflow-hidden rounded-[24px] border border-[#bfd5e4] bg-[#f7fafd] text-slate-900 shadow-[0_16px_36px_rgba(12,41,65,0.11)] dark:border-slate-700 dark:bg-slate-900"
        : "mt-4 min-w-0 rounded-2xl border border-sky-200 bg-white p-4 text-slate-800 shadow-sm"}>
      <div className={standalone
        ? "flex min-w-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(112deg,#0d304a,#14526f)] px-5 py-6 text-white sm:px-7"
        : "flex min-w-0 flex-wrap items-center justify-between gap-3"}>
        <div className="min-w-0 flex-1">
          <p className={standalone ? "text-2xl font-bold text-white" : "text-sm font-bold text-slate-900"}>
            {standalone ? "Cadastrar gestor operacional SIGAPRO" : "Novo colaborador SIGAPRO"}
          </p>
          <p className={standalone ? "mt-2 text-sm leading-6 text-sky-100" : "mt-1 text-xs leading-5 text-slate-600"}>
            {standalone ? "Criação protegida de conta da equipe SIGAPRO, sem vínculo municipal. O Administrador Geral (proprietário) permanece reservado." : "Crie acessos operacionais na página própria, separados dos administradores e servidores municipais."}
          </p>
        </div>
        <Button type="button"
          className={standalone
            ? "h-10 w-full rounded-xl border border-white/30 bg-white/10 !text-white hover:bg-white/20 sm:w-auto"
            : "h-10 w-full rounded-xl bg-[#103d58] !text-white hover:bg-[#18536e] sm:w-auto"}
          onClick={() => navigate(standalone ? "/master?secao=usuarios" : "/master/equipe/novo")}>
          <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />{standalone ? "Voltar à equipe" : "Criar funcionário"}
        </Button>
      </div>
      {standalone ? (
        <form data-platform-staff-form="dedicated" className="min-w-0 space-y-5 px-5 py-6 sm:px-7" onSubmit={submit}>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            O perfil Operação Geral (master_ops) possui permissões administrativas amplas. Cadastre somente pessoas autorizadas. A conta proprietária (master_admin) não pode ser duplicada por este formulário.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="sigapro-staff-name">Nome completo</Label>
              <Input id="sigapro-staff-name" required minLength={3} maxLength={120} autoComplete="off"
                value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="sigapro-staff-email">E-mail institucional</Label>
              <Input id="sigapro-staff-email" required type="email" autoComplete="off"
                value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="sigapro-staff-password">Senha provisória</Label>
              <Input id="sigapro-staff-password" type="password" required autoComplete="new-password"
                value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="sigapro-staff-confirm">Confirmar senha</Label>
              <Input id="sigapro-staff-confirm" type="password" required autoComplete="new-password"
                value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
          </div>
          <Button type="submit" disabled={saving || name.trim().length < 3 || !email.trim()} className="h-11 w-full rounded-xl bg-[#103d58] !text-white hover:bg-[#18536e] sm:w-auto">
            {saving ? "Validando e criando acesso..." : "Cadastrar gestor operacional"}
          </Button>
        </form>
      ) : null}
      {standalone && feedback ? (
        <p role={feedback.success ? "status" : "alert"}
          className={"mx-5 mb-5 rounded-xl border p-3 text-sm sm:mx-7 " +
            (feedback.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900")}>
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
