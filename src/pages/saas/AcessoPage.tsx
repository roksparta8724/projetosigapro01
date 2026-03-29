import { FormEvent, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useTenant } from "@/hooks/useTenant";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { getInstitutionClientSlug, isInstitutionPubliclyAvailable } from "@/lib/platform";
import { SigaproLogo } from "@/components/platform/SigaproLogo";

const institutionalHighlights = [
  {
    title: "Protocolo e triagem",
    description: "Entrada técnica, conferência documental e controle por fila.",
    icon: ShieldCheck,
  },
  {
    title: "Análise e tramitação",
    description: "Pareceres, exigências e despacho institucional em fluxo único.",
    icon: Sparkles,
  },
  {
    title: "Financeiro e guias",
    description: "Cobrança, DAM, ISSQN e acompanhamento operacional integrado.",
    icon: CheckCircle2,
  },
  {
    title: "Acesso por perfil",
    description: "Prefeitura, analista, financeiro e profissional externo com escopo claro.",
    icon: UserRound,
  },
] as const;

export function AcessoPage() {
  const navigate = useNavigate();
  const { authenticatedRole, isAuthenticated, signIn, signOut } = useAuthGateway();
  const { institutions, getInstitutionSettings, sessionUsers } = usePlatformData();
  const tenant = useTenant();
  const [searchParams] = useSearchParams();
  const tenantSlug = searchParams.get("tenant");
  const tenantQuery =
    tenant.mode === "tenant" || !tenantSlug ? "" : `?tenant=${tenantSlug}`;
  const selectedInstitution =
    tenant.mode === "tenant"
      ? tenant.municipalityBundle?.municipality ?? null
      : institutions.filter((institution) => isInstitutionPubliclyAvailable(institution)).find(
          (institution) =>
            getInstitutionClientSlug(institution, getInstitutionSettings(institution.id)) === tenantSlug,
        ) ?? null;

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
      if (tenant.mode === "tenant" && tenant.municipalityId && result.role !== "master_admin" && result.role !== "master_ops") {
        const normalized = email.trim().toLowerCase();
        let scopeId: string | null = null;

        if (hasSupabaseEnv && supabase) {
          const { data } = await supabase.auth.getUser();
          const userId = data.user?.id;
          if (userId) {
            const profileResult = await supabase
              .from("profiles")
              .select("municipality_id")
              .eq("user_id", userId)
              .maybeSingle();
            scopeId = (profileResult.data?.municipality_id as string | null | undefined) ?? null;
          }
        }

        if (!scopeId) {
          const signedUser =
            sessionUsers.find((item) => item.email.trim().toLowerCase() === normalized) ?? null;
          scopeId = signedUser?.municipalityId ?? signedUser?.tenantId ?? null;
        }

        if (scopeId && scopeId !== tenant.municipalityId) {
          await signOut();
          setError(
            `Esta conta não está vinculada à Prefeitura ${
              tenant.municipalityName ? `de ${tenant.municipalityName}` : "deste subdomínio"
            }.`,
          );
          setSubmitting(false);
          return;
        }
      }
      navigate(resolveRedirect(result.role ?? authenticatedRole), { replace: true });
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#07111b] text-slate-100">
      <div className="relative min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(4,10,18,0.95) 0%, rgba(6,18,31,0.91) 24%, rgba(8,24,41,0.85) 58%, rgba(8,21,35,0.83) 100%), url('https://images.pexels.com/photos/834892/pexels-photo-834892.jpeg?auto=compress&cs=tinysrgb&w=1600')",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.14),transparent_20%),linear-gradient(180deg,rgba(2,6,12,0.12),rgba(2,6,12,0.42))]" />

        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center px-6 py-6 sm:px-8 min-[900px]:flex lg:px-10 xl:px-12">
          <div className="grid w-full max-w-[1460px] grid-cols-[minmax(0,1.22fr)_400px] items-stretch gap-12 min-[1200px]:max-w-[1480px] min-[1200px]:grid-cols-[minmax(0,1.56fr)_minmax(420px,440px)] min-[1200px]:gap-16 xl:gap-[72px]">
            <div />
            <div className="h-full rounded-[36px] bg-[linear-gradient(180deg,rgba(244,248,252,0.98)_0%,rgba(255,255,255,0.99)_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.18)]" />
          </div>
        </div>

        <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="grid w-full max-w-[1460px] grid-cols-1 items-start gap-10 min-[900px]:grid-cols-[minmax(0,1.22fr)_400px] min-[900px]:gap-12 min-[1200px]:max-w-[1480px] min-[1200px]:grid-cols-[minmax(0,1.56fr)_minmax(420px,440px)] min-[1200px]:gap-16 xl:gap-[72px]">
            <section className="min-w-0 overflow-hidden">
              <div className="flex w-full max-w-[760px] flex-col items-start gap-10 min-[1200px]:max-w-[820px] min-[1200px]:gap-11 xl:gap-12">
                <div className="inline-flex h-10 w-fit items-center rounded-full border border-white/24 bg-white/[0.05] px-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white shadow-[0_10px_28px_rgba(3,8,15,0.16)] backdrop-blur-md">
                  Plataforma institucional de aprovação de projetos
                </div>

                <div className="flex w-full max-w-[680px] items-center gap-6 rounded-[30px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)] px-6 py-5 shadow-[0_18px_40px_rgba(2,6,23,0.14)] backdrop-blur-[8px] min-[1200px]:max-w-[720px] min-[1200px]:gap-7">
                  <div className="flex h-[124px] w-[124px] shrink-0 items-center justify-center rounded-[26px] bg-white shadow-[0_22px_44px_rgba(15,23,42,0.22)] min-[1200px]:h-[136px] min-[1200px]:w-[136px] min-[1200px]:rounded-[28px]">
                    <SigaproLogo bare compact showInternalWordmark className="scale-[2.72]" />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <p className="text-[33px] font-bold uppercase leading-none tracking-[0.03em] text-white min-[1200px]:text-[37px]">SIGAPRO</p>
                    <p className="max-w-[420px] text-[12px] font-semibold uppercase leading-[1.45] tracking-[0.1em] text-sky-50 min-[1200px]:max-w-[470px] min-[1200px]:text-[13px]">
                      Sistema integrado de gestão e aprovação de projetos
                    </p>
                    {selectedInstitution ? (
                      <p className="sig-fit-title text-[12px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                        {selectedInstitution.name}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="max-w-[640px] space-y-5 min-[1200px]:max-w-[700px]">
                  <h1 className="max-w-[10.2ch] text-[clamp(38px,3.15vw,52px)] font-semibold leading-[0.96] tracking-[-0.065em] text-white min-[1200px]:max-w-[10.5ch] min-[1200px]:text-[clamp(42px,3.6vw,58px)] min-[1200px]:leading-[0.95] min-[1200px]:tracking-[-0.07em]">
                    Aprovação digital de projetos com padrão institucional e operação integrada.
                  </h1>
                  <p className="max-w-[560px] text-[15px] leading-[1.74] text-slate-50/92 min-[1200px]:max-w-[610px] min-[1200px]:text-[16px] min-[1200px]:leading-[1.78] xl:text-[17px]">
                    O SIGAPRO conecta protocolo, análise técnica, tramitação entre setores, guias de
                    pagamento e acompanhamento externo em uma experiência única, confiável e pronta para a
                    rotina da Prefeitura.
                  </p>
                </div>

                <div className="grid w-full max-w-[620px] grid-cols-1 gap-5 sm:grid-cols-2 min-[1200px]:max-w-[680px]">
                  {institutionalHighlights.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.title}
                        className="group flex min-h-[156px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-[26px] border border-white/20 bg-[linear-gradient(180deg,rgba(15,33,53,0.97)_0%,rgba(13,30,48,0.91)_100%)] px-5 py-5 shadow-[0_20px_44px_rgba(4,12,20,0.22)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-[2px] hover:border-white/28 hover:shadow-[0_26px_56px_rgba(4,12,20,0.30)] min-[1200px]:min-h-[164px] min-[1200px]:px-6 min-[1200px]:py-6"
                      >
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="space-y-2.5">
                          <p className="text-[17px] font-semibold leading-tight text-white min-[1200px]:text-[18px]">{item.title}</p>
                          <p className="max-w-[22ch] text-[14px] leading-[1.66] text-slate-100/94 min-[1200px]:max-w-[23ch] min-[1200px]:text-[15px] min-[1200px]:leading-[1.68]">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="flex min-w-0 items-start justify-center pt-4 min-[900px]:pt-5">
              <div className="flex w-full justify-center self-start">
                <div className="w-full max-w-[392px] min-[1200px]:max-w-[424px]">
                <div className="mb-5 flex items-center justify-center lg:hidden">
                  <div className="inline-flex items-center gap-3 rounded-[24px] border border-slate-200 bg-white/92 px-4 py-3 shadow-xl backdrop-blur">
                    <SigaproLogo compact showInternalWordmark />
                  </div>
                </div>

                <Card className="mx-auto overflow-hidden rounded-[32px] border border-slate-200/90 bg-white shadow-[0_40px_104px_rgba(15,23,42,0.18)]">
                  <CardHeader className="space-y-6 px-9 pb-0 pt-9">
                    <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#0f172a_0%,#16365a_100%)] text-white shadow-[0_18px_36px_rgba(15,23,42,0.16)]">
                      <BadgeCheck className="h-6 w-6" />
                    </div>

                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        ACESSO SEGURO
                      </p>
                      <CardTitle className="text-[1.78rem] font-semibold leading-tight tracking-[-0.03em] text-slate-950">
                        ENTRAR NO SISTEMA
                      </CardTitle>
                      <p className="max-w-md text-[15px] leading-[1.72] text-slate-700">
                        Acesse seu ambiente institucional com suas credenciais já vinculadas ao SIGAPRO.
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="px-9 pb-9 pt-7">
                    <form className="w-full space-y-6" onSubmit={handleSubmit}>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium text-slate-500">
                          E-mail
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="w-full rounded-lg border px-4 py-3"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="senha" className="text-sm font-medium text-slate-500">
                          Senha
                        </Label>
                        <div className="relative">
                          <Input
                            id="senha"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="w-full rounded-lg border px-4 py-3 pr-11"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-800"
                            onClick={() => setShowPassword((value) => !value)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <Link to={`/recuperar-senha${tenantQuery}`}>
                            Esqueceu a senha?
                          </Link>
                        </div>
                      </div>

                      {error ? (
                        <div className="rounded-lg border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                          {error}
                        </div>
                      ) : null}

                      <Button
                        type="submit"
                        className="h-12 w-full rounded-lg bg-slate-900 text-white"
                        disabled={submitting}
                      >
                        {submitting ? "Validando acesso..." : "Acessar ambiente"}
                      </Button>

                      <Button
                        asChild
                        type="button"
                        variant="outline"
                        className="h-12 w-full rounded-lg border"
                      >
                        <Link to={`/criar-conta${tenantQuery}`}>
                          Criar conta
                        </Link>
                      </Button>

                      <div className="mt-6 space-y-2 rounded-xl border bg-muted/40 p-4">
                        <p className="text-sm font-medium">Acesso inicial</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          Profissionais externos podem criar a própria conta.
                          Usuários internos da Prefeitura são cadastrados pelo administrador municipal.
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Ambiente institucional protegido</span>
                        <span className="font-medium">SIGAPRO →</span>
                      </div>
                    </form>
                  </CardContent>
                </Card>
                </div>
              </div>
            </section>
          </div>
        </div>
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
    case "property_owner":
      return "/proprietario";
    default:
      return "/master";
  }
}




