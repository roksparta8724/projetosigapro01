import {
  AlertCircle,
  Building2,
  Layers3,
  MapPinned,
  PencilLine,
  PlusCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageHeader } from "@/components/platform/PageHeader";
import { EmptyState, EmptyStateAction } from "@/components/platform/EmptyState";
import { PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { SectionCard } from "@/components/platform/SectionCard";
import { SummaryCard } from "@/components/platform/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useZoningRules } from "@/hooks/useZoningRules";
import {
  ZONING_TYPE_OPTIONS,
  ZONING_USE_OPTIONS,
  countConfiguredZoningRules,
  getZoningStatusLabel,
  getZoningTypeLabel,
  type ZoningRule,
  type ZoningRuleStatus,
  type ZoningRuleType,
  type ZoningUseType,
} from "@/lib/zoning";
import { can } from "@/lib/platform";
import { cn } from "@/lib/utils";

type ZoneTypeFilter = "all" | ZoningRuleType;
type ZoneStatusFilter = "all" | ZoningRuleStatus;

type ZoningFormState = {
  id: string;
  nome: string;
  tipo: ZoningRuleType;
  descricao: string;
  coeficienteAproveitamento: string;
  taxaOcupacao: string;
  taxaPermeabilidade: string;
  alturaMaxima: string;
  recuoFrontal: string;
  recuoLateral: string;
  recuoFundo: string;
  usosPermitidos: ZoningUseType[];
  usosProibidos: string;
  observacoes: string;
  status: ZoningRuleStatus;
};

function createEmptyForm(): ZoningFormState {
  return {
    id: "",
    nome: "",
    tipo: "residencial",
    descricao: "",
    coeficienteAproveitamento: "",
    taxaOcupacao: "",
    taxaPermeabilidade: "",
    alturaMaxima: "",
    recuoFrontal: "",
    recuoLateral: "",
    recuoFundo: "",
    usosPermitidos: ["residencial"],
    usosProibidos: "",
    observacoes: "",
    status: "ativa",
  };
}

function ruleToForm(rule: ZoningRule): ZoningFormState {
  return {
    id: rule.id,
    nome: rule.nome,
    tipo: rule.tipo,
    descricao: rule.descricao,
    coeficienteAproveitamento: rule.coeficienteAproveitamento?.toString() ?? "",
    taxaOcupacao: rule.taxaOcupacao?.toString() ?? "",
    taxaPermeabilidade: rule.taxaPermeabilidade?.toString() ?? "",
    alturaMaxima: rule.alturaMaxima?.toString() ?? "",
    recuoFrontal: rule.recuoFrontal?.toString() ?? "",
    recuoLateral: rule.recuoLateral?.toString() ?? "",
    recuoFundo: rule.recuoFundo?.toString() ?? "",
    usosPermitidos: rule.usosPermitidos,
    usosProibidos: rule.usosProibidos,
    observacoes: rule.observacoes,
    status: rule.status,
  };
}

function parseRequiredNumber(value: string, label: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) {
    throw new Error(`Informe ${label}.`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`O campo ${label} precisa ser numerico.`);
  }
  return parsed;
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTypeBadgeClass(type: ZoningRuleType) {
  if (type === "residencial") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "comercial") return "border-sky-200 bg-sky-50 text-sky-700";
  if (type === "industrial") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "institucional") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function getStatusBadgeClass(status: ZoningRuleStatus) {
  return status === "ativa"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-600";
}

function DetailMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function ZoningPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const canManageRules =
    can(session, "manage_tenant_users") ||
    session.role === "master_admin" ||
    session.role === "master_ops";
  const { rules, loading, saving, source, error, saveRule, updateStatus } = useZoningRules(effectiveScopeId);

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<ZoneTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ZoneStatusFilter>("all");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ZoningFormState>(createEmptyForm());

  const filteredRules = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return rules.filter((rule) => {
      const matchesQuery =
        !normalizedQuery ||
        `${rule.nome} ${rule.descricao} ${getZoningTypeLabel(rule.tipo)}`.toLowerCase().includes(normalizedQuery);
      const matchesType = typeFilter === "all" || rule.tipo === typeFilter;
      const matchesStatus = statusFilter === "all" || rule.status === statusFilter;
      return matchesQuery && matchesType && matchesStatus;
    });
  }, [rules, searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    if (!rules.length) {
      setSelectedRuleId(null);
      return;
    }

    if (!selectedRuleId || !rules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(rules[0].id);
    }
  }, [rules, selectedRuleId]);

  const selectedRule =
    rules.find((rule) => rule.id === selectedRuleId) ?? filteredRules[0] ?? null;

  const totalCount = rules.length;
  const activeCount = rules.filter((rule) => rule.status === "ativa").length;
  const inactiveCount = totalCount - activeCount;
  const configuredRulesCount = rules.reduce((acc, rule) => acc + countConfiguredZoningRules(rule), 0);

  const openCreateDialog = () => {
    setForm(createEmptyForm());
    setDialogOpen(true);
  };

  const openEditDialog = (rule: ZoningRule) => {
    setForm(ruleToForm(rule));
    setDialogOpen(true);
  };

  const handleAllowedUseChange = (useType: ZoningUseType, checked: boolean) => {
    setForm((current) => ({
      ...current,
      usosPermitidos: checked
        ? Array.from(new Set([...current.usosPermitidos, useType]))
        : current.usosPermitidos.filter((item) => item !== useType),
    }));
  };

  const handleSaveRule = async () => {
    if (!effectiveScopeId) {
      toast.error("Selecione uma prefeitura antes de cadastrar zoneamento.");
      return;
    }

    try {
      const payload = {
        id: form.id,
        municipalityId: effectiveScopeId,
        nome: form.nome.trim(),
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        coeficienteAproveitamento: parseRequiredNumber(form.coeficienteAproveitamento, "o coeficiente de aproveitamento"),
        taxaOcupacao: parseRequiredNumber(form.taxaOcupacao, "a taxa de ocupacao"),
        taxaPermeabilidade: parseRequiredNumber(form.taxaPermeabilidade, "a taxa de permeabilidade"),
        alturaMaxima: parseRequiredNumber(form.alturaMaxima, "a altura maxima"),
        recuoFrontal: parseRequiredNumber(form.recuoFrontal, "o recuo frontal"),
        recuoLateral: parseRequiredNumber(form.recuoLateral, "o recuo lateral"),
        recuoFundo: parseRequiredNumber(form.recuoFundo, "o recuo de fundo"),
        usosPermitidos: form.usosPermitidos,
        usosProibidos: form.usosProibidos.trim(),
        observacoes: form.observacoes.trim(),
        status: form.status,
      };

      if (!payload.nome) {
        throw new Error("Informe o nome da zona.");
      }

      if (!payload.descricao) {
        throw new Error("Informe a descricao da zona.");
      }

      if (!payload.usosPermitidos.length) {
        throw new Error("Selecione ao menos um uso permitido.");
      }

      const saved = await saveRule(payload);
      setSelectedRuleId(saved.id);
      setDialogOpen(false);
      toast.success(payload.id ? "Zona atualizada com sucesso." : "Zona cadastrada com sucesso.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Nao foi possivel salvar a zona.";
      toast.error(message);
    }
  };

  const handleToggleStatus = async (rule: ZoningRule) => {
    try {
      const nextStatus: ZoningRuleStatus = rule.status === "ativa" ? "inativa" : "ativa";
      const updated = await updateStatus(rule.id, nextStatus);
      if (updated?.id) {
        setSelectedRuleId(updated.id);
      }
      toast.success(
        nextStatus === "ativa" ? "Zona reativada com sucesso." : "Zona desativada com sucesso.",
      );
    } catch (statusError) {
      const message =
        statusError instanceof Error ? statusError.message : "Nao foi possivel atualizar o status da zona.";
      toast.error(message);
    }
  };

  return (
    <PortalFrame eyebrow="Legislacao urbanistica" title="Zoneamento urbano">
      <PageShell>
        <PageHeader
          eyebrow="Normas territoriais"
          title="Zoneamento urbano"
          description="Cadastre zonas municipais, organize regras de uso do solo e deixe a leitura tecnica pronta para o fluxo de analise da Prefeitura."
          icon={MapPinned}
          actions={
            canManageRules ? (
              <Button type="button" onClick={openCreateDialog} className="rounded-full">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nova zona
              </Button>
            ) : undefined
          }
        />

        <PageStatsRow>
          <SummaryCard
            title="Zonas cadastradas"
            value={String(totalCount)}
            helper="Base urbanistica vinculada ao municipio"
            icon={Layers3}
            tone="blue"
          />
          <SummaryCard
            title="Zonas ativas"
            value={String(activeCount)}
            helper="Regras disponiveis para consulta"
            icon={ShieldCheck}
            tone="emerald"
          />
          <SummaryCard
            title="Zonas inativas"
            value={String(inactiveCount)}
            helper="Itens preservados sem uso operacional"
            icon={AlertCircle}
            tone="amber"
          />
          <SummaryCard
            title="Parametros configurados"
            value={String(configuredRulesCount)}
            helper={source === "remote" ? "Sincronizados com o ambiente remoto" : "Armazenados no navegador atual"}
            icon={SlidersHorizontal}
            tone="default"
          />
        </PageStatsRow>

        {!effectiveScopeId ? (
          <SectionCard
            title="Zoneamento indisponivel"
            description="Defina a prefeitura ativa antes de cadastrar regras urbanisticas."
            icon={Building2}
          >
            <EmptyState
              title="Nenhum contexto municipal ativo"
              description="O modulo de zoneamento depende da prefeitura selecionada para isolar as regras de cada cliente."
              icon={Building2}
            />
          </SectionCard>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.94fr)_minmax(0,1.06fr)] xl:items-start">
            <SectionCard
              title="Zonas urbanisticas"
              description="Filtre por nome, tipo ou status e administre a base do municipio sem sair da tela."
              icon={Layers3}
              actions={
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  {source === "remote" ? "Origem remota" : "Origem local"}
                </Badge>
              }
              contentClassName="pt-0"
            >
              <div className="space-y-5">
                <div className="grid gap-3 border-b border-slate-200/90 py-5 sm:grid-cols-2">
                  <div className="relative sm:col-span-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Buscar por nome, descricao ou tipo"
                      className="h-11 rounded-2xl pl-9"
                    />
                  </div>

                  <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ZoneTypeFilter)}>
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue placeholder="Todos os tipos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {ZONING_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ZoneStatusFilter)}>
                    <SelectTrigger className="h-11 rounded-2xl">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="ativa">Ativas</SelectItem>
                      <SelectItem value="inativa">Inativas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {error ? (
                  <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                    {error}
                  </div>
                ) : null}

                {loading ? (
                  <div className="grid gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`zone-loading-${index}`}
                        className="h-[156px] animate-pulse rounded-[22px] border border-slate-200 bg-slate-100"
                      />
                    ))}
                  </div>
                ) : filteredRules.length ? (
                  <ScrollArea className="max-h-[880px] pr-2">
                    <div className="space-y-3">
                      {filteredRules.map((rule) => {
                        const active = rule.id === selectedRule?.id;
                        return (
                          <div
                            key={rule.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedRuleId(rule.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedRuleId(rule.id);
                              }
                            }}
                            className={cn(
                              "w-full rounded-[22px] border px-5 py-5 text-left transition duration-200",
                              active
                                ? "border-sky-300 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] shadow-[0_14px_28px_rgba(37,99,235,0.10)]"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-lg font-semibold text-slate-950">{rule.nome}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Badge className={cn("rounded-full border px-3 py-1 text-xs font-semibold", getTypeBadgeClass(rule.tipo))}>
                                    {getZoningTypeLabel(rule.tipo)}
                                  </Badge>
                                  <Badge className={cn("rounded-full border px-3 py-1 text-xs font-semibold", getStatusBadgeClass(rule.status))}>
                                    {getZoningStatusLabel(rule.status)}
                                  </Badge>
                                </div>
                              </div>
                              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Regras
                                </p>
                                <p className="mt-1 text-lg font-semibold text-slate-950">
                                  {countConfiguredZoningRules(rule)}
                                </p>
                              </div>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-slate-600">{rule.descricao}</p>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/90 pt-4">
                              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                                Criada em {formatCreatedAt(rule.createdAt)}
                              </p>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedRuleId(rule.id);
                                  }}
                                >
                                  Visualizar
                                </Button>
                                {canManageRules ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="rounded-full"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openEditDialog(rule);
                                      }}
                                    >
                                      <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      disabled={saving}
                                      className="rounded-full text-slate-600"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleToggleStatus(rule);
                                      }}
                                    >
                                      {rule.status === "ativa" ? "Desativar" : "Ativar"}
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <EmptyState
                    title="Nenhuma zona encontrada"
                    description="Ajuste os filtros ou cadastre a primeira zona urbanistica desta Prefeitura."
                    icon={MapPinned}
                    action={
                      canManageRules ? (
                        <EmptyStateAction onClick={openCreateDialog}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Nova zona
                        </EmptyStateAction>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </SectionCard>

            <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-5">
              <SectionCard
                title={selectedRule ? selectedRule.nome : "Detalhes da zona"}
                description={
                  selectedRule
                    ? "Leitura tecnica completa da zona selecionada, pronta para consulta no fluxo de analise."
                    : "Selecione uma zona na coluna lateral para visualizar parametros e usos."
                }
                icon={MapPinned}
                actions={
                  selectedRule && canManageRules ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => openEditDialog(selectedRule)}
                      >
                        <PencilLine className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full"
                        disabled={saving}
                        onClick={() => void handleToggleStatus(selectedRule)}
                      >
                        {selectedRule.status === "ativa" ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  ) : undefined
                }
              >
                {selectedRule ? (
                  <div className="space-y-6">
                    <div className="rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xl font-semibold text-slate-950">{selectedRule.nome}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{selectedRule.descricao}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={cn("rounded-full border px-3 py-1 text-xs font-semibold", getTypeBadgeClass(selectedRule.tipo))}>
                            {getZoningTypeLabel(selectedRule.tipo)}
                          </Badge>
                          <Badge className={cn("rounded-full border px-3 py-1 text-xs font-semibold", getStatusBadgeClass(selectedRule.status))}>
                            {getZoningStatusLabel(selectedRule.status)}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <DetailMetricCard label="Coeficiente de aproveitamento" value={formatNumber(selectedRule.coeficienteAproveitamento)} />
                        <DetailMetricCard label="Taxa de ocupacao" value={`${formatNumber(selectedRule.taxaOcupacao)}%`} />
                        <DetailMetricCard label="Taxa de permeabilidade" value={`${formatNumber(selectedRule.taxaPermeabilidade)}%`} />
                        <DetailMetricCard label="Altura maxima" value={`${formatNumber(selectedRule.alturaMaxima)} m`} />
                        <DetailMetricCard label="Recuo frontal" value={`${formatNumber(selectedRule.recuoFrontal)} m`} />
                        <DetailMetricCard label="Recuo lateral" value={`${formatNumber(selectedRule.recuoLateral)} m`} />
                        <DetailMetricCard label="Recuo de fundo" value={`${formatNumber(selectedRule.recuoFundo)} m`} />
                        <DetailMetricCard label="Regras configuradas" value={String(countConfiguredZoningRules(selectedRule))} />
                        <DetailMetricCard label="Cadastro" value={formatCreatedAt(selectedRule.createdAt)} />
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Usos permitidos
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedRule.usosPermitidos.map((useType) => (
                            <Badge
                              key={useType}
                              variant="outline"
                              className="rounded-full border-sky-200 bg-sky-50 px-3 py-1 text-sky-700"
                            >
                              {getZoningTypeLabel(useType)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Usos proibidos
                        </p>
                        <p className="mt-4 text-sm leading-6 text-slate-700">
                          {selectedRule.usosProibidos || "Nenhuma restricao especifica cadastrada."}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Observacoes tecnicas
                      </p>
                      <p className="mt-4 text-sm leading-7 text-slate-700">
                        {selectedRule.observacoes || "Nenhuma observacao tecnica adicional foi cadastrada para esta zona."}
                      </p>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-sky-200 bg-sky-50 text-sky-700">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Preparado para integracoes futuras</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Esta estrutura ja deixa o municipio pronto para cruzar regras com analise de projeto,
                            validacao automatica de lote e leitura de restricoes por area urbana.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Selecione uma zona"
                    description="Escolha uma zona na coluna ao lado para visualizar parametros urbanisticos, usos permitidos e observacoes tecnicas."
                    icon={MapPinned}
                  />
                )}
              </SectionCard>
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[min(92vw,1120px)] max-w-none overflow-hidden border-slate-200 p-0 sm:rounded-[28px]">
            <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-5">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-2xl font-semibold text-slate-950">
                  {form.id ? "Editar zona urbanistica" : "Nova zona urbanistica"}
                </DialogTitle>
                <DialogDescription className="max-w-[78ch] text-sm leading-6 text-slate-600">
                  Cadastre parametros oficiais de uso do solo para consulta rapida no fluxo institucional da Prefeitura.
                </DialogDescription>
              </DialogHeader>
            </div>

            <ScrollArea className="max-h-[78vh]">
              <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
                <div className="space-y-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="zoning-nome">Nome da zona</Label>
                      <Input
                        id="zoning-nome"
                        value={form.nome}
                        onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                        placeholder="Ex.: ZR1, ZC2, ZI"
                        className="h-11 rounded-2xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zoning-tipo">Tipo</Label>
                      <Select
                        value={form.tipo}
                        onValueChange={(value) =>
                          setForm((current) => ({ ...current, tipo: value as ZoningRuleType }))
                        }
                      >
                        <SelectTrigger id="zoning-tipo" className="h-11 rounded-2xl">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {ZONING_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zoning-status">Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          setForm((current) => ({ ...current, status: value as ZoningRuleStatus }))
                        }
                      >
                        <SelectTrigger id="zoning-status" className="h-11 rounded-2xl">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativa">Ativa</SelectItem>
                          <SelectItem value="inativa">Inativa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="zoning-descricao">Descricao</Label>
                      <Textarea
                        id="zoning-descricao"
                        value={form.descricao}
                        onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
                        placeholder="Resumo institucional da zona, caracteristicas de ocupacao e orientacao de leitura."
                        className="min-h-[110px] rounded-[20px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white text-[#2563eb]">
                        <SlidersHorizontal className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-950">Regras urbanisticas</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Preencha os indices tecnicos oficiais para coeficiente, ocupacao, altura e recuos.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="coeficiente-aproveitamento">Coeficiente de aproveitamento</Label>
                        <Input
                          id="coeficiente-aproveitamento"
                          value={form.coeficienteAproveitamento}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, coeficienteAproveitamento: event.target.value }))
                          }
                          placeholder="Ex.: 2,0"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxa-ocupacao">Taxa de ocupacao (%)</Label>
                        <Input
                          id="taxa-ocupacao"
                          value={form.taxaOcupacao}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, taxaOcupacao: event.target.value }))
                          }
                          placeholder="Ex.: 70"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxa-permeabilidade">Taxa de permeabilidade (%)</Label>
                        <Input
                          id="taxa-permeabilidade"
                          value={form.taxaPermeabilidade}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, taxaPermeabilidade: event.target.value }))
                          }
                          placeholder="Ex.: 20"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="altura-maxima">Altura maxima (m)</Label>
                        <Input
                          id="altura-maxima"
                          value={form.alturaMaxima}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, alturaMaxima: event.target.value }))
                          }
                          placeholder="Ex.: 12"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="recuo-frontal">Recuo frontal (m)</Label>
                        <Input
                          id="recuo-frontal"
                          value={form.recuoFrontal}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, recuoFrontal: event.target.value }))
                          }
                          placeholder="Ex.: 5"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="recuo-lateral">Recuo lateral (m)</Label>
                        <Input
                          id="recuo-lateral"
                          value={form.recuoLateral}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, recuoLateral: event.target.value }))
                          }
                          placeholder="Ex.: 1,5"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="recuo-fundo">Recuo de fundo (m)</Label>
                        <Input
                          id="recuo-fundo"
                          value={form.recuoFundo}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, recuoFundo: event.target.value }))
                          }
                          placeholder="Ex.: 3"
                          className="h-11 rounded-2xl"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <p className="text-base font-semibold text-slate-950">Usos permitidos</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Marque os tipos de ocupacao autorizados nesta zona.
                    </p>

                    <div className="mt-5 space-y-3">
                      {ZONING_USE_OPTIONS.map((option) => {
                        const checked = form.usosPermitidos.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => handleAllowedUseChange(option.value, value === true)}
                              className="h-4.5 w-4.5 rounded-md border-slate-300 data-[state=checked]:border-[#2563eb] data-[state=checked]:bg-[#2563eb]"
                            />
                            <span className="text-sm font-medium text-slate-800">{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="space-y-2">
                      <Label htmlFor="usos-proibidos">Usos proibidos</Label>
                      <Textarea
                        id="usos-proibidos"
                        value={form.usosProibidos}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, usosProibidos: event.target.value }))
                        }
                        placeholder="Descreva as ocupacoes vedadas nesta zona."
                        className="min-h-[120px] rounded-[20px]"
                      />
                    </div>

                    <div className="mt-5 space-y-2">
                      <Label htmlFor="observacoes-zona">Observacoes tecnicas</Label>
                      <Textarea
                        id="observacoes-zona"
                        value={form.observacoes}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, observacoes: event.target.value }))
                        }
                        placeholder="Notas adicionais para analise, excecoes normativas e orientacoes internas."
                        className="min-h-[160px] rounded-[20px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-sky-200 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] p-5">
                    <p className="text-sm font-semibold text-slate-950">Preparacao para evolucao futura</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Este cadastro ja considera o municipio para isolamento multi-tenant e deixa a zona pronta para uso futuro em analise de projeto, cruzamento de lote e validacoes automáticas.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:justify-between">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setDialogOpen(false)}>
                Fechar
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setForm(createEmptyForm())}>
                  Limpar formulario
                </Button>
                <Button type="button" className="rounded-full" disabled={saving} onClick={() => void handleSaveRule()}>
                  {form.id ? "Salvar alteracoes" : "Cadastrar zona"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </PageShell>
    </PortalFrame>
  );
}
