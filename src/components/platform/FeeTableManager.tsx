import { Calculator, Landmark, ReceiptText, Save, Scale, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CalculationContext, type MunicipalFeeRule, type MunicipalFeeTable } from "@/lib/govtech";
import {
  calculateApprovalGuideAmount,
  calculateApprovalGuideBreakdown,
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
    approvalAliquotPercent?: number;
    issRateProfiles?: MunicipalIssRateProfile[];
    approvalRateProfiles?: MunicipalApprovalRateProfile[];
  };
  onSave?: (values: {
    taxaProtocolo: number;
    taxaIssPorMetroQuadrado: number;
    taxaAprovacaoFinal: number;
    approvalAliquotPercent?: number;
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
    approvalAliquotPercent?: number;
    issRateProfiles?: MunicipalIssRateProfile[];
    approvalRateProfiles?: MunicipalApprovalRateProfile[];
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
    approvalAliquotPercent: draft.approvalAliquotPercent ?? 5,
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
  const [draft, setDraft] = useState({
    taxaProtocolo: values?.taxaProtocolo ?? 35.24,
    taxaIssPorMetroQuadrado: values?.taxaIssPorMetroQuadrado ?? 0,
    issRateProfiles:
      values?.issRateProfiles && values.issRateProfiles.length > 0
        ? values.issRateProfiles
        : defaultIssRateProfiles,
    taxaAprovacaoFinal: values?.taxaAprovacaoFinal ?? 0,
    approvalAliquotPercent: values?.approvalAliquotPercent ?? 5,
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
      approvalRate: matchedApprovalProfile?.rate ?? 0,
      approvalBreakdown: calculateApprovalGuideBreakdown(
        Number(sampleContext.builtArea || 0),
        sampleUsage,
        sampleStandard,
        settings,
      ),
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
              {formatCurrency(simulation.protocolo + simulation.iss + simulation.aprovacao)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Soma simulada de protocolo, ISSQN e aprovação/Alvará no contexto atual.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm leading-6 text-slate-700">
          O ISSQN da obra segue sua tabela própria. Já a guia de aprovação do projeto e do Alvará
          usa a área aprovada, o tipo de obra, o padrão de acabamento e a alíquota municipal sobre
          o valor de referência do metro quadrado. Habite-se não faz parte deste cálculo: ele terá
          protocolo próprio. Ao salvar, os parâmetros passam a alimentar somente novas emissões.
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
                <p className="sig-label">Guia de aprovação / Alvará</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatCurrency(simulation.aprovacao)}
                </p>
              </div>
              <Wallet className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Total = taxa fixa do Alvará + (área × valor de referência do m² × alíquota).
            </p>
            {editable ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Alíquota da taxa de licença (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={draft.approvalAliquotPercent}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          approvalAliquotPercent: Number(event.target.value),
                        }))
                      }
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      No modelo informado de Campo Limpo Paulista, a alíquota aplicada é 5%.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Taxa fixa geral do Alvará (fallback)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.taxaAprovacaoFinal}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          taxaAprovacaoFinal: Number(event.target.value),
                        }))
                      }
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      Usada somente quando a linha específica não possuir taxa fixa própria.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {draft.approvalRateProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-[minmax(0,1fr)_145px_145px]"
                    >
                      <div className="space-y-1">
                        <Label>{profile.label}</Label>
                        <p className="text-xs leading-5 text-slate-500">
                          Tipo de obra + padrão de acabamento.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label>Referência R$/m²</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={profile.rate}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              approvalRateProfiles: current.approvalRateProfiles.map((item) =>
                                item.id === profile.id
                                  ? { ...item, rate: Number(event.target.value) }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Alvará fixo (R$)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={profile.permitFee ?? 0}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              approvalRateProfiles: current.approvalRateProfiles.map((item) =>
                                item.id === profile.id
                                  ? { ...item, permitFee: Number(event.target.value) }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <span>Alíquota: {simulation.approvalBreakdown.aliquotPercent.toLocaleString("pt-BR")}%</span>
                <span>Valor de referência: {formatCurrency(simulation.approvalBreakdown.baseValueM2)} / m²</span>
                <span>Taxa fixa do Alvará: {formatCurrency(simulation.approvalBreakdown.permitFee)}</span>
              </div>
            )}
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
                  Aprovação / Alvará {simulation.approvalLabel} ({sampleContext.builtArea} m²)
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
              <li>Taxa de licença = área × valor de referência do m² × alíquota.</li>
              <li>Total da aprovação = taxa fixa do Alvará + taxa de licença.</li>
              <li>Habite-se não é continuação deste fluxo: será aberto em protocolo próprio.</li>
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
