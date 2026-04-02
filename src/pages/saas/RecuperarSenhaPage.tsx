import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";

export function RecuperarSenhaPage() {
  const navigate = useNavigate();
  const { resetPassword, updatePassword, signOut } = useAuthGateway();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linkStep, setLinkStep] = useState(true);

  useEffect(() => {
    if (!hasSupabaseEnv || !supabase) return;

    const openPasswordStep = () => setLinkStep(false);

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("type=recovery")) {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) openPasswordStep();
      });
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        openPasswordStep();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRequestLink = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!email.trim()) {
      setError("Informe o e-mail.");
      return;
    }

    setSubmitting(true);
    const result = await resetPassword(email.trim().toLowerCase());
    if (!result.ok) {
      setError(result.message ?? "Nao foi possivel enviar o e-mail.");
    } else {
      setStatus(result.message ?? "Verifique seu e-mail.");
    }
    setSubmitting(false);
  };

  const handleSetNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmacao da senha nao confere.");
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(newPassword);
    if (!result.ok) {
      setError(result.message ?? "Nao foi possivel atualizar a senha.");
      setSubmitting(false);
      return;
    }

    await signOut();
    navigate("/acesso", { replace: true });
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
                Recuperacao institucional
              </div>
              <div className="space-y-4">
                <h1 className="max-w-[11ch] text-[clamp(34px,3.2vw,50px)] font-semibold leading-[0.95] tracking-[-0.06em] text-white">
                  {linkStep ? "Receba o link no seu e-mail." : "Defina sua nova senha."}
                </h1>
                <p className="max-w-[48ch] text-[15px] leading-7 text-slate-100/92">
                  {linkStep
                    ? "Informe o e-mail da conta. Se ela existir, enviamos um link seguro para voce criar uma nova senha, como nos servicos habituais."
                    : "Voce entrou pelo link do e-mail. Escolha uma senha forte e confirme para concluir."}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(15,33,53,0.94)_0%,rgba(13,30,48,0.88)_100%)] p-5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(4,12,20,0.18)]">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4" />
                Por seguranca
              </div>
              <p>Nunca pedimos sua senha atual por e-mail. So usamos um link temporario e criptografado.</p>
              <p className="mt-1.5 text-slate-100/85">
                O link expira apos um periodo; se precisar, solicite outro na primeira etapa.
              </p>
            </div>
          </div>

          <Card className="relative rounded-[32px] border-slate-200/90 bg-white shadow-[0_40px_100px_rgba(15,23,42,0.16)]">
            <CardHeader className="space-y-4 px-8 pb-0 pt-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  {linkStep ? <Mail className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
                </div>
                <Button asChild type="button" variant="outline" className="rounded-full">
                  <Link to="/acesso">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Link>
                </Button>
              </div>
              <CardTitle className="max-w-sm text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] text-slate-900">
                {linkStep ? "Esqueci minha senha" : "Nova senha"}
              </CardTitle>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                {linkStep
                  ? "Digite o e-mail cadastrado. Enviaremos as instrucoes para redefinir a senha."
                  : "Crie uma nova senha para a sua conta."}
              </p>
            </CardHeader>

            <CardContent className="px-8 pb-8 pt-6">
              {linkStep ? (
                <form className="space-y-5" onSubmit={handleRequestLink}>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
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
                    {submitting ? "Enviando..." : "Enviar link por e-mail"}
                  </Button>

                  <div className="rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.92)_100%)] p-4 text-sm text-slate-600 lg:hidden">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                      <ShieldCheck className="h-4 w-4" />
                      Por seguranca
                    </div>
                    <p>Voce so define a nova senha depois de abrir o link enviado ao e-mail.</p>
                  </div>
                </form>
              ) : (
                <form className="space-y-5" onSubmit={handleSetNewPassword}>
                  <div className="space-y-2">
                    <Label htmlFor="nova-senha">Nova senha</Label>
                    <Input
                      id="nova-senha"
                      type="password"
                      autoComplete="new-password"
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
                      autoComplete="new-password"
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

                  <Button
                    type="submit"
                    className="h-[56px] w-full rounded-[18px] bg-[linear-gradient(135deg,#0f172a_0%,#16365a_55%,#1a4269_100%)] text-white hover:brightness-[1.03]"
                    disabled={submitting}
                  >
                    {submitting ? "Salvando..." : "Salvar nova senha"}
                  </Button>

                  {hasSupabaseEnv ? (
                    <button
                      type="button"
                      className="w-full text-center text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                      onClick={async () => {
                        await signOut();
                        setLinkStep(true);
                        setError("");
                        setNewPassword("");
                        setConfirmPassword("");
                        if (typeof window !== "undefined") {
                          window.history.replaceState(null, "", window.location.pathname);
                        }
                      }}
                    >
                      Nao recebeu o e-mail? Solicitar novo link
                    </button>
                  ) : null}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
