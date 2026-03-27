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
      setError("A confirmação da senha não confere.");
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
    <div className="min-h-screen bg-[#07111b] px-4 py-8 text-slate-100">
      <div className="relative mx-auto max-w-[1120px] overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(4,10,18,0.95)_0%,rgba(6,18,31,0.91)_46%,rgba(245,248,252,0.98)_46%,rgba(255,255,255,1)_100%)] px-5 py-5 shadow-[0_30px_84px_rgba(2,6,23,0.24)] md:px-7 md:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.10),transparent_22%),linear-gradient(180deg,rgba(2,6,12,0.08),rgba(2,6,12,0.14))]" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.12fr)_420px] lg:gap-12">
          <div className="hidden flex-col justify-between rounded-[30px] border border-white/12 bg-white/[0.03] p-8 backdrop-blur-sm lg:flex">
            <div className="space-y-7">
              <div className="inline-flex h-10 w-fit items-center rounded-full border border-white/18 bg-white/[0.04] px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                Recuperação institucional
              </div>
              <div className="space-y-4">
                <h1 className="max-w-[11ch] text-[clamp(34px,3.2vw,50px)] font-semibold leading-[0.95] tracking-[-0.06em] text-white">
                  Redefina seu acesso com segurança.
                </h1>
                <p className="max-w-[48ch] text-[15px] leading-7 text-slate-100/92">
                  Atualize sua senha e retorne ao ambiente institucional com a mesma experiência segura
                  e controlada do SIGAPRO.
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(15,33,53,0.94)_0%,rgba(13,30,48,0.88)_100%)] p-5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(4,12,20,0.18)]">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4" />
                Recuperação de acesso
              </div>
              <p>Nos perfis de teste, a senha é atualizada imediatamente.</p>
              <p className="mt-1.5">
                Com Supabase ativo, o sistema também tenta enviar a redefinição por e-mail.
              </p>
            </div>
          </div>

          <Card className="relative rounded-[32px] border-slate-200/90 bg-white shadow-[0_40px_100px_rgba(15,23,42,0.16)]">
            <CardHeader className="space-y-4 px-8 pb-0 pt-8">
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
              <CardTitle className="max-w-sm text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] text-slate-900">
                Redefinir senha
              </CardTitle>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                Atualize o acesso com uma nova senha e mantenha o ambiente seguro.
              </p>
            </CardHeader>

            <CardContent className="px-8 pb-8 pt-6">
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-[54px] rounded-[18px] border-slate-200 bg-slate-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha</Label>
                  <Input
                    id="nova-senha"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="h-[54px] rounded-[18px] border-slate-200 bg-slate-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                  <Input
                    id="confirmar-senha"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="h-[54px] rounded-[18px] border-slate-200 bg-slate-50"
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600">
                    {error}
                  </div>
                ) : null}
                {status ? (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</div>
                ) : null}

                <Button
                  type="submit"
                  className="h-[56px] w-full rounded-[18px] bg-[linear-gradient(135deg,#0f172a_0%,#16365a_55%,#1a4269_100%)] text-white hover:brightness-[1.03]"
                  disabled={submitting}
                >
                  {submitting ? "Atualizando senha..." : "Salvar nova senha"}
                </Button>

                <div className="rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.92)_100%)] p-4 text-sm text-slate-600 lg:hidden">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <ShieldCheck className="h-4 w-4" />
                    Recuperação de acesso
                  </div>
                  <p>Nos perfis de teste, a senha é atualizada imediatamente.</p>
                  <p>Com Supabase ativo, o sistema também tenta enviar a redefinição por e-mail.</p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
