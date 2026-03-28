import { Copy, Eye, Printer, Receipt, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openGuiaRecolhimentoOficialWindow } from "@/components/GuiaRecolhimentoOficial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/platform/PageHero";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import {
  formatCurrency,
  getGuideObservation,
  getGuideReference,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  type PaymentGuideKind,
} from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

function buildBarcodeValue(protocol: string, guideNumber: string, amount: number) {
  const base = `${protocol.replace(/\D/g, "")}${guideNumber.replace(/\D/g, "")}${Math.round(amount * 100)}`;
  return base.padEnd(44, "7").slice(0, 44);
}

function renderBarcodeBars(code: string) {
  return code
    .split("")
    .map((digit, index) => {
      const width = Number(digit) % 3 === 0 ? 4 : Number(digit) % 2 === 0 ? 2 : 3;
      return `<span style="display:inline-block;width:${width}px;height:${index % 5 === 0 ? 44 : 38}px;background:#0f172a;margin-right:1px;"></span>`;
    })
    .join("");
}

function buildGuideHtml(input: {
  guideNumber: string;
  protocol: string;
  status: string;
  issuedAt: string;
  tenantName: string;
  secretariat: string;
  tenantAddress: string;
  tenantEmail: string;
  title: string;
  type: string;
  ownerName: string;
  ownerDocument: string;
  technicalLead: string;
  area: number;
  addressLine: string;
  amount: number;
  dueDate: string;
  pixKey: string;
  pixPayload: string;
  barcode: string;
}) {
  return `
    <html>
      <head>
        <title>${input.guideNumber}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          body { margin:0; background:#edf3f9; font-family:Arial,sans-serif; color:#0f172a; }
          .page { width:190mm; max-width:190mm; margin:0 auto; padding:8mm 0; }
          .sheet { background:white; border:1px solid #cfddea; border-radius:18px; overflow:hidden; box-shadow:0 20px 40px rgba(15,23,42,.08); }
          .topbar { background:linear-gradient(135deg,#123a58 0%,#1b4f73 58%,#1e5a80 100%); color:white; padding:18px 22px; display:flex; justify-content:space-between; }
          .brand-mark { width:54px; height:54px; border-radius:16px; background:rgba(255,255,255,.14); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:800; }
          .meta { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; padding:16px 20px 0; }
          .meta-card, .section, .pill { border:1px solid #dde7f2; border-radius:12px; background:#fbfdff; }
          .meta-card { padding:12px 13px; min-height:72px; }
          .section { margin:14px 20px 0; padding:16px; }
          .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
          .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
          .label { font-size:10px; text-transform:uppercase; letter-spacing:.16em; color:#6b7c93; margin-bottom:6px; }
          .value { font-size:13px; font-weight:700; color:#12253d; }
          .pill { padding:16px 14px; text-align:center; }
          .pill-title { font-size:10px; text-transform:uppercase; letter-spacing:.16em; color:#6b7c93; }
          .pill-value { font-size:17px; font-weight:800; color:#0f2f50; margin-top:8px; }
          .barcode { display:flex; align-items:flex-end; height:46px; overflow:hidden; }
          .barcode-number { margin-top:8px; font-size:12px; font-weight:700; letter-spacing:.12em; word-break:break-all; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="sheet">
            <div class="topbar">
              <div style="display:flex;gap:16px;align-items:flex-start;">
                <div class="brand-mark">P</div>
                <div>
                  <div style="font-size:28px;font-weight:700;">DAM MUNICIPAL</div>
                  <div style="font-size:17px;font-weight:700;line-height:1.5;margin-top:6px;text-transform:uppercase;">${input.tenantName}</div>
                  <div style="font-size:12px;line-height:1.6;letter-spacing:.12em;text-transform:uppercase;color:#bfe5ff;">${input.secretariat}</div>
                  <div style="font-size:11px;line-height:1.6;margin-top:4px;color:#d9e9f7;">${input.tenantAddress}</div>
                  <div style="font-size:11px;line-height:1.6;color:#d9e9f7;">${input.tenantEmail}</div>
                </div>
              </div>
              <div style="text-align:right;font-size:11px;line-height:1.5;">Emissão<br/><strong>${input.issuedAt}</strong></div>
            </div>
            <div class="meta">
              <div class="meta-card"><div class="label">Protocolo</div><div class="value">${input.protocol}</div></div>
              <div class="meta-card"><div class="label">Guia</div><div class="value">${input.guideNumber}</div></div>
              <div class="meta-card"><div class="label">Status</div><div class="value">${input.status}</div></div>
              <div class="meta-card"><div class="label">Valor</div><div class="value">${formatCurrency(input.amount)}</div></div>
            </div>
            <div class="section">
              <div style="font-size:14px;font-weight:700;color:#0f2f50;margin-bottom:14px;">Dados do projeto</div>
              <div class="grid">
                <div><div class="label">Projeto</div><div class="value">${input.title}</div></div>
                <div><div class="label">Tipo</div><div class="value">${input.type}</div></div>
                <div><div class="label">Proprietário</div><div class="value">${input.ownerName}</div></div>
                <div><div class="label">CPF/CNPJ</div><div class="value">${input.ownerDocument}</div></div>
                <div style="grid-column:span 2;"><div class="label">Endereço</div><div class="value">${input.addressLine}</div></div>
                <div><div class="label">Área total</div><div class="value">${input.area.toFixed(0)} m²</div></div>
                <div><div class="label">Responsável</div><div class="value">${input.technicalLead}</div></div>
              </div>
            </div>
            <div class="section">
              <div class="grid-3">
                <div class="pill"><div class="pill-title">Valor da guia</div><div class="pill-value">${formatCurrency(input.amount)}</div></div>
                <div class="pill"><div class="pill-title">Vencimento</div><div class="pill-value">${input.dueDate}</div></div>
                <div class="pill"><div class="pill-title">Chave PIX</div><div class="pill-value" style="font-size:12px">${input.pixKey || "Não configurado"}</div></div>
              </div>
            </div>
            <div class="section">
              <div style="font-size:14px;font-weight:700;color:#0f2f50;margin-bottom:14px;">Pagamento</div>
              <div style="border:1px solid #dce6f0;border-radius:12px;padding:12px;background:white;">
                <div class="label">PIX copia e cola</div>
                <div class="value" style="word-break:break-all;">${input.pixPayload}</div>
                <div style="margin-top:12px;" class="label">Código de barras</div>
                <div class="barcode">${renderBarcodeBars(input.barcode)}</div>
                <div class="barcode-number">${input.barcode}</div>
              </div>
            </div>
          </div>
        </div>
        <script>window.print();</script>
      </body>
    </html>
  `;
}

