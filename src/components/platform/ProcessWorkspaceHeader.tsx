import { CheckCircle2, RotateCcw, Plus, ChevronDown, ChevronRight, Download, FileText, FileWarning, Flame, FolderOpen, Forward, Gavel, Layers3, MapPin, Search, SlidersHorizontal, Tag, Timer, UserRound, UsersRound, X } from "lucide-react";
import { Flag as ProfessionalMarkerIcon } from "@/components/platform/PremiumIcons";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildProcessPath, type ProcessRecord } from "@/lib/platform";

export type ProcessQuickFilter = "todos" | "meus" | "criticos" | "pendencias" | "guias" | "exigencias" | "analise" | "vistoria" | "decisao";
export type ProcessMarkerOption = { label: string; color: string; emoji?: string };
export type ProcessWorkspaceAction = "prioridade" | "atribuir" | "encaminhar" | "decisao" | "etiquetas";
export function processIsCritical(p: ProcessRecord) {
  return Boolean(p.sla?.breached || (typeof p.sla?.hoursRemaining === "number" && p.sla.hoursRemaining <= 12));
}
export function processPendingGuideCount(p: ProcessRecord) {
  const guides = p.payment?.guides ?? [];
  return guides.length ? guides.filter(g => ["pendente", "pending"].includes(String(g.status))).length
    : (p.payment?.guideNumber && p.payment.status === "pendente" ? 1 : 0);
}
export function processHasRequirement(p: ProcessRecord) {
  return p.status === "exigencia" || p.status === "pendencia_documental" ||
    (p.requirements ?? []).some(r => r.status === "aberta" || r.status === "respondida");
}
export function processIsUnderAnalysis(p: ProcessRecord) {
  if (p.status === "analise_tecnica") return true;
  const stage = [p.sla?.currentStage, p.processControl?.currentFolder]
    .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /analise/.test(stage);
}
export function processAwaitsInspection(p: ProcessRecord) {
  const stage = [p.sla?.currentStage, p.processControl?.currentFolder]
    .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /vistoria|fiscalizacao de obra/.test(stage);
}
export function processAwaitsDecision(p: ProcessRecord) {
  const raw = [p.status, p.sla?.currentStage, p.processControl?.currentFolder].join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /decisao|aguardando assinatura|diretor|secretario/.test(raw);
}
export type ProcessWorkspaceHeaderProps = {
  processes: ProcessRecord[];
  filteredCount: number;
  search: string;
  onSearch: (value: string) => void;
  quickFilter: ProcessQuickFilter;
  onFilter: (value: ProcessQuickFilter) => void;
  operatorName?: string;
  selectedCount: number;
  allPageSelected: boolean;
  pageCount: number;
  onTogglePage: (checked: boolean) => void;
  onClearSelection: () => void;
  oneSelected: ProcessRecord | null;
  canDispatch: (process: ProcessRecord) => boolean;
  showSensitiveDetails: boolean;
  bulkBusy: boolean;
  markerOptions: ProcessMarkerOption[];
  onBulkMarker?: (marker: ProcessMarkerOption) => void;
  onCreateMarker?: () => void;
  selectedProcesses?: ProcessRecord[];
  unitCompletedIds?: string[];
  unitDataReady?: boolean;
  onUnitAction?: (completed: boolean) => void;
  onBulkDispatch?: () => void;
  onToolbarAction?: (action: ProcessWorkspaceAction) => void;
  onExport: (scope?: "selected" | "filtered") => void;
};

const filterSpecs = [
  { id: "meus", label: "Meus processos", Icon: UserRound },
  { id: "criticos", label: "SLA crítico", Icon: Flame },
  { id: "guias", label: "Guia pendente", Icon: FileText },
  { id: "exigencias", label: "Exigência", Icon: FileWarning },
  { id: "analise", label: "Análise", Icon: Layers3 },
  { id: "vistoria", label: "Vistoria", Icon: MapPin },
  { id: "decisao", label: "Em decisão", Icon: Gavel },
  { id: "todos", label: "Todos", Icon: Layers3 },
] as const;

