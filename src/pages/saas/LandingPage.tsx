import { ArrowRight, BadgeCheck, Building2, Cable, Landmark, Shield, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformModules } from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";

export function LandingPage() {
  const { cmsSections, source } = usePlatformData();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#061423_0%,#0c2036_32%,#eef3f8_32%,#f7f9fc_100%)]">
      <section className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 text-white lg:px-8 lg:pb-24 lg:pt-10">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur lg:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <Badge className="rounded-full border-0 bg-emerald-400/20 px-4 py-1 text-emerald-100">
                SIGAPRO · Sistema institucional de aprovação eletrônica
              </Badge>
              <h1 className="mt-6 max-w-5xl text-4xl leading-tight text-white lg:text-6xl">
                Ambiente digital para protocolo, análise e acompanhamento de projetos e obras.
              </h1>
              <p className="mt-6 max-w-3xl text-base text-slate-200 lg:text-lg">
                Estruturado para prefeituras configurarem legislação local, plano diretor, parâmetros urbanísticos, identidade institucional e fluxos internos com segurança, rastreabilidade e proteção de dados.
              </p>
              <p className="mt-4 text-sm uppercase tracking-[0.3em] text-emerald-200">
                Fonte de dados: {source === "live" ? "Base real" : "Base de demonstração"}
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">Administrador geral acompanha a plataforma sem expor conteúdo sigiloso.</div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">Acesso externo isolado entre profissionais.</div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">Configuração de leis, identidade visual e documentos por prefeitura.</div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full bg-emerald-500 px-6 text-white hover:bg-emerald-600">
              <Link to="/acesso">
                Entrar no sistema
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/20 bg-transparent px-6 text-white hover:bg-white/10">
              <Link to="/master">Abrir visão administrativa</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1440px] gap-6 px-4 pb-20 lg:grid-cols-[1.25fr,0.75fr] lg:px-8">
        <Card className="rounded-[28px] border-0 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-950">Capacidades do SIGAPRO</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {platformModules.map((module) => (
              <div key={module.name} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{module.name}</h3>
                <p className="mt-2 text-sm text-slate-600">{module.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="rounded-[28px] border-0">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Diretrizes da plataforma</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <Shield className="h-5 w-5 text-slate-900" />
                Perfis separados para administrador geral, prefeitura, análise, financeiro e acesso externo.
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <Cable className="h-5 w-5 text-slate-900" />
                Preparado para protocolo oficial, IPTU, arrecadação e autenticação municipal.
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                <BadgeCheck className="h-5 w-5 text-slate-900" />
                Área institucional para venda da plataforma, sem expor valores na página inicial.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-0">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Conteúdo institucional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cmsSections.map((entry) => (
                <div key={entry.title} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-950">{entry.title}</p>
                    <Badge variant="outline" className="rounded-full capitalize">
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-0">
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">Personalização por prefeitura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium text-slate-950">
                  <Landmark className="h-4 w-4" />
                  Identidade institucional
                </div>
                Brasão, bandeira, cores, imagens, textos e estrutura do portal.
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium text-slate-950">
                  <Building2 className="h-4 w-4" />
                  Regras urbanísticas
                </div>
                Plano diretor, uso e ocupação do solo, checklist documental e parâmetros locais.
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
