import { ArrowRight, BadgeCheck, Building2, FilePlus2, Landmark, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildInstitutionClientLink, getInstitutionClientSlug, isInstitutionPubliclyAvailable } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";

export function ClientePortalPage() {
  const { tenantSlug } = useParams();
  const { institutions, getInstitutionSettings } = usePlatformData();
  const match = institutions
    .filter((institution) => isInstitutionPubliclyAvailable(institution))
    .find((institution) => getInstitutionClientSlug(institution, getInstitutionSettings(institution.id)) === tenantSlug);

  if (!match) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <Card className="max-w-xl rounded-[28px] border-slate-200">
          <CardContent className="p-8">
            <h1 className="text-2xl font-semibold text-slate-950">Portal da Prefeitura Não Encontrado</h1>
            <p className="mt-3 text-sm text-slate-600">O link informado não está vinculado a uma prefeitura cadastrada no SIGAPRO.</p>
            <Button asChild className="mt-6 rounded-full bg-slate-950 hover:bg-slate-900">
              <Link to="/acesso">Voltar ao Acesso</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const settings = getInstitutionSettings(match.id);
  const publicLink = buildInstitutionClientLink("", match, settings);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#09111a_0%,#0f2338_35%,#eef4f8_35%,#f8fafc_100%)] px-4 py-8">
      <div className="mx-auto max-w-[1380px]">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/5 text-white backdrop-blur">
          <div className="bg-[linear-gradient(90deg,#082438_0%,#0d2f48_46%,#123a58_100%)] px-8 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#d4e7f7]">Portal Institucional do Cliente</p>
            <h1 className="mt-2 text-2xl font-semibold uppercase tracking-[0.02em] text-white">{match.name}</h1>
          </div>
          <div className="grid gap-8 px-8 py-8 lg:grid-cols-[1.05fr,0.95fr]">
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-[#bfe5ff]">{settings?.secretariaResponsavel || "Secretaria Responsável"}</p>
              <p className="mt-4 max-w-3xl text-[18px] leading-8 text-slate-100">
                Ambiente preparado para protocolo digital, análise técnica, financeiro, legislação urbanística, acompanhamento processual e controle institucional por prefeitura.
              </p>

              <div className="mt-8 grid gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">A prefeitura recebe o link único do portal e administra seus usuários internos dentro do próprio ambiente.</div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">O profissional externo acessa por esse mesmo portal, cria a conta e protocola seus projetos no tenant correto.</div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">A identidade visual, leis, parâmetros, prefixos e contato oficial permanecem vinculados a esta prefeitura.</div>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="rounded-[28px] border-0 shadow-xl">
                <CardContent className="p-6">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Landmark className="h-6 w-6" />
                  </div>
                  <p className="text-sm uppercase tracking-[0.26em] text-slate-400">Acesso da Prefeitura</p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">Administradores, analistas, fiscais, protocolo e financeiro entram por este portal.</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
                      <Link to={`/acesso?tenant=${tenantSlug}`}>
                        Entrar no Sistema
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to={`/legislacao?tenant=${tenantSlug}`}>Consultar Legislação</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-0 shadow-xl">
                <CardContent className="p-6">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#123a58] text-white">
                    <FilePlus2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm uppercase tracking-[0.26em] text-slate-400">Acesso do Profissional Externo</p>
                  <p className="mt-3 text-lg font-semibold text-slate-950">O profissional externo entra pelo portal da prefeitura correta e cria a conta vinculada ao tenant.</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button asChild className="rounded-full bg-[#123a58] hover:bg-[#0f314d]">
                      <Link to={`/criar-conta?tenant=${tenantSlug}`}>
                        Criar Conta Externa
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link to={`/acesso?tenant=${tenantSlug}`}>Já Tenho Acesso</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="rounded-[28px] border-slate-200">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center gap-2 text-slate-950">
                <BadgeCheck className="h-5 w-5" />
                <span className="font-semibold">Entrega ao Cliente</span>
              </div>
              <p className="text-sm text-slate-600">O link de entrega desta prefeitura é:</p>
              <p className="mt-2 break-all rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{publicLink}</p>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center gap-2 text-slate-950">
                <ShieldCheck className="h-5 w-5" />
                <span className="font-semibold">Configuração Mínima</span>
              </div>
              <p className="text-sm text-slate-600">Para a prefeitura operar, configure logo, leis, secretaria, prefixos, chave Pix, guias e o administrador da prefeitura.</p>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-slate-200">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center gap-2 text-slate-950">
                <Building2 className="h-5 w-5" />
                <span className="font-semibold">Fluxo de Mercado</span>
              </div>
              <p className="text-sm text-slate-600">Na prática, empresas SaaS publicam uma plataforma única, criam um portal por prefeitura e enviam ao cliente apenas o link e os usuários iniciais.</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
