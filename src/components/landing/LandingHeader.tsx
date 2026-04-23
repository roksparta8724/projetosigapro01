import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getPublicAssetUrl } from "@/lib/assetUrl";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
};

type LandingHeaderProps = {
  navItems: readonly NavItem[];
  onOpenDemo: () => void;
};

export function LandingHeader({ navItems, onOpenDemo }: LandingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto w-full max-w-[1660px] px-4 pt-4 sm:px-6 lg:px-7 xl:px-8 2xl:px-10">
        <div
          className={cn(
            "flex items-center justify-between rounded-full border px-4 py-3.5 transition-all duration-300 sm:px-5 lg:px-6",
            scrolled
              ? "border-white/10 bg-[linear-gradient(135deg,rgba(11,29,49,0.95),rgba(23,53,87,0.92))] shadow-[0_20px_48px_rgba(8,25,47,0.24)] backdrop-blur-xl"
              : "border-[#163657]/20 bg-[linear-gradient(135deg,rgba(15,34,57,0.9),rgba(27,58,94,0.86))] shadow-[0_16px_38px_rgba(8,25,47,0.18)] backdrop-blur-md",
          )}
        >
          <Link to="/" className="flex min-w-0 items-center gap-3.5 xl:gap-4" aria-label="SIGAPRO">
            <div className="flex aspect-square h-[66px] w-[66px] min-h-[66px] min-w-[66px] flex-none items-center justify-center rounded-[22px] bg-white p-[7px] shadow-[0_18px_34px_rgba(2,6,23,0.2)] ring-1 ring-white/80">
              <img
                src={getPublicAssetUrl("favicon-sigapro.svg")}
                alt="SIGAPRO"
                className="block h-full w-full rounded-[15px] object-contain"
              />
            </div>

            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold tracking-[0.08em] text-white sm:text-[14.5px]">SIGAPRO</p>
              <p className="hidden max-w-[280px] text-[9.8px] font-semibold uppercase leading-[1.35] tracking-[0.18em] text-blue-50/95 sm:block lg:max-w-[320px] xl:max-w-[350px] 2xl:max-w-none">
                SISTEMA INTEGRADO DE GESTAO E APROVACAO DE PROJETOS
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1.5 xl:flex" aria-label="Navegacao principal">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full px-3.5 py-2.5 text-[12.5px] font-medium text-blue-50/90 transition-colors hover:bg-white/10 hover:text-white 2xl:px-4 2xl:text-[13px]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 xl:flex">
            <Button
              variant="outline"
              className="h-12 rounded-full border-white/15 bg-white/8 px-5.5 text-sm font-semibold text-white hover:bg-white/14"
              onClick={onOpenDemo}
            >
              Solicitar demonstração
            </Button>
            <Button asChild className="h-12 rounded-full bg-white px-5.5 text-sm font-semibold text-slate-950 hover:bg-slate-100">
              <Link to="/acesso">Acessar sistema</Link>
            </Button>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="xl:hidden">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full border-white/15 bg-white/10 text-white hover:bg-white/14"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="border-slate-200 bg-white p-6">
              <SheetHeader className="text-left">
                <SheetTitle className="text-slate-950">SIGAPRO</SheetTitle>
                <SheetDescription className="leading-6 text-slate-600">
                  Navegação institucional da página pública.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-8 space-y-3">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => setOpen(false)}
                    className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                  >
                    {item.label}
                  </a>
                ))}
              </div>

              <div className="mt-8 space-y-3">
                <Button
                  type="button"
                  className="h-12 w-full rounded-full bg-slate-950 text-sm font-semibold hover:bg-slate-900"
                  onClick={() => {
                    setOpen(false);
                    onOpenDemo();
                  }}
                >
                  Solicitar demonstração
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-12 w-full rounded-full border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  <Link to="/acesso" onClick={() => setOpen(false)}>
                    Acessar sistema
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
