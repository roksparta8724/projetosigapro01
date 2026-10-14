import { useMemo, useState } from "react";
import { Network, PencilLine, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { MunicipalOrganizationChart } from "@/components/platform/MunicipalOrganizationChart";
import { PageHero } from "@/components/platform/PageHero";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageShell } from "@/components/platform/PageShell";
import { TableCard } from "@/components/platform/TableCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMunicipality } from "@/hooks/useMunicipality";
import { useMunicipalOrganogram } from "@/hooks/useMunicipalOrganogram";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  upsertRemoteMunicipalDepartment,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";

const UNIT_TYPES = [
  ["secretaria", "Secretaria"],
  ["diretoria", "Diretoria"],
  ["departamento", "Departamento"],
  ["coordenadoria", "Coordenadoria"],
  ["setor", "Setor"],
  ["divisao", "Divisão"],
  ["unidade", "Unidade"],
] as const;

type EditorState = {
  id: string | null;
  name: string;
  code: string;
  unitType: string;
  parentDepartmentId: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  name: "",
  code: "",
  unitType: "departamento",
  parentDepartmentId: "root",
  sortOrder: "100",
  isActive: true,
};

export function MunicipalOrganizationPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId, name: municipalityName } = useMunicipality();
  const municipalityId =
    municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? null;

  const {
    departments,
    status,
    hasLocalOverride,
    saveLocalDepartments,
    clearLocalOverride,
    refreshRemote,
    localValidation,
  } = useMunicipalOrganogram(municipalityId, { includeInactive: true });

  const canEdit =
    session.role === "prefeitura_admin" ||
    session.role === "master_admin" ||
    session.role === "master_ops";

  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStatus, setEditorStatus] = useState("");

  const descendantsOfEditingUnit = useMemo(() => {
    if (!editor.id) return new Set<string>();

    const blocked = new Set<string>([editor.id]);
    let changed = true;
    while (changed) {
      changed = false;
      departments.forEach((department) => {
        if (
          department.parentDepartmentId &&
          blocked.has(department.parentDepartmentId) &&
          !blocked.has(department.id)
        ) {
          blocked.add(department.id);
          changed = true;
        }
      });
    }
    return blocked;
  }, [departments, editor.id]);

  const possibleParents = useMemo(
    () =>
      departments
        .filter((department) => !descendantsOfEditingUnit.has(department.id))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")),
    [departments, descendantsOfEditingUnit],
  );

  const startCreate = (parentDepartmentId = "root") => {
    if (!canEdit) return;
    const maxSort = departments.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0);
    setEditor({
      ...EMPTY_EDITOR,
      parentDepartmentId,
      sortOrder: String(maxSort + 10),
    });
    setEditorStatus("");
    setEditorOpen(true);
  };

  const startEdit = (department: MunicipalDepartmentRecord) => {
    if (!canEdit) return;
    setEditor({
      id: department.id,
      name: department.name,
      code: department.code || "",
      unitType: department.unitType || "departamento",
      parentDepartmentId: department.parentDepartmentId || "root",
      sortOrder: String(department.sortOrder ?? 100),
      isActive: department.isActive,
    });
    setEditorStatus("");
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    if (!canEdit || !municipalityId) return;
    const name = editor.name.trim();
    if (!name) {
      setEditorStatus("Informe o nome da unidade.");
      return;
    }

    const sortOrder = Number(editor.sortOrder);
    const nextDepartment: MunicipalDepartmentRecord = {
      id: editor.id || `local-org-${crypto.randomUUID()}`,
      municipalityId,
      code: editor.code.trim().toUpperCase(),
      name,
      description: editor.id
        ? departments.find((item) => item.id === editor.id)?.description || ""
        : "",
      email: editor.id
        ? departments.find((item) => item.id === editor.id)?.email || ""
        : "",
      phone: editor.id
        ? departments.find((item) => item.id === editor.id)?.phone || ""
        : "",
      isActive: editor.isActive,
      parentDepartmentId:
        editor.parentDepartmentId === "root" ? null : editor.parentDepartmentId,
      unitType: editor.unitType,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    };

    const next = editor.id
      ? departments.map((item) => (item.id === editor.id ? nextDepartment : item))
      : [...departments, nextDepartment];

    try {
      if (localValidation) {
        saveLocalDepartments(next);
        setEditorStatus("Organograma atualizado localmente para os testes.");
      } else {
        await upsertRemoteMunicipalDepartment({
          municipalityId,
          departmentId: editor.id,
          name: nextDepartment.name,
          code: nextDepartment.code,
          description: nextDepartment.description,
          email: nextDepartment.email,
          phone: nextDepartment.phone,
          parentDepartmentId: nextDepartment.parentDepartmentId,
          unitType: nextDepartment.unitType,
          sortOrder: nextDepartment.sortOrder,
          isActive: nextDepartment.isActive,
        });
        refreshRemote();
        setEditorStatus("Organograma municipal atualizado.");
      }
      setEditorOpen(false);
      setEditor(EMPTY_EDITOR);
    } catch (error) {
      setEditorStatus(
        error instanceof Error ? error.message : "Não foi possível salvar o organograma.",
      );
    }
  };

  const toggleUnit = async (department: MunicipalDepartmentRecord) => {
    if (!canEdit || !municipalityId) return;
    const nextActive = !department.isActive;

    try {
      if (localValidation) {
        saveLocalDepartments(
          departments.map((item) =>
            item.id === department.id ? { ...item, isActive: nextActive } : item,
          ),
        );
      } else {
        await upsertRemoteMunicipalDepartment({
          municipalityId,
          departmentId: department.id,
          name: department.name,
          code: department.code,
          description: department.description,
          email: department.email,
          phone: department.phone,
          parentDepartmentId: department.parentDepartmentId,
          unitType: department.unitType,
          sortOrder: department.sortOrder,
          isActive: nextActive,
        });
        refreshRemote();
      }
      setEditorStatus(
        department.isActive
          ? `${department.name} foi ocultado do organograma ativo.`
          : `${department.name} voltou ao organograma ativo.`,
      );
    } catch (error) {
      setEditorStatus(
        error instanceof Error ? error.message : "Não foi possível alterar esta unidade.",
      );
    }
  };

  const removeUnit = async (department: MunicipalDepartmentRecord) => {
    if (!canEdit || !municipalityId) return;

    try {
      if (localValidation) {
        const nextParent = department.parentDepartmentId;
        saveLocalDepartments(
          departments
            .filter((item) => item.id !== department.id)
            .map((item) =>
              item.parentDepartmentId === department.id
                ? { ...item, parentDepartmentId: nextParent }
                : item,
            ),
        );
        setEditorStatus(`${department.name} foi removido da estrutura local de teste.`);
      } else {
        await upsertRemoteMunicipalDepartment({
          municipalityId,
          departmentId: department.id,
          name: department.name,
          code: department.code,
          description: department.description,
          email: department.email,
          phone: department.phone,
          parentDepartmentId: department.parentDepartmentId,
          unitType: department.unitType,
          sortOrder: department.sortOrder,
          isActive: false,
        });
        refreshRemote();
        setEditorStatus(`${department.name} foi desativado no organograma municipal.`);
      }
      setEditorOpen(false);
      setEditor(EMPTY_EDITOR);
    } catch (error) {
      setEditorStatus(
        error instanceof Error ? error.message : "Não foi possível remover esta unidade.",
      );
    }
  };

  const activeCount = departments.filter((item) => item.isActive).length;

  return (
    <PortalFrame eyebrow="Estrutura institucional" title="Organograma municipal">
      <PageShell>
        <PageHero
          eyebrow={municipalityName || municipality?.name || "Prefeitura"}
          title="Estrutura da Prefeitura"
          description="O organograma é a referência única de unidades e siglas em todo o SIGAPRO. Ele aparece nos departamentos, processos e destinos de despacho."
          icon={Network}
          actions={
            canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => startCreate()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova unidade
                </Button>
                {localValidation && hasLocalOverride ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      clearLocalOverride();
                      setEditorOpen(false);
                      setEditorStatus("Estrutura local removida. O SIGAPRO voltou ao organograma oficial carregado.");
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restaurar oficial
                  </Button>
                ) : null}
              </div>
            ) : undefined
          }
        />

        {canEdit ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p className="font-semibold">Administrador da Prefeitura — gestão do organograma</p>
            <p className="mt-1 leading-6">
              Você pode criar unidades, alterar siglas e nomes, reorganizar a hierarquia,
              mudar a ordem e ativar ou ocultar setores. {localValidation
                ? "Nesta fase as alterações ficam somente no ambiente local de teste e são refletidas em todo o SIGAPRO deste navegador."
                : "As alterações são salvas no organograma oficial desta Prefeitura."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            O organograma é de consulta. A edição institucional é exclusiva do Administrador da Prefeitura.
          </div>
        )}

        {status && departments.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {status}
          </div>
        ) : null}

        {editorStatus ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {editorStatus}
          </div>
        ) : null}

        {editorOpen && canEdit ? (
          <TableCard
            title={editor.id ? "Editar unidade" : "Nova unidade"}
            description="Defina a posição desta unidade dentro do organograma municipal."
            icon={PencilLine}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Nome da unidade
                </p>
                <Input
                  value={editor.name}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ex.: Análise Urbanística"
                  className="h-11 rounded-xl"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Sigla
                </p>
                <Input
                  value={editor.code}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="Ex.: ANU"
                  className="h-11 rounded-xl uppercase"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Tipo
                </p>
                <Select
                  value={editor.unitType}
                  onValueChange={(value) =>
                    setEditor((current) => ({ ...current, unitType: value }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Unidade superior
                </p>
                <Select
                  value={editor.parentDepartmentId}
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      parentDepartmentId: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Sem unidade superior</SelectItem>
                    {possibleParents.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.code ? `${department.code} — ` : ""}
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Ordem
                </p>
                <Input
                  type="number"
                  value={editor.sortOrder}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      sortOrder: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Situação
                </p>
                <Select
                  value={editor.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      isActive: value === "active",
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="inactive">Oculta / inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editorStatus && editorOpen ? (
              <p className="mt-3 text-sm font-medium text-amber-700">{editorStatus}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                {editor.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      const department = departments.find((item) => item.id === editor.id);
                      if (department) void removeUnit(department);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover unidade
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    setEditorOpen(false);
                    setEditor(EMPTY_EDITOR);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900"
                  onClick={() => void saveEditor()}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Salvar estrutura
                </Button>
              </div>
            </div>
          </TableCard>
        ) : null}

        <TableCard
          title="Organograma"
          description={`${activeCount} unidade(s) ativa(s). A hierarquia abaixo é usada pelos processos e pelo despacho institucional.`}
          icon={Network}
        >
          <MunicipalOrganizationChart
            departments={departments}
            onEdit={canEdit ? startEdit : undefined}
          />

          {canEdit && departments.length > 0 ? (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                Unidades ocultas
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {departments.filter((item) => !item.isActive).length === 0 ? (
                  <span className="text-sm text-slate-500">Nenhuma unidade oculta.</span>
                ) : (
                  departments
                    .filter((item) => !item.isActive)
                    .map((department) => (
                      <button
                        key={department.id}
                        type="button"
                        onClick={() => void toggleUnit(department)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-800"
                      >
                        {department.code ? `${department.code} — ` : ""}
                        {department.name}
                        <span className="text-[10px] uppercase tracking-[0.08em] text-sky-600">
                          reativar
                        </span>
                      </button>
                    ))
                )}
              </div>
            </div>
          ) : null}
        </TableCard>
      </PageShell>
    </PortalFrame>
  );
}
