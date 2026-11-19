import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MARKER_COLOR_OPTIONS } from "@/hooks/useMarkerPresets";
import { Flag as PersonalTagIcon } from "@/components/platform/PremiumIcons";

export type CreatedPersonalMarker = {
  label: string;
  color: string;
  colorId: string;
  emoji: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  selectedCount: number;
  onCreate: (marker: CreatedPersonalMarker, applySelected: boolean) => Promise<void>;
};

const symbols = [
  { emoji: "", label: "Etiqueta original" },
  { emoji: "⭐", label: "Estrela" },
  { emoji: "📍", label: "Localização" },
  { emoji: "✅", label: "Confirmado" },
  { emoji: "⚠️", label: "Atenção" },
  { emoji: "🔔", label: "Aviso" },
];

export function CreateProcessMarkerDialog({
  open, onOpenChange, existingNames, selectedCount, onCreate,
}: Props) {
  const [name, setName] = useState("");
  const [colorId, setColorId] = useState("blue");
  const [emoji, setEmoji] = useState("");
  const [applySelected, setApplySelected] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedColor = MARKER_COLOR_OPTIONS.find(entry => entry.id === colorId)
    ?? MARKER_COLOR_OPTIONS[0];

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const label = name.trim();
    if (!label || label.length > 80) {
      setError("Informe um nome de até 80 caracteres.");
      return;
    }
    if (existingNames.some(entry => entry.trim().toLocaleLowerCase("pt-BR") ===
        label.toLocaleLowerCase("pt-BR"))) {
      setError("Já existe um marcador com esse nome. Escolha outro nome.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({ label, colorId, color: selectedColor.value, emoji },
        selectedCount > 0 && applySelected);
      setName("");
      setColorId("blue");
      setEmoji("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o marcador.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}>
      <DialogContent className="max-w-[510px] border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-white">
        <DialogHeader>
          <DialogTitle>Criar marcador</DialogTitle>
          <DialogDescription>
            Personalize sua pasta de marcadores, como no SEI. A situação oficial é independente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <label className="block space-y-1 text-sm font-semibold" htmlFor="sigapro-new-marker-name">
            Nome do marcador
            <Input id="sigapro-new-marker-name" autoFocus maxLength={80}
              placeholder="Ex.: Aguardar retorno" value={name} onChange={e => setName(e.target.value)} />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Cor do ícone</legend>
            <div className="grid grid-cols-6 gap-2">
              {MARKER_COLOR_OPTIONS.map(color => (
                <button key={color.id} type="button" aria-label={color.label}
                  aria-pressed={colorId === color.id} title={color.label}
                  onClick={() => setColorId(color.id)}
                  className={"flex h-10 items-center justify-center rounded-lg border bg-slate-50 dark:bg-slate-900 " +
                    (colorId === color.id ? "border-sky-700 ring-2 ring-sky-300" : "border-slate-200 dark:border-slate-700")}>
                  <PersonalTagIcon className="h-5 w-5" style={{ color: color.value, fill: color.value }} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1 text-sm font-semibold" htmlFor="sigapro-new-marker-symbol">
            Símbolo opcional
            <select id="sigapro-new-marker-symbol" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={emoji} onChange={event => setEmoji(event.target.value)}>
              {symbols.map(item => <option key={item.label} value={item.emoji}>{item.label}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900">
            {emoji ? <span className="text-xl">{emoji}</span> :
              <PersonalTagIcon className="h-5 w-5" style={{ color: selectedColor.value, fill: selectedColor.value }} />}
            <span className="font-semibold">{name.trim() || "Prévia do marcador"}</span>
          </div>
          {selectedCount > 0 ? (
            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={applySelected}
                onChange={event => setApplySelected(event.target.checked)} />
              Aplicar também aos {selectedCount} processo(s) selecionado(s), respeitando o limite de três por profissional.
            </label>
          ) : null}
          <p className="text-xs text-slate-600 dark:text-slate-300">
            O novo modelo ficará disponível na sua pasta de marcadores e na mesa de processos.
          </p>
          {error ? <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : selectedCount > 0 && applySelected ? "Criar e aplicar" : "Criar marcador"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
