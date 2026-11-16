import { ChevronDown, ChevronRight, CircleAlert, Download, FileText, Flame, FolderOpen, Forward, Gavel, Layers3, Search, SlidersHorizontal, Tag, Timer, UserRound, UsersRound, Flag, X, Rows3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildProcessPath, type ProcessRecord } from "@/lib/platform";

export type ProcessQuickFilter = "todos" | "meus" | "criticos" | "pendencias" | "decisao";
export type ProcessMarkerOption = { label: string; color: string };
export function processIsCritical(p: ProcessRecord) {
  return Boolean(p.sla?.breached || (typeof p.sla?.hoursRemaining === "number" && p.sla.hoursRemaining <= 12));
}
export function processPendingGuideCount(p: ProcessRecord) {
  const guides = p.payment?.guides ?? [];
  return guides.length ? guides.filter(g => g.status === "pendente").length
    : (p.payment?.guideNumber && p.payment.status === "pendente" ? 1 : 0);
}
export function processHasRequirement(p: ProcessRecord) {
  return (p.requirements ?? []).some(r => r.status === "aberta" || r.status === "respondida");
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
  onBulkDispatch?: () => void;
  onExport: () => void;
};

const filterSpecs = [
  { id: "meus", label: "Meus processos", Icon: UserRound },
  { id: "criticos", label: "SLA crítico", Icon: Flame },
  { id: "pendencias", label: "Pendências", Icon: CircleAlert },
  { id: "decisao", label: "Em decisão", Icon: Gavel },
  { id: "todos", label: "Todos", Icon: Layers3 },
] as const;

export function ProcessWorkspaceHeader({
  processes, filteredCount, search, onSearch, quickFilter, onFilter, operatorName,
  selectedCount, allPageSelected, pageCount, onTogglePage, onClearSelection,
  oneSelected, canDispatch, showSensitiveDetails, bulkBusy, markerOptions,
  onBulkMarker, onBulkDispatch, onExport,
}: ProcessWorkspaceHeaderProps) {
  const stats = [
    { key: "total", label: "Processos no município", count: processes.length, Icon: FolderOpen, tone: "blue" },
    { key: "critical", label: "Com atenção ao prazo", count: processes.filter(processIsCritical).length, Icon: Timer, tone: "amber" },
    { key: "guides", label: "Guias pendentes", count: processes.reduce((v, p) => v + processPendingGuideCount(p), 0), Icon: FileText, tone: "violet" },
    { key: "decision", label: "Aguardando decisão", count: processes.filter(processAwaitsDecision).length, Icon: Gavel, tone: "green" },
  ] as const;
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
        <div className="sig-workspace-filters" role="group" aria-label="Filtros rápidos">
          <span>Filtros rápidos:</span>
          {filterSpecs.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={"sig-workspace-chip " + (quickFilter === id ? "is-active" : "")}
              disabled={id === "meus" && !operatorName?.trim()}
              aria-pressed={quickFilter === id}
              title={id === "meus" && !operatorName?.trim() ? "Nome do servidor não disponível" : undefined}
              onClick={() => onFilter(id)}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
      </div>
      <div data-sigapro-process-bulk-actions="true" className="sig-workspace-actions">
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
              {onBulkMarker && markerOptions.length > 0 ? markerOptions.map((m, i) => (
                <DropdownMenuItem key={i} onSelect={() => onBulkMarker(m)}>
                  <Flag className="mr-2 h-4 w-4" style={{ color: m.color }} />{m.label}
                </DropdownMenuItem>
              )) : oneSelected ? (
                <DropdownMenuItem asChild><Link to={buildProcessPath(oneSelected)}>Abrir ficha para administrar marcadores</Link></DropdownMenuItem>
              ) : <DropdownMenuItem disabled>Selecione um processo</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          {([
            { label: "Prioridade", Icon: SlidersHorizontal, dispatch: false },
            { label: "Atribuir", Icon: UsersRound, dispatch: false },
            { label: "Encaminhar", Icon: Forward, dispatch: true },
            { label: "Decisão", Icon: Gavel, dispatch: false },
            { label: "Etiquetas", Icon: Tag, dispatch: false },
          ] as const).map(({ label, Icon, dispatch }) => {
            const enabled = Boolean(showSensitiveDetails && oneSelected && (!dispatch || canDispatch(oneSelected)));
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
          {onBulkDispatch && selectedCount > 0 ? (
            <Button type="button" variant="outline" size="sm" className="sig-workspace-action"
              onClick={onBulkDispatch}><Forward className="h-4 w-4" /> Encaminhar seleção</Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="sig-workspace-action" onClick={onExport}
            disabled={!filteredCount || !showSensitiveDetails}><Download className="h-4 w-4" /> Exportar <ChevronDown className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="sig-workspace-list-context" aria-live="polite"><Rows3 className="h-4 w-4" />{filteredCount.toLocaleString("pt-BR")} processos encontrados</div>
    </div>
  );
}
