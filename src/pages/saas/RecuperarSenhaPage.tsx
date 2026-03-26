import { FormEvent, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthGateway } from "@/hooks/useAuthGateway";

export function RecuperarSenhaPage() {
  const { resetPassword } = useAuthGateway();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!email.trim()) {
      setError("Informe o e-mail.");
      return;
    }

    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmacao da senha nao confere.");
      return;
    }

    setSubmitting(true);
    const result = await resetPassword(email, newPassword);
    if (!result.ok) {
      setError(result.message ?? "Não foi possível redefinir a senha.");
    } else {
      setStatus(result.message ?? "Senha redefinida com sucesso.");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#09111a_0%,#0f2338_42%,#eef4f8_42%,#f8fafc_100%)] px-4 py-8">
      <div className="mx-auto max-w-[760px]">
        <Card className="rounded-[32px] border-slate-200">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <KeyRound className="h-6 w-6" />
              </div>
              <Button asChild type="button" variant="outline" className="rounded-full">
                <Link to="/acesso">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao login
                </Link>
              </Button>
            </div>
            <CardTitle className="max-w-sm text-xl font-semibold leading-tight text-slate-900">Redefinir senha</CardTitle>
            <p className="max-w-md text-sm leading-6 text-slate-500">Atualize o acesso com uma nova senha e mantenha o ambiente seguro.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 rounded-2xl" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input id="nova-senha" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-12 rounded-2xl" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                <Input id="confirmar-senha" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12 rounded-2xl" />
              </div>

              {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
              {status ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</div> : null}

              <Button type="submit" className="h-12 w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-900" disabled={submitting}>
                {submitting ? "Atualizando senha..." : "Salvar nova senha"}
              </Button>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <ShieldCheck className="h-4 w-4" />
                  Recuperacao de acesso
                </div>
                <p>Nos perfis de teste, a senha é atualizada imediatamente.</p>
                <p>Com Supabase ativo, o sistema também tenta enviar a redefinição por e-mail.</p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
