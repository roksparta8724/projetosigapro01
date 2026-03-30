import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, IdCard, UserPlus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useTenant } from "@/hooks/useTenant";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import {
  registerRemoteExternalAccount,
  registerRemoteOwnerAccount,
  saveRemoteProfile,
} from "@/integrations/supabase/platform";
import { formatCep, lookupCepAddress } from "@/lib/cep";
import {
  getInstitutionClientSlug,
  isInstitutionPubliclyAvailable,
  roleLabels,
  type UserRole,
} from "@/lib/platform";

const SIGNUP_DRAFTS_KEY = "sigapro-signup-drafts";

function normalizeInstitutionFingerprint(name: string, city?: string | null) {
  const base = `${name} ${city ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bprefeitura municipal de\b/g, "")
    .replace(/\bprefeitura de\b/g, "")
    .replace(/\bprefeitura\b/g, "")
    .replace(/\bmunicipal\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return base;
}

function isValidPassword(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
}

export function CriarContaPage() {
  const navigate = useNavigate();
  const { institutions, createTenantUser, saveUserProfile } = usePlatformData();
  const tenant = useTenant();
  const [searchParams] = useSearchParams();

  const tenantSlug = searchParams.get("tenant");

  const availableInstitutions = useMemo(() => {
    if (tenant.mode === "tenant" && tenant.municipalityId) {
      return [
        {
          id: tenant.municipalityId,
          name: tenant.municipalityName || "Prefeitura",
          city: "",
          state: "",
          users: 0,
          processes: 0,
          subdomain: tenant.subdomain || "",
          status: "ativo",
          plan: "Institucional",
          theme: { primary: "#0F2A44", accent: "#5ee8d9" },
          revenue: 0,
          activeModules: [],
        },
      ];
    }

    const uniqueInstitutions = new Map<string, (typeof institutions)[number]>();

    institutions
      .filter((institution) => isInstitutionPubliclyAvailable(institution))
      .forEach((institution) => {
        const fingerprint = normalizeInstitutionFingerprint(institution.name, institution.city);
        const current = uniqueInstitutions.get(fingerprint);

        if (!current) {
          uniqueInstitutions.set(fingerprint, institution);
          return;
        }

        const currentUsers = current.users ?? 0;
        const nextUsers = institution.users ?? 0;
        const currentProcesses = current.processes ?? 0;
        const nextProcesses = institution.processes ?? 0;

        if (nextUsers > currentUsers || nextProcesses > currentProcesses) {
          uniqueInstitutions.set(fingerprint, institution);
        }
      });

    const sorted = Array.from(uniqueInstitutions.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR"),
    );

    if (!tenantSlug) {
      return sorted;
    }

    return sorted.filter((institution) => getInstitutionClientSlug(institution) === tenantSlug);
  }, [institutions, tenantSlug, tenant.mode, tenant.municipalityId, tenant.municipalityName, tenant.subdomain]);

  const tenantFromLink =
    availableInstitutions.find((institution) => getInstitutionClientSlug(institution) === tenantSlug)?.id ?? "";

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cepStatus, setCepStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const lastCepLookupRef = useRef("");

  const [form, setForm] = useState({
    tenantId: tenant.municipalityId || tenantFromLink || availableInstitutions[0]?.id || "",
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

  const isOwnerSignup = form.role === "property_owner";
  const tenantSelectionLocked =
    Boolean(tenant.municipalityId) || Boolean(tenantFromLink) || tenant.mode === "tenant";
  const lockedInstitution =
    availableInstitutions.find((item) => item.id === form.tenantId) ?? availableInstitutions[0];

  useEffect(() => {
    setForm((current) => {
      if (tenant.mode === "tenant" && tenant.municipalityId) {
        if (current.tenantId === tenant.municipalityId) {
          return current;
        }
        return { ...current, tenantId: tenant.municipalityId };
      }

      const nextTenantId = availableInstitutions.some((institution) => institution.id === current.tenantId)
        ? current.tenantId
        : tenantFromLink || availableInstitutions[0]?.id || "";

      if (nextTenantId === current.tenantId) {
        return current;
      }

      return { ...current, tenantId: nextTenantId };
    });
  }, [availableInstitutions, tenant.mode, tenant.municipalityId, tenantFromLink]);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    const cep = form.zipCode.replace(/\D/g, "");
    if (cep.length !== 8 || cep === lastCepLookupRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const address = await lookupCepAddress(cep);
          lastCepLookupRef.current = cep;

          if (!address) {
            setCepStatus("CEP não encontrado. Confira o número informado.");
            return;
          }

          setForm((current) => ({
            ...current,
            zipCode: formatCep(cep),
            addressLine: current.addressLine || address.street,
            neighborhood: current.neighborhood || address.neighborhood,
            city: current.city || address.city,
            state: current.state || address.state,
            addressComplement: current.addressComplement || address.complement,
          }));
          setCepStatus("Endereço preenchido automaticamente pelo CEP.");
        } catch (lookupError) {
          setCepStatus(
            lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CEP agora.",
          );
        }
      })();
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [form.zipCode]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");

    if (!form.tenantId) {
      setError("Prefeitura não identificada no link de acesso.");
      return;
    }

    const commonRequired: Array<[string, string]> = [
      [form.fullName, "Nome completo"],
      [form.email, "E-mail"],
      [form.phone, "Telefone"],
      [form.cpfCnpj, "CPF ou CNPJ"],
      [form.rg, "RG"],
      [form.birthDate, "Data de nascimento"],
      [form.addressLine, "Endereço"],
      [form.addressNumber, "Número"],
      [form.neighborhood, "Bairro"],
      [form.city, "Cidade"],
      [form.state, "UF"],
      [form.zipCode, "CEP"],
    ];

    const professionalRequired: Array<[string, string]> = isOwnerSignup
      ? []
      : [
          [form.professionalType, "Tipo profissional"],
          [form.registrationNumber, "Registro profissional"],
        ];

    const missingField = [...commonRequired, ...professionalRequired].find(([value]) => !value.trim());
    if (missingField) {
      setError(`Preencha o campo obrigatório: ${missingField[1]}.`);
      return;
    }

    if (form.password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (!isValidPassword(form.password)) {
      setError(
        "A senha deve conter no mínimo 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.",
      );
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("A confirmação da senha não confere.");
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

    const existingDraftsRaw =
      typeof window !== "undefined" ? window.localStorage.getItem(SIGNUP_DRAFTS_KEY) : null;
    const existingDrafts = existingDraftsRaw
      ? (JSON.parse(existingDraftsRaw) as Record<string, typeof draftProfile>)
      : {};

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SIGNUP_DRAFTS_KEY,
        JSON.stringify({ ...existingDrafts, [normalizedEmail]: draftProfile }),
      );
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
        setError("Não foi possível concluir o cadastro no Supabase.");
        return;
      }

      if (data.session) {
        try {
          if (form.role === "property_owner") {
            await registerRemoteOwnerAccount({
              tenantId: form.tenantId,
              fullName: form.fullName,
              email: normalizedEmail,
              cpfCnpj: form.cpfCnpj,
              phone: form.phone,
              title: form.title || roleLabels[form.role],
              bio: form.bio,
            });
          } else {
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
          }

          await saveRemoteProfile({
            userId: data.user.id,
            ...draftProfile,
          });

          setStatus(
            form.role === "property_owner"
              ? "Conta criada com sucesso. Você já pode solicitar acompanhamento do seu projeto."
              : "Conta criada com sucesso. Você já pode entrar no portal da Prefeitura.",
          );

          const accessRedirect =
            tenant.mode === "tenant" ? "/acesso" : `/acesso?tenant=${tenantSlug || ""}`;

          setTimeout(() => navigate(accessRedirect), 1200);
        } catch (registrationError) {
          setError(
            registrationError instanceof Error
              ? registrationError.message
              : "Falha ao vincular o profissional à Prefeitura.",
          );
        } finally {
          setSubmitting(false);
        }

        return;
      }

      setSubmitting(false);
      setStatus("Conta criada. Verifique seu e-mail para confirmar o acesso e concluir o primeiro login.");
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

    setStatus(
      form.role === "property_owner"
        ? "Conta de proprietário criada com sucesso. Senha inicial: Acesso@2026"
        : "Conta de profissional externo criada com sucesso. Senha inicial: Acesso@2026",
    );

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
    setCepStatus("");
    lastCepLookupRef.current = "";
  };

  return (
    <div className="min-h-screen bg-[#07111b] px-4 py-8 text-slate-100">
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(4,10,18,0.95)_0%,rgba(6,18,31,0.91)_34%,rgba(245,248,252,0.98)_34%,rgba(255,255,255,1)_100%)] px-5 py-5 shadow-[0_30px_84px_rgba(2,6,23,0.24)] md:px-7 md:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.10),transparent_22%),linear-gradient(180deg,rgba(2,6,12,0.08),rgba(2,6,12,0.14))]" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.34fr)] lg:gap-12">
          <div className="hidden flex-col justify-between rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(8,27,46,0.82)_0%,rgba(6,20,36,0.74)_100%)] p-8 backdrop-blur-sm lg:flex">
            <div className="space-y-7">
              <div className="inline-flex h-10 w-fit items-center rounded-full border border-white/18 bg-white/[0.06] px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                Cadastro profissional
              </div>

              <div className="space-y-4">
                <h1 className="max-w-[11ch] text-[clamp(34px,3.1vw,48px)] font-semibold leading-[0.95] tracking-[-0.06em] text-white">
                  Crie seu acesso profissional no SIGAPRO.
                </h1>

                <p className="max-w-[50ch] text-[15px] leading-7 text-slate-100">
                  Autoatendimento exclusivo para profissionais externos. Usuários internos da Prefeitura são criados pelo administrador municipal.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(15,33,53,0.94)_0%,rgba(13,30,48,0.88)_100%)] p-5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(4,12,20,0.18)]">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <Building2 className="h-4 w-4" />
                  Vinculação automática à Prefeitura
                </div>
                <p className="leading-6 text-slate-100">
                  O cadastro já fica vinculado à Prefeitura do link acessado, sem necessidade de seleção manual.
                </p>
              </div>

              <div className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(15,33,53,0.94)_0%,rgba(13,30,48,0.88)_100%)] p-5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(4,12,20,0.18)]">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                  <IdCard className="h-4 w-4" />
                  Campos documentais obrigatórios
                </div>
                <p className="leading-6 text-slate-100">
                  Dados pessoais, endereço e registro profissional devem ser preenchidos para finalizar o cadastro.
                </p>
              </div>
            </div>
          </div>

          <Card className="rounded-[32px] border-slate-200/90 bg-white shadow-[0_40px_100px_rgba(15,23,42,0.16)]">
            <CardHeader className="space-y-4 px-8 pb-0 pt-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <UserPlus className="h-6 w-6" />
                </div>

                <Button asChild type="button" variant="outline" className="rounded-full">
                  <Link to="/acesso">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Link>
                </Button>
              </div>

              <CardTitle className="max-w-sm text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] text-slate-900">
                {isOwnerSignup ? "Criar conta de proprietário" : "Criar conta profissional"}
              </CardTitle>

              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                {isOwnerSignup
                  ? "Acompanhe o processo do seu imóvel após aprovação do profissional responsável."
                  : "Autoatendimento exclusivo para profissionais externos. Usuários internos da Prefeitura são criados pelo administrador municipal."}
              </p>
            </CardHeader>

            <CardContent className="px-8 pb-8 pt-6">
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Prefeitura vinculada</Label>
                    <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
                      {lockedInstitution?.name || tenant.municipalityName || "Prefeitura vinculada pelo link"}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                      Este cadastro será criado automaticamente dentro da Prefeitura vinculada ao link acessado.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de acesso</Label>
                    <Select value={form.role} onValueChange={(value) => setField("role", value)}>
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="Selecione o perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="profissional_externo">Profissional externo</SelectItem>
                        <SelectItem value="property_owner">Proprietário do imóvel</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-slate-500">
                      O proprietário acompanha o processo, mas não atua tecnicamente nem fala direto com a Prefeitura.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome completo *</Label>
                    <Input
                      required
                      value={form.fullName}
                      onChange={(event) => setField("fullName", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input
                      required
                      value={form.email}
                      onChange={(event) => setField("email", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Senha *</Label>
                    <Input
                      required
                      type="password"
                      value={form.password}
                      onChange={(event) => setField("password", event.target.value)}
                    />
                    <p className="max-w-md text-xs leading-5 text-slate-500">
                      Use no mínimo 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Confirmar senha *</Label>
                    <Input
                      required
                      type="password"
                      value={form.confirmPassword}
                      onChange={(event) => setField("confirmPassword", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Telefone *</Label>
                    <Input
                      required
                      value={form.phone}
                      onChange={(event) => setField("phone", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF ou CNPJ *</Label>
                    <Input
                      required
                      value={form.cpfCnpj}
                      onChange={(event) => setField("cpfCnpj", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>RG *</Label>
                    <Input
                      required
                      value={form.rg}
                      onChange={(event) => setField("rg", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de nascimento *</Label>
                    <Input
                      required
                      type="date"
                      value={form.birthDate}
                      onChange={(event) => setField("birthDate", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo profissional {!isOwnerSignup ? "*" : ""}</Label>
                    <Input
                      required={!isOwnerSignup}
                      value={form.professionalType}
                      onChange={(event) => setField("professionalType", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Registro profissional {!isOwnerSignup ? "*" : ""}</Label>
                    <Input
                      required={!isOwnerSignup}
                      value={form.registrationNumber}
                      onChange={(event) => setField("registrationNumber", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Empresa, órgão ou escritório</Label>
                    <Input
                      value={form.companyName}
                      onChange={(event) => setField("companyName", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cargo ou função</Label>
                    <Input
                      value={form.title}
                      onChange={(event) => setField("title", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.35fr,0.65fr]">
                  <div className="space-y-2">
                    <Label>Endereço *</Label>
                    <Input
                      required
                      value={form.addressLine}
                      onChange={(event) => setField("addressLine", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Número *</Label>
                    <Input
                      required
                      value={form.addressNumber}
                      onChange={(event) => setField("addressNumber", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Complemento</Label>
                    <Input
                      value={form.addressComplement}
                      onChange={(event) => setField("addressComplement", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro *</Label>
                    <Input
                      required
                      value={form.neighborhood}
                      onChange={(event) => setField("neighborhood", event.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,0.4fr,0.7fr]">
                  <div className="space-y-2">
                    <Label>Cidade *</Label>
                    <Input
                      required
                      value={form.city}
                      onChange={(event) => setField("city", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UF *</Label>
                    <Input
                      required
                      value={form.state}
                      onChange={(event) => setField("state", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP *</Label>
                    <Input
                      required
                      value={form.zipCode}
                      onChange={(event) => {
                        lastCepLookupRef.current = "";
                        setCepStatus("");
                        setField("zipCode", formatCep(event.target.value));
                      }}
                    />
                  </div>
                </div>

                {cepStatus ? (
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-700">
                    {cepStatus}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label>Resumo profissional</Label>
                  <Textarea
                    rows={4}
                    value={form.bio}
                    onChange={(event) => setField("bio", event.target.value)}
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600">
                    {error}
                  </div>
                ) : null}

                {status ? (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                    {status}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="h-[56px] w-full rounded-[18px] bg-[linear-gradient(135deg,#0f172a_0%,#16365a_55%,#1a4269_100%)] text-white hover:brightness-[1.03]"
                  disabled={submitting}
                >
                  {submitting ? "Criando conta..." : "Finalizar cadastro"}
                </Button>
              </form>

              <div className="mt-6 grid gap-4 md:grid-cols-2 lg:hidden">
                <div className="rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.92)_100%)] p-4 text-sm text-slate-600">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Building2 className="h-4 w-4" />
                    Vinculação automática
                  </div>
                  O cadastro fica vinculado automaticamente à Prefeitura do link acessado.
                </div>

                <div className="rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(241,245,249,0.92)_100%)] p-4 text-sm text-slate-600">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <IdCard className="h-4 w-4" />
                    Campos obrigatórios
                  </div>
                  Dados pessoais, endereço e registro profissional devem ser preenchidos para concluir o cadastro.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}