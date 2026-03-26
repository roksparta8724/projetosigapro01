import { Calculator, Landmark, ReceiptText, Save, Scale, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateMunicipalFeeRules, type CalculationContext } from "@/lib/calculationEngine";
import { type MunicipalFeeRule, type MunicipalFeeTable } from "@/lib/govtech";
import {
  calculateApprovalGuideAmount,
  defaultApprovalRateProfiles,
  calculateIssGuideAmount,
  defaultIssRateProfiles,
  resolveApprovalRateProfile,
  resolveIssRateProfile,
  type MunicipalApprovalRateProfile,
  type MunicipalIssRateProfile,
} from "@/lib/platform";

interface FeeTableManagerProps {
  title?: string;
  subtitle?: string;
  table: MunicipalFeeTable;
  rules: MunicipalFeeRule[];
  sampleContext: CalculationContext;
  sampleUsage?: string;
  sampleStandard?: string;
  values?: {
    taxaProtocolo: number;
    taxaIssPorMetroQuadrado: number;
    taxaAprovacaoFinal: number;
    issRateProfiles?: MunicipalIssRateProfile[];
    approvalRateProfiles?: MunicipalApprovalRateProfile[];
  };
  onSave?: (values: {
    taxaProtocolo: number;
    taxaIssPorMetroQuadrado: number;
    taxaAprovacaoFinal: number;
    issRateProfiles?: MunicipalIssRateProfile[];
    approvalRateProfiles?: MunicipalApprovalRateProfile[];
  }) => void | Promise<void>;
  statusMessage?: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function buildPreviewSettings(
  draft: {
    taxaProtocolo: number;
    taxaIssPorMetroQuadrado: number;
    taxaAprovacaoFinal: number;
    issRateProfiles: MunicipalIssRateProfile[];
  },
) {
  return {
    tenantId: "preview",
    cnpj: "",
    endereco: "",
    telefone: "",
    email: "",
    site: "",
    secretariaResponsavel: "",
    diretoriaResponsavel: "",
    diretoriaTelefone: "",
    diretoriaEmail: "",
    horarioAtendimento: "",
    brasaoUrl: "",
    bandeiraUrl: "",
    logoUrl: "",
    imagemHeroUrl: "",
    resumoPlanoDiretor: "",
    resumoUsoSolo: "",
    leisComplementares: "",
    linkPortalCliente: "",
    protocoloPrefixo: "SIG",
    guiaPrefixo: "DAM",
    chavePix: "",
    beneficiarioArrecadacao: "",
    taxaProtocolo: draft.taxaProtocolo,
    taxaIssPorMetroQuadrado: draft.taxaIssPorMetroQuadrado,
    issRateProfiles: draft.issRateProfiles,
    taxaAprovacaoFinal: draft.taxaAprovacaoFinal,
    approvalRateProfiles: draft.approvalRateProfiles,
    registroProfissionalObrigatorio: true,
    planoDiretorArquivoNome: "",
    planoDiretorArquivoUrl: "",
    usoSoloArquivoNome: "",
    usoSoloArquivoUrl: "",
    leisArquivoNome: "",
    leisArquivoUrl: "",
  };
}

export function FeeTableManager({
  title = "Tabelas e valores da Prefeitura",
  subtitle = "Centralize taxas, ISSQN e regras de cálculo por Prefeitura.",
  table,
  rules,
  sampleContext,
  sampleUsage,
  sampleStandard,
  values,
  onSave,
  statusMessage,
}: FeeTableManagerProps) {
  const preview = evaluateMunicipalFeeRules(rules, sampleContext);
  const [draft, setDraft] = useState({
    taxaProtocolo: values?.taxaProtocolo ?? 35.24,
    taxaIssPorMetroQuadrado: values?.taxaIssPorMetroQuadrado ?? 0,
    issRateProfiles:
      values?.issRateProfiles && values.issRateProfiles.length > 0
        ? values.issRateProfiles
        : defaultIssRateProfiles,
    taxaAprovacaoFinal: values?.taxaAprovacaoFinal ?? 0,
    approvalRateProfiles:
      values?.approvalRateProfiles && values.approvalRateProfiles.length > 0
        ? values.approvalRateProfiles
        : defaultApprovalRateProfiles,
  });

  const editable = Boolean(onSave);

  const simulation = useMemo(() => {
    const settings = buildPreviewSettings(draft);
    const matchedProfile = resolveIssRateProfile(sampleUsage, settings);
    const matchedApprovalProfile = resolveApprovalRateProfile(sampleUsage, sampleStandard, settings);
    return {
      protocolo: Number(draft.taxaProtocolo || 0),
      iss: calculateIssGuideAmount(
        Number(sampleContext.builtArea || 0),
        sampleUsage,
        settings,
      ),
      issLabel: matchedProfile?.label ?? "Uso da obra",
      issRate: matchedProfile?.rate ?? Number(draft.taxaIssPorMetroQuadrado || 0),
      approvalLabel: matchedApprovalProfile?.label ?? "Padrão construtivo",
      approvalRate: matchedApprovalProfile?.rate ?? Number(draft.taxaAprovacaoFinal || 0),
      aprovacao: calculateApprovalGuideAmount(
        Number(sampleContext.builtArea || 0),
        sampleUsage,
        sampleStandard,
        settings,
      ),
    };
  }, [draft, sampleContext.builtArea, sampleStandard, sampleUsage]);

  return (
    <Card className="rounded-[28px] border-slate-200">
      <CardHeader className="space-y-2">
        <CardTitle className="max-w-2xl break-words text-base font-semibold leading-tight text-slate-900">
          {title}
        </CardTitle>
        <p className="max-w-2xl break-words text-sm leading-6 text-slate-500">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
              <Landmark className="h-4 w-4" />
              Tabela ativa
            </div>
            <p className="break-words text-lg font-semibold leading-tight text-slate-900">
              {table.label}
            </p>
            <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-slate-500">
              {table.description}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
              <ReceiptText className="h-4 w-4" />
              Regras configuradas
            </div>
            <p className="text-lg font-semibold leading-tight text-slate-900">{rules.length}</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Protocolo, ISSQN por tipo de obra e aprovação final.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
              <Calculator className="h-4 w-4" />
              Simulação
            </div>
            <p className="break-words text-lg font-semibold leading-tight text-slate-900">
              {formatCurrency(preview.total)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Pré-visualização do cálculo no contexto atual.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm leading-6 text-slate-700">
          O ISSQN da obra é calculado pela metragem de construção multiplicada pelo valor do tipo
          de construção definido pela Prefeitura. Ao salvar, os parâmetros passam a alimentar as
          guias novas e as pendentes ainda não compensadas.
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sig-label">Guia inicial de protocolo</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCurrency(draft.taxaProtocolo)}
                </p>
              </div>
              <ReceiptText className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Cobrança fixa emitida na abertura do processo.
            </p>
            {editable ? (
              <div className="mt-4 space-y-2">
                <Label>Valor da guia de protocolo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.taxaProtocolo}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      taxaProtocolo: Number(event.target.value),
                    }))
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sig-label">ISSQN da obra</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCurrency(simulation.issRate)} / m²
                </p>
              </div>
              <Scale className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Base aplicada conforme o uso da construção informado no processo.
            </p>
            {editable ? (
              <div className="mt-4 space-y-3">
                {draft.issRateProfiles.map((profile) => (
                  <div key={profile.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="space-y-1">
                      <Label>{profile.label}</Label>
                      <p className="text-xs text-slate-500">
                        Aplicado quando o processo for classificado nesta categoria.
                      </p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={profile.rate}
                      onChange={(event) =>
                        setDraft((current) => {
                          const nextRate = Number(event.target.value);
                          const nextProfiles = current.issRateProfiles.map((item) =>
                            item.id === profile.id ? { ...item, rate: nextRate } : item,
                          );
                          return {
                            ...current,
                            taxaIssPorMetroQuadrado:
                              nextProfiles[0]?.rate ?? current.taxaIssPorMetroQuadrado,
                            issRateProfiles: nextProfiles,
                          };
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sig-label">Guia final de aprovação</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCurrency(draft.taxaAprovacaoFinal)}
                </p>
              </div>
              <Wallet className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Cobrança final vinculada à aprovação e ao habite-se conforme uso e acabamento.
            </p>
            {editable ? (
              <div className="mt-4 space-y-3">
                {draft.approvalRateProfiles.map((profile) => (
                  <div key={profile.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="space-y-1">
                      <Label>{profile.label}</Label>
                      <p className="text-xs text-slate-500">
                        Valor por m² para aprovação final e habite-se.
                      </p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={profile.rate}
                      onChange={(event) =>
                        setDraft((current) => {
                          const nextRate = Number(event.target.value);
                          return {
                            ...current,
                            approvalRateProfiles: current.approvalRateProfiles.map((item) =>
                              item.id === profile.id ? { ...item, rate: nextRate } : item,
                            ),
                            taxaAprovacaoFinal: nextRate,
                          };
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Simulação operacional</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Protocolo</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatCurrency(simulation.protocolo)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  ISSQN {simulation.issLabel} ({sampleContext.builtArea} m²)
                </p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatCurrency(simulation.iss)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  Habite-se {simulation.approvalLabel} ({sampleContext.builtArea} m²)
                </p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {formatCurrency(simulation.aprovacao)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="sig-label">Aplicação automática</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>Guia inicial usa o valor fixo de protocolo.</li>
              <li>ISSQN da obra = metragem construída × valor do tipo de construção.</li>
              <li>Guia final = metragem construída × valor por padrão de acabamento.</li>
            </ul>
            {editable ? (
              <Button
                type="button"
                className="mt-4 w-full rounded-2xl bg-slate-950 hover:bg-slate-900"
                onClick={() => onSave?.(draft)}
              >
                <Save className="mr-2 h-4 w-4" />
                Salvar parâmetros financeiros
              </Button>
            ) : null}
            {statusMessage ? (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                {statusMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <p className="break-words text-base font-semibold leading-tight text-slate-900">
                    {rule.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Código: {rule.code}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-300 text-slate-700"
                  >
                    {rule.kind}
                  </Badge>
                  {rule.processType ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-300 text-slate-700"
                    >
                      {rule.processType}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 break-words text-sm leading-6 text-slate-500">
                {rule.kind === "fixed" && rule.amount !== undefined ? (
                  <span>Valor fixo configurado: {formatCurrency(rule.amount)}</span>
                ) : null}
                {rule.kind === "per_square_meter" && rule.rate !== undefined ? (
                  <span>Valor por m²: {formatCurrency(rule.rate)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
