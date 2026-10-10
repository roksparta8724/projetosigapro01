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
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
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

export function FinanceProtocolsPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId, institutionSettingsCompat, name: municipalityName } = useMunicipality();
  const { processes: allProcesses, markGuideAsPaid, getInstitutionSettings } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);
  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const [copiedPayload, setCopiedPayload] = useState("");
  const [financialStatus, setFinancialStatus] = useState("");
  const [financialBusyKey, setFinancialBusyKey] = useState("");

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

  const handleConfirmPayment = async (processId: string, guideKind: PaymentGuideKind) => {
    const busyKey = `${processId}:${guideKind}`;
    setFinancialBusyKey(busyKey);
    setFinancialStatus("");

    try {
      await markGuideAsPaid(processId, session.name, guideKind);
      setFinancialStatus("Pagamento confirmado no banco oficial com sucesso.");
    } catch (error) {
      setFinancialStatus(
        error instanceof Error
          ? `Não foi possível confirmar o pagamento: ${error.message}`
          : "Não foi possível confirmar o pagamento no banco oficial.",
      );
    } finally {
      setFinancialBusyKey("");
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
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/prefeitura/financeiro">Voltar ao Financeiro</Link>
            </Button>
          }
        />

        {financialStatus ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            financialStatus.startsWith("Pagamento confirmado")
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}>
            {financialStatus}
          </div>
        ) : null}

        <PageStatsRow className="xl:grid-cols-3 min-[1500px]:grid-cols-3 xl:gap-6 [&>*]:min-w-0 [&>*]:min-h-[164px]">
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

        <PageMainGrid className="grid-cols-1 xl:grid-cols-1">
          <PageMainContent>
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
                              title={formatOfficialProcessNumber(process.protocol)}
                            >
                              {formatOfficialProcessNumber(process.protocol)}
                            </p>
                            <p
                              className="mt-1 line-clamp-2 text-sm font-normal leading-6 text-slate-600"
                              title={formatOfficialProcessTitle({ title: process.title, type: process.type })}
                            >
                              {formatOfficialProcessTitle({ title: process.title, type: process.type })}
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
                            <div className="mt-2 max-w-full overflow-hidden rounded-xl border border-[#d8e4f1] bg-white/80">
  <p className="overflow-x-auto whitespace-nowrap px-3 py-2 font-mono text-xs leading-5 text-[#123860]" title={pixPayload}>
    {pixPayload}
  </p>
</div>
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
                              disabled={financialBusyKey === `${process.id}:${guide.kind}`}
                              onClick={() => void handleConfirmPayment(process.id, guide.kind)}
                            >
                              {financialBusyKey === `${process.id}:${guide.kind}`
                                ? "Confirmando..."
                                : "Confirmar pagamento"}
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
