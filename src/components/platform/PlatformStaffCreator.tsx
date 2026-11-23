import { useState, type FormEvent } from "react";
import { ShieldAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { createRemotePlatformStaffAccount } from "@/integrations/backend/platform";

type Props = { onCreated: () => Promise<unknown> };

export function PlatformStaffCreator({ onCreated }: Props) {
  const { session } = usePlatformSession();
  const [open, setOpen] = useState(false);
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
        await onCreated();
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
    <section data-platform-staff-creator="true" className="mt-4 rounded-2xl border border-sky-200 bg-white p-4 text-slate-800 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Equipe própria SIGAPRO</p>
          <p className="mt-1 text-xs text-slate-600">Cadastre contas da plataforma, separadas dos usuários municipais.</p>
        </div>
        <Button type="button" className="rounded-xl" onClick={() => setOpen((value) => !value)}>
          <UserPlus className="mr-2 h-4 w-4" />{open ? "Fechar cadastro" : "Criar funcionário"}
        </Button>
      </div>
      {open ? (
        <form className="mt-4 space-y-4 border-t border-slate-200 pt-4" onSubmit={submit}>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            O perfil Operação Geral possui permissões administrativas amplas na plataforma. Cadastre somente funcionários autorizados. Este formulário nunca cria outro Administrador Geral.
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
          <Button type="submit" disabled={saving || name.trim().length < 3 || !email.trim()} className="rounded-xl">
            {saving ? "Validando e criando acesso..." : "Criar acesso SIGAPRO"}
          </Button>
        </form>
      ) : null}
      {feedback ? (
        <p role={feedback.success ? "status" : "alert"}
          className={"mt-3 rounded-xl border p-3 text-sm " +
            (feedback.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900")}>
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
