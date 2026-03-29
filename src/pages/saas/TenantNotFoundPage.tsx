import { useMemo } from "react";
import { Building2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTenant } from "@/hooks/useTenant";
import { getRootDomain } from "@/lib/tenant";

export function TenantNotFoundPage() {
  const tenant = useTenant();
  const rootDomain = getRootDomain();
  const title = useMemo(() => {
    if (tenant.isReserved) return "Subdomínio reservado";
    if (tenant.inactive) return "Prefeitura temporariamente indisponível";
    return "Prefeitura não encontrada";
  }, [tenant.inactive, tenant.isReserved]);

  const message = useMemo(() => {
    if (tenant.isReserved) {
      return "Este subdomínio é reservado para uso interno do SIGAPRO. Utilize o domínio principal para acessar o sistema.";
    }
    if (tenant.inactive) {
      return "Esta Prefeitura está com o acesso suspenso ou em implantação. Se precisar retomar o acesso, fale com o administrador responsável.";
    }
    return "Não localizamos uma Prefeitura ativa com este subdomínio. Verifique se o endereço está correto ou peça o link institucional atualizado.";
  }, [tenant.inactive, tenant.isReserved]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1b28] px-6 py-16 text-slate-100">
      <Card className="w-full max-w-[520px] rounded-[28px] border border-white/10 bg-[#152437] text-white shadow-[0_40px_120px_rgba(6,15,23,0.45)]">
        <CardContent className="space-y-5 p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sky-100">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            <p className="text-sm leading-relaxed text-slate-200/90">{message}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <p>
              Domínio principal: <span className="font-semibold text-white">{rootDomain}</span>
            </p>
            {tenant.subdomain ? (
              <p className="mt-1 text-slate-300">
                Subdomínio informado: <span className="font-semibold text-white">{tenant.subdomain}</span>
              </p>
            ) : null}
            {tenant.municipalityStatus ? (
              <p className="mt-1 text-slate-300">
                Status: <span className="font-semibold text-white">{tenant.municipalityStatus}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="h-11 rounded-full bg-white text-slate-900 hover:bg-slate-100">
              <a href={`https://${rootDomain}`}>
                <Home className="mr-2 h-4 w-4" />
                Ir para a página principal
              </a>
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-full border-white/20 text-white hover:bg-white/10"
              onClick={() => window.location.reload()}
            >
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
