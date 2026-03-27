import { ArrowRightLeft, CheckCheck, Clock3, Filter, History, Inbox, PauseCircle, Search, Send, ShieldCheck, Undo2, UserRoundCheck, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHero } from "@/components/platform/PageHero";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { TableCard } from "@/components/platform/TableCard";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { getVisibleProcessesByScope, isInternalRole, statusLabel } from "@/lib/platform";

type ControlTab = "visao-geral" | "recebidos" | "gerados" | "despachos" | "historico";
type DispatchPriority = "baixa" | "media" | "alta" | "critica";

export function MovementHistoryPage() {
  const { session } = usePlatformSession();
  const { scopeId } = useMunicipality();
  const { processes: allProcesses, sessionUsers, documentTemplates, dispatchProcess, acknowledgeDispatchReceipt, completeDispatches, returnDispatches, setProcessCheckpoint, setProcessOnHold } = usePlatformData();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ControlTab>("visao-geral");
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [batchTargetUnit, setBatchTargetUnit] = useState("");
  const [batchSubject, setBatchSubject] = useState("");
  const [batchDueDate, setBatchDueDate] = useState("");
  const [batchPriority, setBatchPriority] = useState<DispatchPriority>("media");
  const [batchAssignedTo, setBatchAssignedTo] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"todas" | DispatchPriority>("todas");
  const [unitFilter, setUnitFilter] = useState("todas");
  const [markerFilter, setMarkerFilter] = useState("todos");

  const currentUnit = session.department || session.title || "Unidade atual";
  const processes = useMemo(() => getVisibleProcessesByScope(session, scopeId, allProcesses), [allProcesses, scopeId, session]);

  const sectorOptions = useMemo(() => Array.from(new Set([currentUnit, ...processes.flatMap((process) => [process.processControl?.currentFolder, ...process.dispatches.flatMap((dispatch) => [dispatch.from, dispatch.to])])].filter(Boolean) as string[])), [currentUnit, processes]);

  const dispatchRows = useMemo(() => processes.flatMap((process) => process.dispatches.map((dispatch) => ({
    id: `${process.id}-${dispatch.id}`,
    processId: process.id,
    protocol: process.protocol,
    title: process.title,
    status: process.status,
    from: dispatch.from,
    to: dispatch.to,
    subject: dispatch.subject,
    dueDate: dispatch.dueDate,
    dispatchStatus: dispatch.status,
    visibility: dispatch.visibility || "interno",
    priority: dispatch.priority || "media",
    assignedTo: dispatch.assignedTo || "",
    currentFolder: process.processControl?.currentFolder || dispatch.to || process.sla.currentStage,
    externalTransitView: process.processControl?.externalTransitView ?? "completo",
  }))), [processes]);

  const markerOptions = useMemo(() => Array.from(new Set(processes.flatMap((process) => process.tags.map((tag) => (tag.includes("::") ? tag.split("::")[0] : tag))))), [processes]);

  const filterDispatchRow = (item: (typeof dispatchRows)[number]) => {
    const matchesSearch = `${item.protocol} ${item.subject} ${item.from} ${item.to} ${item.title} ${item.assignedTo}`.toLowerCase().includes(search.toLowerCase());
    const matchesPriority = priorityFilter === "todas" || item.priority === priorityFilter;
    const matchesUnit = unitFilter === "todas" || item.from === unitFilter || item.to === unitFilter || item.currentFolder === unitFilter;
    const process = processes.find((entry) => entry.id === item.processId);
    const matchesMarker = markerFilter === "todos" || !!process?.tags.some((tag) => (tag.includes("::") ? tag.split("::")[0] : tag) === markerFilter);
    return matchesSearch && matchesPriority && matchesUnit && matchesMarker;
  };

  const receivedRows = useMemo(() => dispatchRows.filter((item) => item.to.toLowerCase().includes(currentUnit.toLowerCase()) || currentUnit.toLowerCase().includes(item.to.toLowerCase())), [currentUnit, dispatchRows]);
  const generatedRows = useMemo(() => dispatchRows.filter((item) => item.from.toLowerCase().includes(currentUnit.toLowerCase()) || currentUnit.toLowerCase().includes(item.from.toLowerCase())), [currentUnit, dispatchRows]);
  const filteredDispatches = dispatchRows.filter(filterDispatchRow);
  const filteredReceived = receivedRows.filter(filterDispatchRow);
  const filteredGenerated = generatedRows.filter(filterDispatchRow);
  const assignedToMe = filteredDispatches.filter((item) => item.assignedTo === session.name);
  const urgentDispatches = dispatchRows.filter((item) => item.dispatchStatus === "aguardando");
  const criticalDispatches = dispatchRows.filter((item) => item.priority === "critica" || item.priority === "alta");
  const restrictedProcesses = processes.filter((process) => (process.processControl?.externalTransitView ?? "completo") === "restrito");
  const dispatchTemplates = documentTemplates.filter((template) => template.type === "despacho");
  const unitUsers = sessionUsers.filter((user) => !batchTargetUnit || (user.department || user.title || "").toLowerCase().includes(batchTargetUnit.toLowerCase()) || batchTargetUnit.toLowerCase().includes((user.department || user.title || "").toLowerCase()));
  const historyRows = useMemo(() => processes.flatMap((process) => [...process.timeline.map((entry) => ({ id: `${process.id}-${entry.id}`, processId: process.id, protocol: process.protocol, title: entry.title, detail: entry.detail, actor: entry.actor, at: entry.at })), ...process.auditTrail.filter((entry) => entry.visibleToExternal || isInternalRole(session.role)).map((entry) => ({ id: `${process.id}-${entry.id}`, processId: process.id, protocol: process.protocol, title: entry.title, detail: entry.detail, actor: entry.actor, at: entry.at }))]), [processes, session.role]);
  const filteredHistory = historyRows.filter((item) => `${item.protocol} ${item.title} ${item.detail} ${item.actor}`.toLowerCase().includes(search.toLowerCase()));
  const processBoxes = useMemo(() => sectorOptions.map((sector) => ({ sector, received: dispatchRows.filter((item) => item.to === sector).length, generated: dispatchRows.filter((item) => item.from === sector).length, awaiting: dispatchRows.filter((item) => item.currentFolder === sector && item.dispatchStatus === "aguardando").length })), [dispatchRows, sectorOptions]);
  const responsibleSummary = useMemo(() => Array.from(dispatchRows.reduce((map, item) => { const key = item.assignedTo || "Sem atribuição"; const current = map.get(key) || { name: key, total: 0, pending: 0, critical: 0 }; current.total += 1; if (item.dispatchStatus === "aguardando") current.pending += 1; if (item.priority === "alta" || item.priority === "critica") current.critical += 1; map.set(key, current); return map; }, new Map<string, { name: string; total: number; pending: number; critical: number }>())).map(([, value]) => value).sort((a, b) => b.pending - a.pending || b.critical - a.critical || b.total - a.total).slice(0, 6), [dispatchRows]);
  const tabs = [
    { value: "visao-geral", label: "Visão geral", helper: "Leitura executiva" },
    { value: "recebidos", label: "Recebidos", helper: "Fila da unidade" },
    { value: "gerados", label: "Gerados", helper: "Saídas formais" },
    { value: "despachos", label: "Despachos", helper: "Operação em lote" },
    { value: "historico", label: "Histórico", helper: "Trilha e auditoria" },
  ] as const;
  const showFilters = activeTab !== "visao-geral";
  const showBatchPanel = activeTab === "despachos";

  const toggleSelection = (processId: string) => setSelectedProcessIds((current) => current.includes(processId) ? current.filter((item) => item !== processId) : [...current, processId]);
  const clearSelection = () => setSelectedProcessIds([]);
  const getVisibleRowsByTab = () => activeTab === "recebidos" ? filteredReceived : activeTab === "gerados" ? filteredGenerated : activeTab === "despachos" ? filteredDispatches : filteredReceived.slice(0, 6);
  const selectAllVisible = () => setSelectedProcessIds(Array.from(new Set(getVisibleRowsByTab().map((item) => item.processId))));

  const handleBatchReceive = () => {
    if (selectedProcessIds.length === 0) return;
    acknowledgeDispatchReceipt({ processIds: selectedProcessIds, actor: session.name, unit: currentUnit });
    clearSelection();
  };
  const handleBatchDispatch = () => {
    if (selectedProcessIds.length === 0 || !batchTargetUnit.trim() || !batchSubject.trim() || !batchDueDate) return;
    selectedProcessIds.forEach((processId) => dispatchProcess({ processId, actor: session.name, from: currentUnit, to: batchTargetUnit.trim(), subject: batchSubject.trim(), dueDate: batchDueDate, visibility: "interno", priority: batchPriority, assignedTo: batchAssignedTo || undefined }));
    setBatchTargetUnit(""); setBatchSubject(""); setBatchDueDate(""); setBatchPriority("media"); setBatchAssignedTo(""); setSelectedTemplateId(""); clearSelection();
  };
  const handleBatchComplete = () => { if (selectedProcessIds.length === 0) return; completeDispatches({ processIds: selectedProcessIds, actor: session.name, unit: currentUnit }); clearSelection(); };
  const handleBatchReturn = () => { if (selectedProcessIds.length === 0) return; returnDispatches({ processIds: selectedProcessIds, actor: session.name, unit: currentUnit, reason: returnReason }); setReturnReason(""); clearSelection(); };
  const handleSetCheckpoint = () => { if (selectedProcessIds.length === 0 || !checkpoint.trim()) return; setProcessCheckpoint({ processIds: selectedProcessIds, actor: session.name, checkpoint }); setCheckpoint(""); clearSelection(); };
  const handleOnHold = (onHold: boolean) => { if (selectedProcessIds.length === 0) return; setProcessOnHold({ processIds: selectedProcessIds, actor: session.name, onHold, reason: holdReason }); if (onHold) setHoldReason(""); clearSelection(); };

  const renderDispatchList = (rows: typeof dispatchRows, emptyText: string, compact?: boolean, hideSelection?: boolean) =>
    rows.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">{emptyText}</div>
    ) : (
      <div className="space-y-3">
        {rows.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {hideSelection ? null : <input type="checkbox" checked={selectedProcessIds.includes(item.processId)} onChange={() => toggleSelection(item.processId)} className="mt-1 h-4 w-4 rounded border-slate-300" />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.protocol}</p>
                    <Badge variant="outline" className="rounded-full capitalize">{statusLabel(item.status)}</Badge>
                    <Badge variant="outline" className="rounded-full capitalize">{item.priority}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{item.subject}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.from} <span className="px-1 text-slate-400">→</span> {item.to}</p>
                  <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500">{item.title}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full capitalize">{item.dispatchStatus}</Badge>
                {item.assignedTo ? <Badge variant="outline" className="rounded-full">{item.assignedTo}</Badge> : null}
              </div>
            </div>
            <div className={`mt-3 grid gap-3 ${compact ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Prazo</p><p className="mt-2 text-sm font-medium text-slate-900">{item.dueDate}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Pasta atual</p><p className="mt-2 text-sm font-medium text-slate-900">{item.currentFolder}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Visibilidade</p><p className="mt-2 text-sm font-medium text-slate-900">{item.externalTransitView === "restrito" ? "Fluxo restrito" : "Fluxo completo"}</p></div>
              {compact ? null : <div className="flex items-end justify-end"><Link to={`/processos/${item.processId}`}><Button type="button" variant="outline" className="rounded-full">Abrir processo</Button></Link></div>}
            </div>
          </div>
        ))}
      </div>
    );

  const renderHistoryList = () => filteredHistory.length === 0 ? (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">Nenhum registro histórico encontrado com os filtros atuais.</div>
  ) : (
    <div className="space-y-3">
      {filteredHistory.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{item.protocol}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.at}</p>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{item.actor}</p>
            </div>
            <Link to={`/processos/${item.processId}`}><Button type="button" variant="outline" className="rounded-full">Abrir processo</Button></Link>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <PortalFrame eyebrow="Controle de processos" title="Mesa institucional de tramitação">
      <PageShell>
        <PageHero eyebrow="Controle oficial" title="Recebimentos, despachos e rastreabilidade" description="Organize a tramitação por unidade com leitura executiva e operação em áreas próprias." icon={Workflow} />

        <PageStatsRow className="xl:grid-cols-5">
          <StatCard label="Processos visíveis" value={String(processes.length)} description="Carteira institucional do escopo atual" icon={Workflow} tone="blue" />
          <StatCard label="Recebidos" value={String(receivedRows.length)} description="Itens destinados à unidade" icon={Inbox} tone="emerald" />
          <StatCard label="Gerados" value={String(generatedRows.length)} description="Encaminhamentos emitidos" icon={Send} tone="amber" />
          <StatCard label="Fluxos restritos" value={String(restrictedProcesses.length)} description="Trâmites internos protegidos" icon={ShieldCheck} tone="default" />
          <StatCard label="Pendências de prazo" value={String(urgentDispatches.length)} description="Aguardando resposta formal" icon={Clock3} tone="rose" />
        </PageStatsRow>

        <InternalSectionNav items={tabs as unknown as Array<{ value: string; label: string; helper?: string }>} value={activeTab} onChange={(value) => setActiveTab(value as ControlTab)} />

        {showFilters ? (
          <SectionCard title="Pesquisa e filtros" description="Localize protocolos, unidades, prioridades e marcadores sem poluir a visão principal." icon={Filter}>
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por protocolo, assunto, origem, destino ou responsável" className="h-12 rounded-2xl pl-11" />
              </div>
              <div className="grid gap-3 xl:grid-cols-4">
                <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as "todas" | DispatchPriority)}><SelectTrigger className="rounded-2xl"><SelectValue placeholder="Prioridade" /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as prioridades</SelectItem><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="critica">Crítica</SelectItem></SelectContent></Select>
                <Select value={unitFilter} onValueChange={setUnitFilter}><SelectTrigger className="rounded-2xl"><SelectValue placeholder="Unidade" /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as unidades</SelectItem>{sectorOptions.map((sector) => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}</SelectContent></Select>
                <Select value={markerFilter} onValueChange={setMarkerFilter}><SelectTrigger className="rounded-2xl"><SelectValue placeholder="Marcador" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os marcadores</SelectItem>{markerOptions.map((marker) => <SelectItem key={marker} value={marker}>{marker}</SelectItem>)}</SelectContent></Select>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => { setPriorityFilter("todas"); setUnitFilter("todas"); setMarkerFilter("todos"); setSearch(""); }}>Limpar filtros</Button>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {showBatchPanel ? (
          <SectionCard title="Operação em lote" description="Receba, devolva, atribua e despache múltiplos processos sem misturar essa área com a visão executiva." icon={ArrowRightLeft} actions={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="rounded-full" onClick={selectAllVisible}>Selecionar visíveis</Button><Button type="button" variant="outline" className="rounded-full" onClick={clearSelection}>Limpar seleção</Button></div>}>
            <div className="space-y-3">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="sig-label">Selecionados</p><p className="mt-2 text-base font-semibold text-slate-950">{selectedProcessIds.length}</p><p className="mt-1 text-sm text-slate-500">Processos prontos para ação em lote.</p></div>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleBatchReceive} disabled={selectedProcessIds.length === 0}><CheckCheck className="mr-2 h-4 w-4" />Receber em lote</Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleBatchComplete} disabled={selectedProcessIds.length === 0}>Concluir despacho</Button>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <Select value={selectedTemplateId} onValueChange={(value) => { setSelectedTemplateId(value); const template = dispatchTemplates.find((item) => item.id === value); if (template) setBatchSubject(template.title); }}><SelectTrigger className="rounded-2xl"><SelectValue placeholder="Texto padrão do despacho" /></SelectTrigger><SelectContent>{dispatchTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.title}</SelectItem>)}</SelectContent></Select>
                <Select value={batchPriority} onValueChange={(value) => setBatchPriority(value as DispatchPriority)}><SelectTrigger className="rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baixa">Prioridade baixa</SelectItem><SelectItem value="media">Prioridade média</SelectItem><SelectItem value="alta">Prioridade alta</SelectItem><SelectItem value="critica">Prioridade crítica</SelectItem></SelectContent></Select>
              </div>
              <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_220px_180px_auto]">
                <Select value={batchTargetUnit} onValueChange={setBatchTargetUnit}><SelectTrigger className="rounded-2xl"><SelectValue placeholder="Destino do despacho" /></SelectTrigger><SelectContent>{sectorOptions.filter((sector) => sector !== currentUnit).map((sector) => <SelectItem key={sector} value={sector}>{sector}</SelectItem>)}</SelectContent></Select>
                <Input value={batchSubject} onChange={(event) => setBatchSubject(event.target.value)} placeholder="Assunto institucional do despacho" />
                <Select value={batchAssignedTo} onValueChange={(value) => setBatchAssignedTo(value === "__sem_atribuicao__" ? "" : value)}><SelectTrigger className="rounded-2xl"><SelectValue placeholder="Responsável de destino" /></SelectTrigger><SelectContent><SelectItem value="__sem_atribuicao__">Sem atribuição imediata</SelectItem>{unitUsers.map((user) => <SelectItem key={user.id} value={user.name}>{user.name} - {user.title}</SelectItem>)}</SelectContent></Select>
                <Input type="date" value={batchDueDate} onChange={(event) => setBatchDueDate(event.target.value)} />
                <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" onClick={handleBatchDispatch} disabled={selectedProcessIds.length === 0 || !batchTargetUnit || !batchSubject || !batchDueDate}><Send className="mr-2 h-4 w-4" />Despachar</Button>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                <Input value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} placeholder="Definir ponto de controle" />
                <Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Motivo da devolução" />
                <Button type="button" variant="outline" className="rounded-full" onClick={handleSetCheckpoint} disabled={selectedProcessIds.length === 0 || !checkpoint.trim()}><Workflow className="mr-2 h-4 w-4" />Ponto de controle</Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={handleBatchReturn} disabled={selectedProcessIds.length === 0}><Undo2 className="mr-2 h-4 w-4" />Devolver</Button>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input value={holdReason} onChange={(event) => setHoldReason(event.target.value)} placeholder="Motivo do sobrestamento administrativo" />
                <Button type="button" variant="outline" className="rounded-full" onClick={() => handleOnHold(true)} disabled={selectedProcessIds.length === 0}><PauseCircle className="mr-2 h-4 w-4" />Sobrestar</Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => handleOnHold(false)} disabled={selectedProcessIds.length === 0}>Reativar fluxo</Button>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {activeTab === "visao-geral" ? <PageMainGrid className="xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]"><PageMainContent><TableCard title="Caixas por unidade" description="Leitura institucional das pastas ativas, com recebidos, gerados e itens aguardando ação." icon={Workflow}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{processBoxes.map((box) => <div key={box.sector} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="sig-fit-title text-sm font-semibold text-slate-950">{box.sector}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Recebidos</p><p className="mt-2 text-sm font-medium text-slate-900">{box.received}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Gerados</p><p className="mt-2 text-sm font-medium text-slate-900">{box.generated}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Aguardando</p><p className="mt-2 text-sm font-medium text-slate-900">{box.awaiting}</p></div></div></div>)}</div></TableCard><div className="grid gap-5 xl:grid-cols-2"><TableCard title="Recebidos da unidade" description="Fila principal da pasta atual." icon={Inbox}>{renderDispatchList(filteredReceived.slice(0, 4), "Nenhum despacho recebido para esta unidade.", true, true)}</TableCard><TableCard title="Atribuídos a mim" description="Pendências direcionadas ao usuário atual." icon={UserRoundCheck}>{renderDispatchList(assignedToMe.slice(0, 4), "Nenhum despacho atribuído diretamente a você.", true, true)}</TableCard></div></PageMainContent><PageSideContent><SectionCard title="Painel da unidade" description="Contexto rápido da pasta ativa, do modelo de despacho e da visibilidade do fluxo." icon={ShieldCheck}><div className="space-y-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="sig-label">Unidade ativa</p><p className="mt-2 sig-fit-title text-sm font-medium text-slate-900">{currentUnit}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="sig-label">Fluxo restrito</p><p className="mt-2 text-sm font-medium text-slate-900">{restrictedProcesses.length} processo(s)</p><p className="mt-1 text-sm text-slate-500">Trâmites internos ocultos para o acesso externo.</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="sig-label">Texto padrão ativo</p><p className="mt-2 sig-fit-copy text-sm font-medium text-slate-900">{selectedTemplateId ? dispatchTemplates.find((item) => item.id === selectedTemplateId)?.title : "Nenhum texto padrão selecionado"}</p></div></div></SectionCard><SectionCard title="Prioridades de tramitação" description="Itens urgentes que pedem leitura ou resposta institucional." icon={Clock3}><div className="space-y-3">{criticalDispatches.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">Nenhum despacho prioritário agora.</div> : criticalDispatches.slice(0, 4).map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="sig-fit-title text-sm font-medium text-slate-900">{item.protocol}</p><p className="mt-2 sig-fit-copy text-sm text-slate-600">{item.subject}</p><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{item.from} → {item.to}</p></div>)}</div></SectionCard><SectionCard title="Distribuição por responsável" description="Leitura de carga para coordenação e chefia." icon={UserRoundCheck}><div className="space-y-3">{responsibleSummary.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">Nenhum responsável atribuído no momento.</div> : responsibleSummary.map((item) => <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="sig-fit-title text-sm font-medium text-slate-900">{item.name}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Total</p><p className="mt-2 text-sm font-medium text-slate-900">{item.total}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Aguardando</p><p className="mt-2 text-sm font-medium text-slate-900">{item.pending}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="sig-label">Críticos</p><p className="mt-2 text-sm font-medium text-slate-900">{item.critical}</p></div></div></div>)}</div></SectionCard></PageSideContent></PageMainGrid> : null}

        {activeTab === "recebidos" ? <TableCard title="Despachos recebidos" description="Fila da unidade com prazo, responsável e pasta atual." icon={Inbox}>{renderDispatchList(filteredReceived, "Nenhum despacho recebido com os filtros atuais.")}</TableCard> : null}
        {activeTab === "gerados" ? <TableCard title="Despachos gerados" description="Saídas formais emitidas pela unidade atual." icon={Send}>{renderDispatchList(filteredGenerated, "Nenhum despacho gerado com os filtros atuais.")}</TableCard> : null}
        {activeTab === "despachos" ? <TableCard title="Tramitação entre pastas" description="Mesa completa de despachos, atribuições e prioridades." icon={ArrowRightLeft}>{renderDispatchList(filteredDispatches, "Nenhuma tramitação registrada com os filtros atuais.")}</TableCard> : null}
        {activeTab === "historico" ? <TableCard title="Histórico operacional" description="Linha institucional de auditoria, eventos e marcos do processo." icon={History}>{renderHistoryList()}</TableCard> : null}
      </PageShell>
    </PortalFrame>
  );
}
