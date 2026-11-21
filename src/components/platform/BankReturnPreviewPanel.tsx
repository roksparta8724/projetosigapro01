import { useEffect, useRef, useState } from "react";
import { FileCheck2, FileSearch, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { municipalCollectionApiRequest } from "@/lib/municipalCollectionApi";
import { inspectBankFile, type BankFileInspection } from "@/lib/bankFileInspector";

type Candidate = {
  sequence: number;
  lot: string;
  movement: string;
  paidCents: number;
  netCents: number;
  occurrenceDate: string | null;
  creditDate: string | null;
  reference: string | null;
  classification: "possible_liquidation" | "other_event";
};
type Result = {
  format: "FEBRABAN_CNAB240_COLLECTION_RETURN";
  bankCode: string;
  sha256: string;
  recordCount: number;
  candidateCount: number;
  possibleLiquidations: number;
  totalPaidCents: number;
  bankAuthenticated: false;
  automaticSettlementAllowed: false;
  entries: Candidate[];
  cautions: string[];
  guideCode?: string;
  guideComparison?: Array<{
    referenceMatches: boolean;
    amountMatches: boolean;
    canAutomaticallySettle: false;
    status: string;
  }>;
};
const currency = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

/** File data is used only by this explicit user action; never saved in browser storage. */
export function BankReturnPreviewPanel({
  municipalityId, bankCode, readOnly = false,
}: { municipalityId: string; bankCode: string; readOnly?: boolean }) {
  const generation = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [local, setLocal] = useState<BankFileInspection | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [guideCode, setGuideCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const epoch = ++generation.current;
    setFile(null); setLocal(null); setLocalBusy(false);
    setGuideCode(""); setResult(null); setError(""); setBusy(false);
    return () => { if (generation.current === epoch) generation.current++; };
  }, [municipalityId, bankCode]);

  const inspectFile = async (nextFile: File | null) => {
    const epoch = ++generation.current;
    setFile(nextFile); setLocal(null); setResult(null); setError("");
    if (!nextFile) { setLocalBusy(false); return; }
    setLocalBusy(true);
    try {
      if (nextFile.size <= 0 || nextFile.size > 2_000_000)
        throw new Error("Selecione um arquivo textual bancário de até 2 MB.");
      // Fixed-width CNAB and OFX bank files are often Latin-1, not UTF-8.
      const text = new TextDecoder("iso-8859-1").decode(await nextFile.arrayBuffer());
      const inspected = inspectBankFile(text, bankCode);
      if (generation.current === epoch) setLocal(inspected);
    } catch (failure) {
      if (generation.current === epoch)
        setError(failure instanceof Error ? failure.message : "Arquivo bancário inválido.");
    } finally {
      if (generation.current === epoch) setLocalBusy(false);
    }
  };

  const preview = async () => {
    if (!file || local?.format !== "cnab240" || !municipalityId ||
        !bankCode || readOnly || busy || localBusy) return;
    const epoch = ++generation.current;
    setBusy(true); setError(""); setResult(null);
    try {
      if (file.size <= 0 || file.size > 450_000)
        throw new Error("A conferência detalhada CNAB240 aceita arquivos até 450 KB.");
      const content = new TextDecoder("iso-8859-1").decode(await file.arrayBuffer());
      const response = await municipalCollectionApiRequest<Result>(
        "collection-configuration", municipalityId, "bank_return_preview", {
          fileContent: content,
          ...(guideCode.trim() ? { guideCode: guideCode.trim() } : {}),
        }, 30000,
      );
      if (response.bankAuthenticated !== false || response.automaticSettlementAllowed !== false)
        throw new Error("O servidor retornou um estado financeiro não autorizado para pré-conferência.");
      if (generation.current === epoch) setResult(response);
    } catch (failure) {
      if (generation.current === epoch)
        setError(failure instanceof Error ? failure.message : "Não foi possível conferir o retorno CNAB240.");
    } finally {
      if (generation.current === epoch) setBusy(false);
    }
  };
  return (
    <section data-bank-return-preview="true" className="rounded-[26px] border border-sky-200 bg-white p-5 text-slate-900 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <FileSearch aria-hidden className="mt-1 h-6 w-6 shrink-0 text-sky-800"/>
        <div>
          <h3 className="text-lg font-extrabold text-slate-950">Leitura bancária unificada — OFX, CNAB240 e CNAB400</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Faça a conferência estrutural local de extratos OFX e retornos CNAB240/CNAB400.
            Para CNAB240, a conferência detalhada compara registros e, opcionalmente,
            uma guia existente no Neon, sem liberar baixa financeira ou protocolo.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="sigapro-return-file" className="font-semibold text-slate-900">Arquivo bancário de retorno ou extrato</Label>
          <Input key={municipalityId + bankCode} id="sigapro-return-file" type="file" accept=".ofx,.ret,.txt,.cnab,text/plain"
            disabled={readOnly || busy || localBusy}
            onChange={event => {void inspectFile(event.target.files?.[0] || null);}}
            className="h-auto min-h-11 cursor-pointer border-slate-300 bg-white py-2 text-slate-900 file:mr-3 file:rounded-md file:bg-sky-100 file:px-2 file:py-1 file:font-medium file:text-sky-900"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sigapro-return-guide" className="font-semibold text-slate-900">Número da guia (opcional)</Label>
          <Input id="sigapro-return-guide" value={guideCode} disabled={readOnly || busy || local?.format !== "cnab240"}
            placeholder="Comparar com uma guia do Neon" maxLength={120}
            onChange={e => {generation.current++;setGuideCode(e.target.value);setResult(null);}}/>
        </div>
        <Button type="button" disabled={readOnly || busy || localBusy || local?.format !== "cnab240" || !file || !bankCode} onClick={() => void preview()}
          className="min-h-11 bg-sky-900 font-semibold text-white hover:bg-sky-800">
          <FileCheck2 aria-hidden className="mr-2 h-4 w-4"/>{busy ? "Conferindo CNAB..." : "Conferir CNAB com Neon"}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        A leitura inicial ocorre somente no navegador. Apenas ao clicar em Conferir CNAB com Neon
        o conteúdo CNAB240 é enviado ao servidor autenticado para comparação, sem gravar o arquivo
        nem confirmar pagamentos. OFX e CNAB400 permanecem exclusivamente em leitura local.
      </p>
      {readOnly && <p className="mt-3 text-sm font-medium text-amber-800">Perfil somente leitura: importação bancária indisponível.</p>}
      {localBusy && <p role="status" className="mt-3 text-sm text-sky-900">Conferindo o arquivo no navegador...</p>}
      {local && (
        <div data-bank-file-readonly="true" role="status" className="mt-4 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">Leitura inicial: {local.format.toUpperCase()} · {local.records} registros · {local.details} detalhes</p>
          {local.bankCode && <p>Banco identificado: {local.bankCode}{bankCode ? " · banco cadastrado: " + bankCode : ""}</p>}
          {local.incomingCredits !== null && <p>Créditos positivos no OFX: {local.incomingCredits} · identificadores repetidos: {local.duplicateIdentifiers}</p>}
          {local.warnings.map((warning, index) => <p key={index} className="text-xs leading-5 text-amber-950">{warning}</p>)}
          {local.format === "cnab240" && <p className="text-xs font-medium text-sky-900">Para conferir valores e referências com o Neon, selecione opcionalmente a guia e utilize o botão acima. O banco cadastrado deve estar confirmado.</p>}
        </div>
      )}
      {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">{error}</div>}
      {result && (
        <div role="status" className="mt-5 space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-950">
            <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0"/>
            <span>Pré-conferência concluída. Nenhum crédito bancário foi autenticado e nenhuma baixa financeira foi executada.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-600">Banco</p><p className="font-bold">{result.bankCode}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-600">Pares T/U</p><p className="font-bold">{result.candidateCount}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-600">Ocorrências 06 possíveis</p><p className="font-bold">{result.possibleLiquidations}</p></div>
            <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-600">Soma dos valores informados</p><p className="font-bold">{currency(result.totalPaidCents)}</p></div>
          </div>
          <p className="break-all text-xs text-slate-600">SHA-256 da leitura: {result.sha256}</p>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-900"><tr><th className="px-3 py-2">Lote / seq.</th><th className="px-3 py-2">Ocorrência</th><th className="px-3 py-2">Valor informado</th><th className="px-3 py-2">Data de crédito</th><th className="px-3 py-2">Situação</th></tr></thead>
              <tbody>{result.entries.map((entry, index) => (
                <tr key={entry.lot + ":" + entry.sequence + ":" + index} className="border-t border-slate-200">
                  <td className="px-3 py-2">{entry.lot} / {entry.sequence}</td>
                  <td className="px-3 py-2">{entry.movement}</td>
                  <td className="px-3 py-2">{currency(entry.paidCents)}</td>
                  <td className="px-3 py-2">{entry.creditDate || "Sem confirmação"}</td>
                  <td className="px-3 py-2 font-medium text-amber-900">
                    {result.guideComparison?.[index]?.status === "pending_independent_bank_proof"
                      ? "Valor/referência compatíveis; comprovação exigida"
                      : entry.classification === "possible_liquidation" ? "Possível liquidação; conferir" : "Outra ocorrência"}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-slate-700">
            Arquivos CNAB variam por instituição e convênio; a importação só prepara candidatos
            para a Tesouraria. O banco deverá fornecer prova independente antes de qualquer compensação.
          </p>
        </div>
      )}
    </section>
  );
}
