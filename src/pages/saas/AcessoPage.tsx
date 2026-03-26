import { FormEvent, useState } from "react";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { hasSupabaseEnv } from "@/integrations/supabase/client";
import { getInstitutionClientSlug } from "@/lib/platform";
import { SigaproLogo } from "@/components/platform/SigaproLogo";

export function AcessoPage() {
  const navigate = useNavigate();
  const { authenticatedRole, isAuthenticated, signIn } = useAuthGateway();
  const { institutions, getInstitutionSettings } = usePlatformData();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get("tenant");
  const selectedInstitution =
    institutions.find((institution) => getInstitutionClientSlug(institution, getInstitutionSettings(institution.id)) === tenantSlug) ?? null;
  const [email, setEmail] = useState(hasSupabaseEnv ? "" : "roksparta02@gmail.com");
  const [password, setPassword] = useState(hasSupabaseEnv ? "" : "Sigapro@2026");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={resolveRedirect(authenticatedRole)} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(result.message ?? "Não foi possível entrar.");
    } else {
      navigate(resolveRedirect(result.role ?? authenticatedRole), { replace: true });
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(25,77,119,0.32),transparent_32%),linear-gradient(180deg,#07111b_0%,#0c2032_48%,#e9f0f5_48%,#f7fafc_100%)] px-4 py-8">
      <div className="mx-auto grid max-w-[1380px] items-stretch gap-6 lg:grid-cols-[1.04fr,0.96fr]">
        <div className="rounded-[32px] border border-[#183149] bg-[linear-gradient(180deg,#1f2d3c_0%,#213244_100%)] px-8 py-9 text-white shadow-[0_30px_90px_rgba(4,12,20,0.32)] lg:px-10 lg:py-10">
          <div className="mx-auto flex h-full max-w-[760px] flex-col">
            <div className="flex justify-center">
              <SigaproLogo className="text-white" />
            </div>
            {selectedInstitution ? <p className="mt-5 break-words text-center text-[11px] uppercase tracking-[0.22em] text-[#bfe5ff]">{selectedInstitution.name}</p> : null}
            <h1 className="mx-auto mt-7 max-w-[720px] text-center text-[34px] font-semibold leading-tight tracking-[-0.03em] text-white lg:text-[38px]">
              Fluxo Completo de Aprovação Digital de Projetos, com Operação por Prefeitura e Controle de Acesso.
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-center text-sm leading-7 text-slate-200">
              Plataforma institucional para protocolo, análise, tramitação e acompanhamento de projetos em ambiente municipal.
            </p>

            <div className="mt-8 grid gap-4 text-sm text-slate-100">
              <div className="flex min-h-[80px] items-center justify-center rounded-2xl border border-white/10 bg-[#304256] px-5 py-4 text-center leading-7 text-white">
                Login por senha para todos os perfis do ecossistema.
              </div>
              <div className="flex min-h-[80px] items-center justify-center rounded-2xl border border-white/10 bg-[#304256] px-5 py-4 text-center leading-7 text-white">
                Cada profissional acessa apenas seus próprios protocolos.
              </div>
              <div className="flex min-h-[80px] items-center justify-center rounded-2xl border border-white/10 bg-[#304256] px-5 py-4 text-center leading-7 text-white">
                Cada prefeitura pode ser ativada, suspensa, personalizada e entregue com link próprio.
              </div>
            </div>

            <div className="mt-4 flex min-h-[92px] items-center justify-center rounded-[28px] border border-white/10 bg-[#304256] px-5 py-4 text-center text-sm leading-7 text-slate-100">
              Ambiente conectado ao Supabase real. Os acessos agora dependem das contas cadastradas na sua base.
            </div>
          </div>
        </div>

        <Card className="rounded-[32px] border-slate-200">
          <CardHeader className="space-y-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <CardTitle className="max-w-sm text-xl font-semibold leading-tight text-slate-900">Entrar no sistema</CardTitle>
            <p className="max-w-md text-sm leading-6 text-slate-500">Acesse seu ambiente institucional com as credenciais cadastradas.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Input
                    id="senha"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-12 rounded-2xl pr-12"
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <Link to={`/recuperar-senha${tenantSlug ? `?tenant=${tenantSlug}` : ""}`} className="text-sm text-slate-600 transition hover:text-slate-950">
                    Esqueceu a senha?
                  </Link>
                </div>
              </div>

              {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

              <Button type="submit" className="h-12 w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-900" disabled={submitting}>
                {submitting ? "Validando acesso..." : "Acessar"}
              </Button>

              <Button asChild type="button" variant="outline" className="h-12 w-full rounded-2xl">
                <Link to={`/criar-conta${tenantSlug ? `?tenant=${tenantSlug}` : ""}`}>Criar conta</Link>
              </Button>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <UserRound className="h-4 w-4" />
                  Acesso inicial
                </div>
                <p>Crie os usuários reais no Supabase e depois use os acessos cadastrados para entrar.</p>
                <p>O profissional externo pode criar a própria conta; usuários internos dependem do administrador da prefeitura.</p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function resolveRedirect(role: string | null) {
  switch (role) {
    case "prefeitura_admin":
      return "/prefeitura";
    case "analista":
      return "/prefeitura/analise";
    case "financeiro":
      return "/prefeitura/financeiro";
    case "profissional_externo":
    case "proprietario_consulta":
      return "/externo";
    default:
      return "/master";
  }
}
