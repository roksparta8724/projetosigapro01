import { ArrowRight, BadgeCheck, Building2, Cable, Landmark, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformModules } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";

export function LandingPage() {
  const { cmsSections, source } = usePlatformData() as any;

  const sourceLabel =
    String(source) === "live" ? "Base real" : "Base de demonstração";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#03101c_0%,#081a2b_34%,#edf3f8_34%,#f8fafc_100%)]">

      {/* HERO */}
      <section className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 text-white lg:px-8 lg:pb-24 lg:pt-10">
        <div className="rounded-[36px] border border-white/15 bg-[linear-gradient(135deg,rgba(6,25,44,0.92)_0%,rgba(7,22,38,0.88)_55%,rgba(9,30,52,0.85)_100%)] p-6 shadow-[0_40px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:p-10">

          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">

            {/* TEXTO */}
            <div className="max-w-4xl">
              <Badge className="rounded-full border border-emerald-300/30 bg-emerald-400/20 px-4 py-1 text-[0.75rem] font-medium tracking-[0.18em] text-emerald-50">
                SIGAPRO · SISTEMA INSTITUCIONAL
              </Badge>

              <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.05] text-white lg:text-6xl">
                Aprovação digital de projetos com padrão institucional e operação integrada.
              </h1>

              <p className="mt-6 max-w-3xl text-base leading-8 text-slate-100 lg:text-lg">
                O SIGAPRO conecta protocolo, análise técnica, tramitação entre setores,
                guias de pagamento e acompanhamento externo em uma experiência única,
                confiável e pronta para a rotina da Prefeitura.
              </p>

              <p className="mt-5 text-xs font-medium uppercase tracking-[0.28em] text-emerald-100">
                Fonte de dados: {sourceLabel}
              </p>
            </div>

            {/* CARDS DIREITA */}
            <div className="grid gap-4 text-sm text-slate-100 lg:max-w-[420px]">

              <div className="rounded-2xl border border-white/15 bg-[#0b2540]/85 px-4 py-3 leading-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                Administrador geral acompanha a plataforma sem expor conteúdo sigiloso.
              </div>

              <div className="rounded-2xl border border-white/15 bg-[#0b2540]/85 px-4 py-3 leading-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                Acesso externo isolado entre profissionais.
              </div>

              <div className="rounded-2xl border border-white/15 bg-[#0b2540]/85 px-4 py-3 leading-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                Configuração de leis, identidade visual e documentos por prefeitura.
              </div>

            </div>
          </div>

          {/* BOTÕES */}
          <div className="mt-10 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-emerald-500 px-6 text-white shadow-xl shadow-emerald-900/30 hover:bg-emerald-600"
            >
              <Link to="/acesso">
                Entrar no sistema
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10"
            >
              <Link to="/master">Abrir visão administrativa</Link>
            </Button>
          </div>

        </div>
      </section>

      {/* CONTEÚDO */}
      <section className="mx-auto grid max-w-[1440px] gap-6 px-4 pb-20 lg:grid-cols-[1.25fr,0.75fr] lg:px-8">

        <Card className="rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-slate-900">
              Capacidades do SIGAPRO
            </CardTitle>
          </CardHeader>

          <CardContent className="grid gap-4 md:grid-cols-2">
            {platformModules.map((module) => (
              <div
                key={module.name}
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-xl"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>

                <h3 className="text-lg font-semibold text-slate-900">{module.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{module.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">

          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-md">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">
                Diretrizes da plataforma
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 text-sm text-slate-700">

              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <Shield className="h-5 w-5 text-slate-900" />
                Perfis separados para administrador, prefeitura, análise, financeiro e externo.
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <Cable className="h-5 w-5 text-slate-900" />
                Integração com protocolo, arrecadação e autenticação municipal.
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <BadgeCheck className="h-5 w-5 text-slate-900" />
                Estrutura pronta para comercialização como SaaS institucional.
              </div>

            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-md">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">
                Conteúdo institucional
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {cmsSections.map((entry) => (
                <div key={entry.title} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{entry.title}</p>
                    <Badge variant="outline">{entry.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{entry.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-md">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">
                Personalização por prefeitura
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 text-sm text-slate-700">

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
                  <Landmark className="h-4 w-4" />
                  Identidade institucional
                </div>
                Brasão, cores, textos e layout customizado por município.
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
                  <Building2 className="h-4 w-4" />
                  Regras urbanísticas
                </div>
                Plano diretor, checklist documental e parâmetros locais.
              </div>

            </CardContent>
          </Card>

        </div>
      </section>
    </div>
  );
}