import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Landmark, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { backendClient } from "@/integrations/backend/databaseClient";
import { validateMunicipalPixKey } from "@/lib/paymentCollection";
import { MUNICIPAL_BANK_DIRECTORY, findMunicipalBank, describeMunicipalBankChannel, selectMunicipalBank } from "@/lib/municipalBankCatalog";
import { municipalCollectionError } from "@/lib/collectionDiagnostics";
import { usePlatformData } from "@/hooks/usePlatformData";
import type { TenantSettings } from "@/lib/platform";

type BankFields = {
  beneficiarioArrecadacao: string;
  chavePix: string;
  pixEnabled: boolean;
  pixKeyType: NonNullable<TenantSettings["pixKeyType"]>;
  pixMerchantCity: string;
  bankCode: string;
  bankName: string;
  bankAgency: string;
  bankAgencyDigit: string;
  bankAccount: string;
  bankAccountDigit: string;
  bankBeneficiaryDocument: string;
  bankCollectionMode: NonNullable<TenantSettings["bankCollectionMode"]>;
  bankAgreementCode: string;
  bankWallet: string;
  bankInstructions: string;
};

const defaults: BankFields = {
  beneficiarioArrecadacao: "",
  chavePix: "",
  pixEnabled: false,
  pixKeyType: "cnpj",
  pixMerchantCity: "",
  bankCode: "",
  bankName: "",
  bankAgency: "",
  bankAgencyDigit: "",
  bankAccount: "",
  bankAccountDigit: "",
  bankBeneficiaryDocument: "",
  bankCollectionMode: "manual",
  bankAgreementCode: "",
  bankWallet: "",
  bankInstructions: "",
};

function normalizeBankFields(data: Partial<BankFields>): BankFields {
  return {
    ...defaults,
    ...Object.fromEntries(
      (Object.keys(defaults) as Array<keyof BankFields>).map((key) => {
        const value = data[key];
        return [key, key === "pixEnabled" ? value === true : String(value ?? defaults[key])];
      }),
    ),
    pixEnabled: data.pixEnabled === true,
    pixKeyType: (["cpf", "cnpj", "email", "phone", "random"].includes(String(data.pixKeyType))
      ? data.pixKeyType : "cnpj") as BankFields["pixKeyType"],
    bankCollectionMode: (["manual", "agreement", "api"].includes(String(data.bankCollectionMode))
      ? data.bankCollectionMode : "manual") as BankFields["bankCollectionMode"],
  };
}

async function bankRequest(municipalityId: string, action: "bank_get" | "bank_save", fields?: BankFields) {
  const session = (await backendClient?.auth?.getSession?.())?.data?.session;
  const token = session?.access_token || session?.accessToken || session?.token || "";
  if (!token) throw new Error("É necessário entrar novamente com uma conta da Prefeitura.");
  const response = await fetch("/api/collection-configuration", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ municipalityId, action, ...(fields ? { fields } : {}) }),
  });
  const data = await response.json().catch(() => ({})) as Partial<BankFields> & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível acessar os dados bancários municipais.");
  return normalizeBankFields(data);
}

