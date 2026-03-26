import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, Building2, IdCard, UserPlus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformData } from "@/hooks/usePlatformData";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { registerRemoteExternalAccount, saveRemoteProfile } from "@/integrations/supabase/platform";
import { getInstitutionClientSlug, roleLabels, type UserRole } from "@/lib/platform";

const accountRoles: UserRole[] = ["profissional_externo"];
const SIGNUP_DRAFTS_KEY = "sigapro-signup-drafts";

function isValidPassword(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
}

export function CriarContaPage() {
  const navigate = useNavigate();
  const { institutions, createTenantUser, saveUserProfile } = usePlatformData();
  const [searchParams] = useSearchParams();
  const availableInstitutions = useMemo(() => institutions.filter((institution) => institution.status !== "suspenso"), [institutions]);
  const tenantSlug = searchParams.get("tenant");
  const tenantFromLink = availableInstitutions.find((institution) => getInstitutionClientSlug(institution) === tenantSlug)?.id ?? "";
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    tenantId: tenantFromLink || availableInstitutions[0]?.id || "",
    role: "profissional_externo" as UserRole,
    fullName: "",
    email: "",
    phone: "",
    cpfCnpj: "",
    rg: "",
    birthDate: "",
    professionalType: "",
    registrationNumber: "",
    companyName: "",
    title: "",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    bio: "",
    password: "",
    confirmPassword: "",
  });

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!form.tenantId || !form.fullName || !form.email) {
      setError("Preencha prefeitura, nome e e-mail.");
      return;
    }

    if (form.password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (!isValidPassword(form.password)) {
      setError("A senha deve conter no minimo 8 caracteres, com letra maiuscula, letra minuscula, numero e caractere especial.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("A Confirmação da Senha Não Confere.");
      return;
    }

    setSubmitting(true);
    const normalizedEmail = form.email.trim().toLowerCase();
    const draftProfile = {
      fullName: form.fullName,
      email: normalizedEmail,
      phone: form.phone,
      cpfCnpj: form.cpfCnpj,
      rg: form.rg,
      birthDate: form.birthDate,
      professionalType: form.professionalType,
      registrationNumber: form.registrationNumber,
      companyName: form.companyName,
      addressLine: form.addressLine,
      addressNumber: form.addressNumber,
      addressComplement: form.addressComplement,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      zipCode: form.zipCode,
      avatarUrl: "",
      avatarScale: 1,
      avatarOffsetX: 0,
      avatarOffsetY: 0,
      useAvatarInHeader: false,
      bio: form.bio,
    };
    const existingDraftsRaw = typeof window !== "undefined" ? window.localStorage.getItem(SIGNUP_DRAFTS_KEY) : null;
    const existingDrafts = existingDraftsRaw ? (JSON.parse(existingDraftsRaw) as Record<string, typeof draftProfile>) : {};
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIGNUP_DRAFTS_KEY, JSON.stringify({ ...existingDrafts, [normalizedEmail]: draftProfile }));
    }

    if (hasSupabaseEnv && supabase) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: form.password,
        options: {
          data: {
            role: form.role,
            tenant_id: form.tenantId,
            full_name: form.fullName,
            phone: form.phone,
            cpf_cnpj: form.cpfCnpj,
            rg: form.rg,
            birth_date: form.birthDate,
            professional_type: form.professionalType,
            registration_number: form.registrationNumber,
            company_name: form.companyName,
            address_line: form.addressLine,
            address_number: form.addressNumber,
            address_complement: form.addressComplement,
            neighborhood: form.neighborhood,
            city: form.city,
            state: form.state,
            zip_code: form.zipCode,
            bio: form.bio,
          },
        },
      });

      if (signUpError) {
        setSubmitting(false);
        setError(signUpError.message);
        return;
      }

      if (!data.user) {
        setSubmitting(false);
        setError("Não Foi Possível Concluir o Cadastro no Supabase.");
        return;
      }

      if (data.session) {
        try {
          await registerRemoteExternalAccount({
            tenantId: form.tenantId,
            fullName: form.fullName,
            email: normalizedEmail,
            cpfCnpj: form.cpfCnpj,
            phone: form.phone,
            professionalType: form.professionalType,
            registrationNumber: form.registrationNumber,
            companyName: form.companyName,
            title: form.title || form.professionalType || roleLabels[form.role],
            bio: form.bio,
          });
          await saveRemoteProfile({
            userId: data.user.id,
            ...draftProfile,
          });
          setStatus("Conta Criada com Sucesso. Você Já Pode Entrar no Portal da Prefeitura.");
          setTimeout(() => navigate(`/acesso?tenant=${tenantSlug || ""}`), 1200);
        } catch (registrationError) {
          setError(registrationError instanceof Error ? registrationError.message : "Falha ao Vincular o Profissional à Prefeitura.");
        } finally {
          setSubmitting(false);
        }
        return;
      }

      setSubmitting(false);
      setStatus("Conta Criada. Verifique Seu E-mail Para Confirmar o Acesso e Concluir o Primeiro Login.");
      return;
    }

    const user = createTenantUser({
      tenantId: form.tenantId,
      fullName: form.fullName,
      email: normalizedEmail,
      role: form.role,
      title: form.title || form.professionalType || roleLabels[form.role],
      accessLevel: 1,
    });
    saveUserProfile({
      userId: user.id,
      fullName: form.fullName,
      email: normalizedEmail,
      phone: form.phone,
      cpfCnpj: form.cpfCnpj,
      rg: form.rg,
      birthDate: form.birthDate,
      professionalType: form.professionalType,
      registrationNumber: form.registrationNumber,
      companyName: form.companyName,
      addressLine: form.addressLine,
      addressNumber: form.addressNumber,
      addressComplement: form.addressComplement,
      neighborhood: form.neighborhood,
      city: form.city,
      state: form.state,
      zipCode: form.zipCode,
      avatarUrl: "",
      avatarScale: 1,
      avatarOffsetX: 0,
      avatarOffsetY: 0,
      useAvatarInHeader: false,
      bio: form.bio,
    });
    setStatus("Conta de Profissional Externo Criada com Sucesso. Senha Inicial: Acesso@2026");
    setSubmitting(false);

    setForm((current) => ({
      ...current,
      fullName: "",
      email: "",
      phone: "",
      cpfCnpj: "",
      rg: "",
      birthDate: "",
      professionalType: "",
      registrationNumber: "",
      companyName: "",
      title: "",
      addressLine: "",
      addressNumber: "",
      addressComplement: "",
      neighborhood: "",
      city: "",
      state: "",
      zipCode: "",
      bio: "",
      password: "",
      confirmPassword: "",
    }));
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#09111a_0%,#0f2338_42%,#eef4f8_42%,#f8fafc_100%)] px-4 py-8">
      <div className="mx-auto max-w-[1080px]">
        <Card className="rounded-[32px] border-slate-200">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <UserPlus className="h-6 w-6" />
              </div>
              <Button asChild type="button" variant="outline" className="rounded-full">
                <Link to="/acesso">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao Login
                </Link>
              </Button>
            </div>
            <CardTitle className="max-w-sm text-xl font-semibold leading-tight text-slate-900">Criar conta</CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">Cadastre o profissional externo com dados pessoais e vínculo à prefeitura selecionada.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prefeitura cadastrada no SIGAPRO</Label>
                  <Select value={form.tenantId} onValueChange={(value) => setField("tenantId", value)}>
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue placeholder="Escolha a prefeitura" />
                    </SelectTrigger>
                    <SelectContent>
                    {availableInstitutions.map((institution) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de acesso</Label>
                  <Select value={form.role} onValueChange={(value) => setField("role", value)}>
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome Completo</Label>
                  <Input value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={form.email} onChange={(event) => setField("email", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input type="password" value={form.password} onChange={(event) => setField("password", event.target.value)} />
                  <p className="max-w-md text-xs leading-5 text-slate-500">
                    A senha deve conter no minimo 8 caracteres, com letra maiuscula, letra minuscula, numero e caractere especial.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Confirmar Senha</Label>
                  <Input type="password" value={form.confirmPassword} onChange={(event) => setField("confirmPassword", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CPF ou CNPJ</Label>
                  <Input value={form.cpfCnpj} onChange={(event) => setField("cpfCnpj", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>RG</Label>
                  <Input value={form.rg} onChange={(event) => setField("rg", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={form.birthDate} onChange={(event) => setField("birthDate", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo Profissional</Label>
                  <Input value={form.professionalType} onChange={(event) => setField("professionalType", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Registro Profissional</Label>
                  <Input value={form.registrationNumber} onChange={(event) => setField("registrationNumber", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Empresa, Órgão ou Setor</Label>
                  <Input value={form.companyName} onChange={(event) => setField("companyName", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cargo ou Função</Label>
                  <Input value={form.title} onChange={(event) => setField("title", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.35fr,0.65fr]">
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input value={form.addressLine} onChange={(event) => setField("addressLine", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Numero</Label>
                  <Input value={form.addressNumber} onChange={(event) => setField("addressNumber", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Complemento</Label>
                  <Input value={form.addressComplement} onChange={(event) => setField("addressComplement", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input value={form.neighborhood} onChange={(event) => setField("neighborhood", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,0.4fr,0.7fr]">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={(event) => setField("city", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input value={form.state} onChange={(event) => setField("state", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input value={form.zipCode} onChange={(event) => setField("zipCode", event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Resumo Profissional</Label>
                <Textarea rows={4} value={form.bio} onChange={(event) => setField("bio", event.target.value)} />
              </div>

              {error ? <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
              {status ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{status}</div> : null}

              <Button type="submit" className="h-12 w-full rounded-2xl bg-slate-950 text-white hover:bg-slate-900" disabled={submitting}>
                {submitting ? "Criando Conta..." : "Finalizar Cadastro"}
              </Button>
            </form>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Building2 className="h-4 w-4" />
                  Fluxo por Prefeitura
                </div>
                O Usuário Escolhe Primeiro a Prefeitura Cadastrada no SIGAPRO e Depois Informa os Dados Pessoais e Profissionais.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                  <IdCard className="h-4 w-4" />
                  Validação Interna
                </div>
                O Auto Cadastro é Exclusivo do Profissional Externo. Analistas, Fiscais e Demais Usuários Internos São Criados Somente Pelo Administrador da Prefeitura.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