function FinanceSectionNav() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link to="/prefeitura/financeiro">
        <Button
          type="button"
          variant="outline"
          className="sig-dark-ghost-btn rounded-full border font-medium text-slate-100"
        >
          Visão geral
        </Button>
      </Link>
      <Link to="/prefeitura/financeiro/protocolos">
        <Button
          type="button"
          className="rounded-full border border-sky-300/30 bg-[linear-gradient(135deg,#0f4a7a_0%,#2f6ea8_100%)] text-white shadow-[0_12px_24px_rgba(15,23,42,0.24)] hover:brightness-105"
        >
          Guias e recolhimento
        </Button>
      </Link>
      <Link to="/prefeitura/financeiro/iptu">
        <Button
          type="button"
          variant="outline"
          className="sig-dark-ghost-btn rounded-full border font-medium text-slate-100"
        >
          IPTU e ISSQN
        </Button>
      </Link>
    </div>
  );
}

export function FinanceProtocolsPage() {
  const { session } = usePlatformSession();
  const { scopeId, institutionSettingsCompat, name: municipalityName } = useMunicipality();
  const { processes: allProcesses, markGuideAsPaid, getInstitutionSettings } = usePlatformData();
  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(scopeId ?? session.tenantId);
  const processes = getVisibleProcessesByScope(session, scopeId, allProcesses);
  const [copiedPayload, setCopiedPayload] = useState("");

  const paymentGuides = processes.flatMap((process) =>
    getProcessPaymentGuides(process, tenantSettings).map((guide) => ({ process, guide })),
  );

  const pendingValue = paymentGuides
    .filter(({ guide }) => guide.status === "pendente")
    .reduce((sum, { guide }) => sum + guide.amount, 0);
  const settledValue = paymentGuides
    .filter(({ guide }) => guide.status === "compensada")
    .reduce((sum, { guide }) => sum + guide.amount, 0);

  const copyPixPayload = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedPayload(payload);
    } catch {
      setCopiedPayload("");
    }
  };

  const openGuide = (processId: string, guideKind: PaymentGuideKind, autoPrint = true) => {
    const match = paymentGuides.find(
      ({ process, guide }) => process.id === processId && guide.kind === guideKind,
    );
    if (!match) return;
    const barcode = buildBarcodeValue(match.process.protocol, match.guide.code, match.guide.amount);

    openGuiaRecolhimentoOficialWindow(
      {
        prefeitura: {
          nome:
            municipalityName ||
            tenantSettings?.beneficiarioArrecadacao ||
            "Prefeitura Municipal",
          secretaria: tenantSettings?.secretariaResponsavel || "Secretaria responsável",
          endereco: tenantSettings?.endereco || "Endereço não configurado",
          cidade: "",
          uf: "",
          telefone: tenantSettings?.telefone || "",
          logoUrl: tenantSettings?.logoUrl || tenantSettings?.brasaoUrl || "",
          cadastroTitulo: "Cadastro Eventual",
        },
        contribuinte: {
          nome: match.process.ownerName,
          cpfCnpj: match.process.ownerDocument,
          endereco: match.process.address,
          numeroCadastro: match.process.property.registration || match.process.protocol,
        },
        guia: {
          numeroGuia: match.guide.code,
          exercicio: new Date(match.guide.issuedAt || Date.now()).getFullYear().toString(),
          dataDocumento: match.guide.issuedAt || new Date().toISOString(),
          vencimento: match.guide.dueDate,
          funcionarioResponsavel: session.name,
          referencia: getGuideReference(match.guide.kind),
          observacao: getGuideObservation(match.guide.kind),
          valorDocumento: match.guide.amount,
          descontos: 0,
          outrosAcrescimos: 0,
          valorCobrado: match.guide.amount,
          linhaDigitavel: barcode,
          codigoBarras: barcode,
          qrCodePixUrl: "",
          autenticacaoMecanica: "",
        },
        itens: [
          {
            ano: new Date(match.guide.issuedAt || Date.now()).getFullYear().toString(),
            divida: match.guide.label,
            tabela: tenantSettings?.guiaPrefixo || "DAM",
            sb: "",
            pc: "",
            principal: match.guide.amount,
            multa: 0,
            juros: 0,
            correcao: 0,
            total: match.guide.amount,
          },
        ],
      },
      {
        title: `Guia ${match.guide.code}`,
        autoPrint,
      },
    );
  };

  return (
    <PortalFrame eyebrow="Financeiro municipal" title="Guias DAM e controle de arrecadação">
      <PageShell>
        <PageHero
          eyebrow="Arrecadação municipal"
          title="Guias DAM, confirmação financeira e segunda via por processo"
          description="A equipe financeira acompanha protocolo, ISSQN da obra e aprovação final em uma fila única de arrecadação."
          icon={Receipt}
          actions={<FinanceSectionNav />}
        />

        <PageStatsRow className="xl:grid-cols-3">
          <StatCard
            label="Guias de recolhimento"
            value={String(paymentGuides.length)}
            description="Protocolo, ISSQN e aprovação final"
            icon={Receipt}
            tone="blue"
          />
          <StatCard
            label="Pendentes"
            value={formatCurrency(pendingValue)}
            description="Pagamentos aguardando compensação"
            icon={WalletCards}
            tone="amber"
            valueClassName="text-xl md:text-2xl"
          />
          <StatCard
            label="Compensadas"
            value={formatCurrency(settledValue)}
            description="Guias já quitadas"
            icon={Receipt}
            tone="emerald"
            valueClassName="text-xl md:text-2xl"
          />
        </PageStatsRow>

        <PageMainGrid>
          <PageMainContent className="xl:col-span-12">
            <SectionCard
              title="Lista de processos e guias"
              description="Consulte, imprima a DAM e confirme o recolhimento de protocolo, ISSQN da obra e aprovação final."
            >
              <Card className="rounded-[24px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-slate-900">Lista de processos e guias</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {paymentGuides.map(({ process, guide }) => {
                    const pixPayload = `PIX|${tenantSettings?.beneficiarioArrecadacao || "Prefeitura"}|${tenantSettings?.chavePix || "nao-configurado"}|${guide.code}|${process.protocol}|${guide.amount.toFixed(2).replace(".", ",")}`;

                    return (
                      <div
                        key={`${process.id}:${guide.code}`}
                        className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <p
                              className="sig-fit-title text-base font-medium leading-6 text-slate-900"
                              title={process.protocol}
                            >
                              {process.protocol}
                            </p>
                            <p
                              className="mt-1 line-clamp-2 text-sm font-normal leading-6 text-slate-600"
                              title={process.title}
                            >
                              {process.title}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                                {guide.label}
                              </p>
                              <p
                                className="sig-fit-copy text-xs font-normal leading-5 text-slate-500"
                                title={guide.code}
                              >
                                {guide.code}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              guide.status === "compensada"
                                ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "rounded-full border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400"
                            }
                          >
                            {guide.status === "compensada" ? "Paga" : "Pendente"}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="rounded-[16px] border border-[#d8e4f1] bg-[#f8fbff] px-4 py-3 text-sm font-normal leading-snug text-[#123860]">
                            <p className="sig-label">PIX copia e cola</p>
                            <p className="mt-2 line-clamp-3 break-all">{pixPayload}</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl border-[#d8e4f1]"
                            onClick={() => copyPixPayload(pixPayload)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        {copiedPayload === pixPayload ? (
                          <p className="mt-2 text-xs text-emerald-700">Código copiado com sucesso.</p>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => openGuide(process.id, guide.kind, false)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Preview
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => openGuide(process.id, guide.kind, true)}
                          >
                            <Printer className="mr-2 h-4 w-4" />
                            Imprimir DAM
                          </Button>
                          {guide.status === "pendente" ? (
                            <Button
                              type="button"
                              className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => markGuideAsPaid(process.id, session.name, guide.kind)}
                            >
                              Confirmar pagamento
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </SectionCard>
          </PageMainContent>
        </PageMainGrid>
      </PageShell>
    </PortalFrame>
  );
}
