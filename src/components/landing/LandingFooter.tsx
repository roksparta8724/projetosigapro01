import { Link } from "react-router-dom";
import { SigaproLogo } from "@/components/platform/SigaproLogo";

type NavItem = {
  id: string;
  label: string;
};

type LandingFooterProps = {
  navItems: readonly NavItem[];
};

export function LandingFooter({ navItems }: LandingFooterProps) {
  return (
    <footer className="border-t border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f8fc_100%)]">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_0.75fr_0.85fr] lg:px-8 xl:px-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <SigaproLogo bare compact showInternalWordmark={false} className="scale-[0.76]" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.08em] text-slate-950">SIGAPRO</p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                Sistema institucional de aprovacao de projetos
              </p>
            </div>
          </div>

          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600">
            Plataforma institucional para protocolo, analise, tramitacao e aprovacao de projetos urbanos com
            experiencia premium, leitura clara e foco em governanca municipal.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Navegacao</p>
          <div className="mt-4 space-y-3">
            {navItems.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="block text-sm font-medium text-slate-700 hover:text-slate-950">
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Acesso e contato</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <Link to="/acesso" className="block font-medium text-slate-700 hover:text-slate-950">
              Acessar sistema
            </Link>
            <a href="#contato" className="block font-medium text-slate-700 hover:text-slate-950">
              Solicitar demonstracao
            </a>
            <a href="mailto:contato@sigapro.govtech" className="block font-medium text-slate-700 hover:text-slate-950">
              contato@sigapro.govtech
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2 px-4 py-5 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 xl:px-10">
          <p>SIGAPRO. Todos os direitos reservados.</p>
          <p>Software institucional para operacao urbana, protocolo digital e governanca municipal.</p>
        </div>
      </div>
    </footer>
  );
}