export function MunicipalBankDetailsSettings({
  municipalityId, readOnly = false,
}: { municipalityId: string; readOnly?: boolean }) {
  const { refreshRemoteStore, getInstitutionSettings } = usePlatformData();
  const [form, setForm] = useState<BankFields>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    setSaved(false);
    setLoadFailed(false);
    setForm(defaults);
    if (!municipalityId) {
      setLoading(false);
      return;
    }
    void bankRequest(municipalityId, "bank_get")
      .then((bank) => { if (!cancelled) { setForm(bank); setSaved(true); } })
      .catch((error) => {
        if (cancelled) return;
        // Older municipal bank entries remain in general_settings. Show a
        // READ-ONLY view of the locally loaded tenant snapshot when the new
        // scoped bank RPC has not been installed on this environment yet.
        // Never overwrite the user's real bank data with blank defaults.
        const existing = getInstitutionSettings(municipalityId);
        if (existing && existing.tenantId === municipalityId) {
          setForm(normalizeBankFields({
            beneficiarioArrecadacao: existing.beneficiarioArrecadacao,
            chavePix: existing.chavePix,
            pixEnabled: existing.pixEnabled,
            pixKeyType: existing.pixKeyType,
            pixMerchantCity: existing.pixMerchantCity,
            bankCode: existing.bankCode,
            bankName: existing.bankName,
            bankAgency: existing.bankAgency,
            bankAgencyDigit: existing.bankAgencyDigit,
            bankAccount: existing.bankAccount,
            bankAccountDigit: existing.bankAccountDigit,
            bankBeneficiaryDocument: existing.bankBeneficiaryDocument,
            bankCollectionMode: existing.bankCollectionMode,
            bankAgreementCode: existing.bankAgreementCode,
            bankWallet: existing.bankWallet,
            bankInstructions: existing.bankInstructions,
          }));
        }
        setLoadFailed(true);
        setMessage(municipalCollectionError(error) + " Se existirem dados antigos, estão exibidos somente para conferência, sem possibilidade de salvar.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [municipalityId, retryCount]);

  const setField = <K extends keyof BankFields>(key: K, value: BankFields[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setMessage("");
  };

  const save = async () => {
    if (readOnly || loading || saving || loadFailed) return;
    setMessage("");
    let pixKeyToSave = form.chavePix;
    if (form.pixEnabled) {
      if (!form.beneficiarioArrecadacao.trim() || !form.pixMerchantCity.trim()) {
        setMessage("Informe o beneficiário oficial e a cidade para habilitar o PIX.");
        return;
      }
      const validation = validateMunicipalPixKey(form.chavePix, form.pixKeyType);
      if (!validation.valid) {
        setMessage(validation.message);
        return;
      }
      pixKeyToSave = validation.normalized;
    }
    if (form.bankCode.trim() && !/^\d{3}$/.test(form.bankCode.trim())) {
      setMessage("O código COMPE precisa conter exatamente 3 dígitos.");
      return;
    }
    if (form.bankCollectionMode !== "manual" && (!form.bankName.trim() || !form.bankCode.trim())) {
      setMessage("Para convênio ou API bancária, informe banco e código COMPE.");
      return;
    }
    if (form.bankCollectionMode === "agreement" && !form.bankAgreementCode.trim()) {
      setMessage("Informe o número oficial do convênio bancário.");
      return;
    }
    setSaving(true);
    try {
      const result = await bankRequest(municipalityId, "bank_save", { ...form, chavePix: pixKeyToSave });
      setForm(result);
      setSaved(true);
      setMessage("Dados bancários e PIX salvos exclusivamente para esta Prefeitura. Nenhuma guia anterior foi alterada.");
      // Atualiza o cache dos parâmetros para futuras DAMs, não regenera documentos históricos.
      try { await refreshRemoteStore(); } catch { /* O banco confirmou o salvamento; atualizar a tela depois. */ }
    } catch (error) {
      setSaved(false);
      setMessage(municipalCollectionError(error));
    } finally {
      setSaving(false);
    }
  };
  const disabled = readOnly || loading || saving || loadFailed;
  const id = municipalityId;
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" data-municipal-bank-settings="true">
      <div data-bank-premium-header="true" className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-950 via-sky-950 to-sky-800 p-5 !text-white">
        <div className="flex items-start gap-3">
          <Landmark className="mt-1 h-6 w-6 shrink-0 !text-sky-200" />
          <div>
            <h3 data-bank-premium-title="true" className="text-lg font-extrabold !text-white">Banco, convênio e PIX da Prefeitura</h3>
            <p data-bank-premium-description="true" className="mt-1 text-sm leading-6 !text-sky-100">Dados oficiais exibidos nas novas guias personalizadas do SIGAPRO. Cada prefeitura mantém os seus próprios dados.</p>
          </div>
        </div>
        <span data-bank-premium-badge="true" className="inline-flex items-center gap-2 rounded-full border border-sky-300/40 bg-sky-950/70 px-3 py-2 text-xs font-semibold !text-white">
          {loading ? "Carregando..." : loadFailed ? <><LockKeyhole className="h-4 w-4" /> Acesso não confirmado</> : saved ? <><CheckCircle2 className="h-4 w-4" /> Dados carregados</> : <><LockKeyhole className="h-4 w-4" /> Alterações não salvas</>}
        </span>
      </div>

      <div data-bank-premium-body="true" className="space-y-5 bg-white p-5 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={id + "-beneficiario"}>Beneficiário oficial da arrecadação</Label>
            <Input id={id + "-beneficiario"} value={form.beneficiarioArrecadacao} disabled={disabled} onChange={(e) => setField("beneficiarioArrecadacao", e.target.value)} placeholder="Razão social da Prefeitura / Tesouraria" maxLength={180}/>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-documento"}>CNPJ/CPF do beneficiário</Label>
            <Input id={id + "-documento"} value={form.bankBeneficiaryDocument} disabled={disabled} onChange={(e) => setField("bankBeneficiaryDocument", e.target.value)} placeholder="Documento da conta arrecadadora"/>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div>
              <p className="text-sm font-bold text-sky-950">PIX municipal</p>
              <p className="mt-1 text-xs text-slate-700">Usar chave oficial nas novas DAMs</p>
            </div>
            <Switch checked={form.pixEnabled} disabled={disabled} onCheckedChange={(v) => setField("pixEnabled", v)}/>
          </div>
          {form.pixEnabled ? <>
            <div className="space-y-2">
              <Label>Tipo da chave PIX</Label>
              <Select disabled={disabled} value={form.pixKeyType} onValueChange={(v) => setField("pixKeyType", v as BankFields["pixKeyType"])}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cnpj">CNPJ</SelectItem><SelectItem value="cpf">CPF</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="phone">Telefone</SelectItem><SelectItem value="random">Aleatória</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + "-pix"}>Chave PIX oficial</Label>
              <Input id={id + "-pix"} value={form.chavePix} disabled={disabled} onChange={(e) => setField("chavePix", e.target.value)} placeholder="Chave PIX cadastrada pelo banco" maxLength={130}/>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={id + "-cidade"}>Cidade do recebedor para o QR Code</Label>
              <Input id={id + "-cidade"} value={form.pixMerchantCity} disabled={disabled} onChange={(e) => setField("pixMerchantCity", e.target.value)} placeholder="Cidade da Prefeitura" maxLength={110}/>
            </div>
          </> : null}
        </div>

        <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
          <div className="mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-sky-700 dark:text-sky-300"/><h4 className="font-bold text-slate-950 dark:text-white">Conta e convênio bancário</h4></div>
          <div className="mb-4 grid gap-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Instituição bancária — seleção rápida (opcional)</Label>
              <Select
                disabled={disabled}
                value={findMunicipalBank(form.bankCode)?.code ?? "other"}
                onValueChange={(code) => {
                  const nextBank = selectMunicipalBank(form, code);
                  setForm((current) => ({ ...current, ...nextBank }));
                  setSaved(false);
                  setMessage("");
                }}
              >
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Outro banco / informar manualmente</SelectItem>
                  {MUNICIPAL_BANK_DIRECTORY.map((bank) => (
                    <SelectItem key={bank.code} value={bank.code}>{bank.code} — {bank.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              O cadastro aceita qualquer instituição autorizada, mesmo fora da lista. Selecione ou preencha o código e o nome do banco contratado.
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2"><Label>Código COMPE</Label><Input disabled={disabled} inputMode="numeric" maxLength={3} value={form.bankCode} onChange={(e) => setField("bankCode", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="001"/></div>
            <div className="space-y-2 md:col-span-3"><Label>Nome do banco</Label><Input disabled={disabled} value={form.bankName} onChange={(e) => setField("bankName", e.target.value)} placeholder="Banco arrecadador"/></div>
            <div className="space-y-2"><Label>Agência</Label><Input disabled={disabled} value={form.bankAgency} onChange={(e) => setField("bankAgency", e.target.value)}/></div>
            <div className="space-y-2"><Label>Dígito agência</Label><Input disabled={disabled} value={form.bankAgencyDigit} onChange={(e) => setField("bankAgencyDigit", e.target.value)}/></div>
            <div className="space-y-2"><Label>Conta</Label><Input disabled={disabled} value={form.bankAccount} onChange={(e) => setField("bankAccount", e.target.value)}/></div>
            <div className="space-y-2"><Label>Dígito conta</Label><Input disabled={disabled} value={form.bankAccountDigit} onChange={(e) => setField("bankAccountDigit", e.target.value)}/></div>
            <div className="space-y-2">
              <Label>Modo de arrecadação bancária</Label>
              <Select value={form.bankCollectionMode} disabled={disabled} onValueChange={(v) => setField("bankCollectionMode", v as BankFields["bankCollectionMode"])}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="manual">PIX / baixa municipal</SelectItem><SelectItem value="agreement">Convênio bancário</SelectItem><SelectItem value="api">API bancária</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Número do convênio</Label><Input disabled={disabled} value={form.bankAgreementCode} onChange={(e) => setField("bankAgreementCode", e.target.value)} placeholder="Fornecido pelo banco"/></div>
            <div className="space-y-2 md:col-span-2"><Label>Carteira / modalidade</Label><Input disabled={disabled} value={form.bankWallet} onChange={(e) => setField("bankWallet", e.target.value)}/></div>
            <div className="space-y-2 md:col-span-4"><Label>Instruções bancárias para a guia</Label><Textarea disabled={disabled} rows={3} maxLength={1500} value={form.bankInstructions} onChange={(e) => setField("bankInstructions", e.target.value)} placeholder="Ex.: pagável até o vencimento nos canais oficiais indicados pela Prefeitura."/></div>
          </div>
        </div>
        <div role="status" data-bank-integration-readiness="true" className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
          <strong>Modalidade bancária selecionada:</strong> {describeMunicipalBankChannel(form.bankCollectionMode).explanation}
          <p className="mt-2 text-xs text-slate-700">O banco cadastrado pode ser diferente em cada Prefeitura. O cadastro não significa autorização para emitir boletos registrados ou executar baixas automáticas.</p>
        </div>
        {form.pixEnabled && (
          <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <strong>Atenção à titularidade do PIX:</strong> uma chave cadastrada e salva não confirma que os valores serão recebidos pela Prefeitura.
            {!form.bankBeneficiaryDocument.trim()
              ? " O CNPJ da conta arrecadadora ainda não foi informado. Não utilize esta chave para cobrança municipal real."
              : " Confirme a titularidade da chave e a autorização bancária com a Tesouraria antes da produção."}
          </div>
        )}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
          <strong>Integridade bancária:</strong> banco, agência, conta e convênio não criam automaticamente um boleto registrado. Linha digitável, código de barras e QR Code de cobrança só podem usar dados oficiais fornecidos pelo banco ou provedor.
        </div>
        {message ? <p role="status" className={`rounded-xl border p-3 text-sm font-medium ${saved ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{message}</p> : null}
        {loadFailed ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
          <p className="text-sm font-semibold text-sky-950">Salvamento protegido: dados bancários não serão substituídos enquanto o banco ou a sessão não responderem.</p>
          <Button type="button" variant="outline" className="border-sky-300 bg-white !text-sky-950" onClick={() => setRetryCount((count) => count + 1)}>Tentar conectar novamente</Button>
        </div> : null}
        <div className="flex items-center justify-end gap-3">
          {readOnly ? <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><ShieldCheck className="h-4 w-4"/> Somente leitura</span> :
            <Button type="button" disabled={disabled} onClick={() => void save()} className="h-11 rounded-xl !bg-slate-950 px-6 font-bold !text-white hover:!bg-sky-900">
              <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar banco e PIX"}
            </Button>
          }
        </div>
      </div>
    </section>
  );
}