export function ProcessWorkspaceHeader({
  processes, filteredCount, search, onSearch, quickFilter, onFilter, operatorName,
  selectedCount, allPageSelected, pageCount, onTogglePage, onClearSelection,
  oneSelected, canDispatch, showSensitiveDetails, bulkBusy, markerOptions,
  onBulkMarker, onCreateMarker, selectedProcesses = [], unitCompletedIds = [], unitDataReady = false,
  onUnitAction, onBulkDispatch, onToolbarAction, onExport,
}: ProcessWorkspaceHeaderProps) {
  const stats = [
    { key: "total", label: "Processos no município", count: processes.length, Icon: FolderOpen, tone: "blue" },
    { key: "critical", label: "Com atenção ao prazo", count: processes.filter(processIsCritical).length, Icon: Timer, tone: "amber" },
    { key: "guides", label: "Guias pendentes", count: processes.reduce((v, p) => v + processPendingGuideCount(p), 0), Icon: FileText, tone: "violet" },
    { key: "decision", label: "Aguardando decisão", count: processes.filter(processAwaitsDecision).length, Icon: Gavel, tone: "green" },
  ] as const;
  const completedIds = new Set(unitCompletedIds);
  const selectedAllCompleted = selectedProcesses.length > 0 &&
    selectedProcesses.every(process => completedIds.has(process.id));
  const selectedMixedStates = selectedProcesses.some(process => completedIds.has(process.id)) &&
    selectedProcesses.some(process => !completedIds.has(process.id));
  const canOperateInUnit = selectedProcesses.length > 0 && !selectedMixedStates &&
    selectedProcesses.every(process => completedIds.has(process.id) || canDispatch(process));
  return (
    <div data-sigapro-workspace-header="premium-model" className="sig-workspace-intro">
      <div className="sig-workspace-breadcrumb">Prefeitura <ChevronRight className="h-3.5 w-3.5" /> <strong>Controle de Processos</strong></div>
      <div className="sig-workspace-hero">
        <span className="sig-workspace-hero-icon"><Layers3 className="h-6 w-6" /></span>
        <span className="min-w-0"><h2>Controle de Processos</h2><p>Acompanhe, trate e decida os processos da Prefeitura de forma integrada e eficiente.</p></span>
      </div>
      <div className="sig-workspace-kpis" aria-label="Indicadores dos processos municipais">
        {stats.map(({ key, label, count, Icon, tone }) => (
          <div key={key} className="sig-workspace-kpi" data-workspace-kpi={key}>
            <span className={"sig-workspace-kpi-icon " + tone}><Icon className="h-6 w-6" /></span>
            <span className="min-w-0"><strong className="tabular-nums">{count.toLocaleString("pt-BR")}</strong><small>{label}</small></span>
            {key === "critical" ? <span className="sig-reference-kpi-alert" aria-hidden="true">SLA crítico</span> : null}
          </div>
        ))}
      </div>
      <div className="sig-workspace-searchbar">
        <label className="sig-workspace-search">
          <Search className="h-5 w-5 shrink-0" />
          <span className="sr-only">Pesquisar processos</span>
          <input value={search} onChange={event => onSearch(event.target.value)}
            placeholder="Pesquisar processos (nº, assunto, interessado, responsável)..."
            aria-label="Pesquisar processos por número, assunto, interessado ou responsável" />
        </label>
        <div className="sig-workspace-filters" role="group" aria-label="Filtros rápidos" tabIndex={0}
          title="Use a rolagem horizontal quando os filtros não couberem na tela">
          <span>Filtros rápidos:</span>
          {filterSpecs.map(({ id, label, Icon }) => (
            <button key={id} type="button" data-filter={id} className={"sig-workspace-chip " + (quickFilter === id ? "is-active" : "")}
              disabled={id === "meus" && !operatorName?.trim()}
              aria-pressed={quickFilter === id}
              title={id === "meus" && !operatorName?.trim() ? "Nome do servidor não disponível" : undefined}
              onClick={() => onFilter(id)}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
      </div>
      <div data-sigapro-process-bulk-actions="true"
        data-has-selection={selectedCount > 0 ? "true" : "false"}
        className="sig-workspace-actions">
        {showSensitiveDetails ? (
          <label className="sig-workspace-select-all">
            <input type="checkbox" checked={allPageSelected} disabled={!pageCount} onChange={e => onTogglePage(e.target.checked)}
              aria-label="Selecionar todos os processos desta página" />
            <ChevronDown className="h-4 w-4" />
          </label>
        ) : null}
        <strong className="sig-workspace-selected">{selectedCount} selecionado(s)</strong>
        {selectedCount > 0 ? <button type="button" onClick={onClearSelection} className="sig-workspace-clear"><X className="h-3 w-3" /> Limpar</button> : null}
        <div className="sig-workspace-actions-list">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" className="sig-workspace-action sig-workspace-action-primary"
                disabled={selectedCount === 0 || bulkBusy || !showSensitiveDetails}>
                <Tag className="h-4 w-4" /> Marcar <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-white text-slate-900">
              {!onBulkMarker ? (
                <DropdownMenuItem onSelect={() => onToolbarAction?.("etiquetas")}>
                  <Tag className="mr-2 h-4 w-4" />
                  Perfil de consulta — entender permissões
                </DropdownMenuItem>
              ) : markerOptions.length === 0 ? (
                <DropdownMenuItem onSelect={onCreateMarker} disabled={!onCreateMarker}>
                  <Plus className="mr-2 h-4 w-4" /> Criar meu primeiro marcador
                </DropdownMenuItem>
              ) : markerOptions.map((m, i) => (
                <DropdownMenuItem key={i} onSelect={() => onBulkMarker(m)}>
                  {m.emoji ? <span className="mr-2 text-base leading-none">{m.emoji}</span> :
                    <ProfessionalMarkerIcon className="mr-2 h-4 w-4 sig-flag-filled" style={{ color: m.color, fill: m.color }} />}{m.label}
                </DropdownMenuItem>
              ))}
              {onCreateMarker ? <DropdownMenuItem onSelect={onCreateMarker}>
                <Plus className="mr-2 h-4 w-4" />Criar marcador na minha pasta
              </DropdownMenuItem> : null}
              {onToolbarAction ? <DropdownMenuItem onSelect={() => onToolbarAction("etiquetas")}>
                <Tag className="mr-2 h-4 w-4" />Gerenciar ou remover marcadores
              </DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {onCreateMarker ? (
            <Button type="button" size="sm" variant="outline"
              className="sig-workspace-action sig-workspace-action-create-marker w-9 shrink-0 !px-0"
              onClick={onCreateMarker} title="Criar novo marcador pessoal, como no SEI"
              aria-label="Novo marcador">
              <Plus className="h-4 w-4" />
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline"
            className="sig-workspace-action sig-workspace-action-unit"
            data-unit-completion-action="true"
            disabled={!onUnitAction || !showSensitiveDetails ||
              bulkBusy || selectedCount === 0}
            title={!unitDataReady
              ? "Clique para consultar a disponibilidade de conclusão nesta unidade"
              : selectedMixedStates ? "Selecione processos no mesmo estado da unidade"
                : "Ação somente da unidade atual, sem alterar o status municipal"}
            onClick={() => onUnitAction?.(!selectedAllCompleted)}
            data-unit-candidate={canOperateInUnit ? "authorized" : "check-permissions"}>
            {selectedAllCompleted ? <RotateCcw className="h-4 w-4" /> :
              <CheckCircle2 className="h-4 w-4" />}
            {selectedAllCompleted ? "Reabrir na unidade" : "Concluir nesta unidade"}
          </Button>
          {([
            { label: "Prioridade", Icon: SlidersHorizontal, dispatch: false },
            { label: "Atribuir", Icon: UsersRound, dispatch: false },
            { label: "Encaminhar", Icon: Forward, dispatch: true },
            { label: "Decisão", Icon: Gavel, dispatch: false },
            { label: "Etiquetas", Icon: Tag, dispatch: false },
          ] as const).map(({ label, Icon, dispatch }) => {
            if (onToolbarAction) {
              // A selected process always opens an action dialog. The dialog
              // performs per-process authorization and never silently changes
              // an official decision or bypasses departmental ownership.
              const key: ProcessWorkspaceAction =
                label === "Decisão" ? "decisao" : label.toLowerCase() as ProcessWorkspaceAction;
              return <Button key={label} size="sm" variant="outline" type="button"
                className={"sig-workspace-action sig-workspace-action-operational " + (label === "Decisão" ? "sig-workspace-action-green" : "")}
                data-operation={key}
                data-selection-active={selectedCount > 0 ? "true" : "false"}
                disabled={selectedCount === 0 || bulkBusy || !showSensitiveDetails}
                onClick={() => onToolbarAction(key)}
                title={selectedCount === 0 ? "Selecione pelo menos um processo" : "Abrir operação: " + label}>
                <Icon className="h-4 w-4" />{label}<ChevronDown className="h-3.5 w-3.5" />
              </Button>;
            }
            // Legacy consumer: open a single authorized process record.
            // One "Encaminhar" control, never a second button that makes the
            // approved single-line toolbar wrap when users select many rows.
            // The supplied sector handler keeps its own permission checks.
            const multipleDispatch = Boolean(dispatch && selectedCount > 1 && onBulkDispatch);
            // Every operational action must pass the process-level sector
            // authorization; readonly municipal admins may inspect, not decide.
            const enabled = Boolean(showSensitiveDetails && (
              (oneSelected && canDispatch(oneSelected)) ||
              multipleDispatch
            ));
            if (multipleDispatch) {
              return <Button key={label} size="sm" variant="outline" type="button"
                disabled={!showSensitiveDetails || bulkBusy}
                onClick={onBulkDispatch} className="sig-workspace-action"
                title="Encaminhar os processos selecionados pelo fluxo autorizado">
                <Icon className="h-4 w-4" />{label}<ChevronDown className="h-3.5 w-3.5" />
              </Button>;
            }
            return (
              <Button key={label} size="sm" variant="outline" type="button" asChild={enabled}
                disabled={!enabled} className={"sig-workspace-action " + (label === "Decisão" ? "sig-workspace-action-green" : "")}
                title={selectedCount !== 1 ? "Selecione um processo; atos oficiais são individuais" : "Abrir a ficha para " + label.toLowerCase()}>
                {enabled ? <Link to={dispatch ? buildProcessPath(oneSelected!, "historico") + "#despacho" : buildProcessPath(oneSelected!)}>
                  <Icon className="h-4 w-4" />{label}<ChevronDown className="h-3.5 w-3.5" /></Link>
                  : <><Icon className="h-4 w-4" />{label}<ChevronDown className="h-3.5 w-3.5" /></>}
              </Button>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="sig-workspace-action"
                disabled={!filteredCount || !showSensitiveDetails}>
                <Download className="h-4 w-4" /> Excel <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[240px] bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
              <DropdownMenuItem disabled={selectedCount === 0}
                onSelect={() => onExport("selected")}>Exportar selecionados ({selectedCount}) — .xlsx</DropdownMenuItem>
              <DropdownMenuItem disabled={!filteredCount}
                onSelect={() => onExport("filtered")}>Exportar resultados filtrados ({filteredCount}) — .xlsx</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
