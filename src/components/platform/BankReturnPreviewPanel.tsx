import { useEffect, useState } from "react";
import { FileCheck2, FileSearch, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { municipalCollectionApiRequest } from "@/lib/municipalCollectionApi";

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
  municipalityId, readOnly = false,
}: { municipalityId: string; readOnly?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [guideCode, setGuideCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    setFile(null); setGuideCode(""); setResult(null); setError("");
  }, [municipalityId]);
  const preview = async () => {
    if (!file || !municipalityId || readOnly || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      if (file.size <= 0 || file.size > 450_000)
        throw new Error("Selecione um retorno CNAB240 de até 450 KB.");
      // Latin-1 preserves the original single-byte fixed-width CNAB columns.
      const content = new TextDecoder("iso-8859-1").decode(await file.arrayBuffer());
      const response = await municipalCollectionApiRequest<Result>(
        "collection-configuration", municipalityId, "bank_return_preview", {
          fileContent: content,
          ...(guideCode.trim() ? { guideCode: guideCode.trim() } : {}),
        }, 30000,
      );
      if (response.bankAuthenticated !== false || response.automaticSettlementAllowed !== false)
        throw new Error("O servidor retornou um estado financeiro não autorizado para pré-conferência.");
      setResult(response);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível ler o retorno bancário.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-bank-return-preview="true" className="rounded-[26px] border border-sky-200 bg-white p-5 text-slate-900 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <FileSearch aria-hidden className="mt-1 h-6 w-6 shrink-0 text-sky-800"/>
        <div>
          <h3 className="text-lg font-extrabold text-slate-950">Leitura de retorno bancário — CNAB240</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Confira o arquivo de retorno emitido pelo banco da Prefeitura. O SIGAPRO confere banco,
            segmentos, valores e datas sem cadastrar pagamento, alterar guia ou liberar protocolo.
            Para confirmação automática, o convênio e o conector bancário precisam estar homologados.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="sigapro-return-file" className="font-semibold text-slate-900">Arquivo de retorno CNAB240</Label>
          <Input key={municipalityId} id="sigapro-return-file" type="file" accept=".ret,.txt,.cnab,text/plain"
            disabled={readOnly || busy}
            onChange={event => {setFile(event.target.files?.[0] || null);setResult(null);setError("");}}
            className="h-auto min-h-11 cursor-pointer border-slate-300 bg-white py-2 text-slate-900 file:mr-3 file:rounded-md file:bg-sky-100 file:px-2 file:py-1 file:font-medium file:text-sky-900"/>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sigapro-return-guide" className="font-semibold text-slate-900">Número da guia (opcional)</Label>
          <Input id="sigapro-return-guide" value={guideCode} disabled={readOnly || busy}
            placeholder="Comparar com uma guia do Neon" maxLength={120}
            onChange={e => {setGuideCode(e.target.value);setResult(null);}}/>
        </div>
        <Button type="button" disabled={readOnly || busy || !file} onClick={() => void preview()}
          className="min-h-11 bg-sky-900 font-semibold text-white hover:bg-sky-800">
          <FileCheck2 aria-hidden className="mr-2 h-4 w-4"/>{busy ? "Conferindo arquivo..." : "Pré-conferir retorno"}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Os dados do arquivo são enviados exclusivamente ao servidor SIGAPRO no comando de conferência,
        sem gravação do arquivo. Não envie arquivos de outro município nem utilize esta tela para dar baixa.
      </p>
      {readOnly && <p className="mt-3 text-sm font-medium text-amber-800">Perfil somente leitura: importação bancária indisponível.</p>}
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
