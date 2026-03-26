import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Camera,
  IdCard,
  KeyRound,
  Mail,
  ShieldPlus,
  UserRound,
} from "lucide-react";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { ImageFrameEditor } from "@/components/platform/ImageFrameEditor";
import { PageHero } from "@/components/platform/PageHero";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { hasSupabaseEnv } from "@/integrations/supabase/client";
import { saveRemoteProfile, uploadFileToStorage } from "@/integrations/supabase/platform";

const SIGNUP_DRAFTS_KEY = "sigapro-signup-drafts";

type ProfileSection =
  | "visao-geral"
  | "dados-pessoais"
  | "foto-identidade"
  | "dados-profissionais"
  | "conta-seguranca"
  | "vinculos"
  | "historico";

export function PerfilPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId, name: municipalityName, tenantSettingsCompat } = useMunicipality();
  const { authenticatedEmail, updateEmail, updatePassword } = useAuthGateway();
  const { getUserProfile, saveUserProfile, institutions, getInstitutionSettings } = usePlatformData();
  const profile = getUserProfile(session.id);
  const activeInstitutionId = scopeId ?? session.tenantId;
  const tenant = institutions.find((item) => item.id === activeInstitutionId) ?? null;
  const tenantSettings = tenantSettingsCompat ?? getInstitutionSettings(activeInstitutionId);
  const [status, setStatus] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarFiles, setAvatarFiles] = useState<UploadedFileItem[]>([]);
  const [section, setSection] = useState<ProfileSection>("visao-geral");
  const lastAvatarSourceRef = useRef("");
  const hydratedDraftRef = useRef(false);
  const [form, setForm] = useState({
    fullName: session.name,
    email: session.email,
    phone: "",
    cpfCnpj: "",
    rg: "",
    birthDate: "",
    professionalType: "",
    registrationNumber: "",
    companyName: "",
    addressLine: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    avatarUrl: "",
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    useAvatarInHeader: false,
    bio: "",
  });
  const [accountForm, setAccountForm] = useState({
    currentEmail: authenticatedEmail ?? session.email,
    nextEmail: authenticatedEmail ?? session.email,
    nextPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      cpfCnpj: profile.cpfCnpj,
      rg: profile.rg,
      birthDate: profile.birthDate,
      professionalType: profile.professionalType,
      registrationNumber: profile.registrationNumber,
      companyName: profile.companyName,
      addressLine: profile.addressLine,
      addressNumber: profile.addressNumber,
      addressComplement: profile.addressComplement,
      neighborhood: profile.neighborhood,
      city: profile.city,
      state: profile.state,
      zipCode: profile.zipCode,
      avatarUrl: profile.avatarUrl,
      avatarScale: profile.avatarScale ?? 1,
      avatarOffsetX: profile.avatarOffsetX ?? 0,
      avatarOffsetY: profile.avatarOffsetY ?? 0,
      useAvatarInHeader: profile.useAvatarInHeader ?? false,
      bio: profile.bio,
    });
    if (profile.avatarUrl) {
      setAvatarFiles([
        {
          id: "avatar-atual",
          fileName: "foto-perfil",
          mimeType: "image/*",
          sizeLabel: "imagem salva",
          previewUrl: profile.avatarUrl,
        },
      ]);
    }
  }, [profile]);

  useEffect(() => {
    setAccountForm((current) => ({
      ...current,
      currentEmail: authenticatedEmail ?? session.email,
      nextEmail: authenticatedEmail ?? session.email,
    }));
  }, [authenticatedEmail, session.email]);

  useEffect(() => {
    const previewUrl = avatarFiles[0]?.previewUrl;
    if (!previewUrl || previewUrl === lastAvatarSourceRef.current) {
      return;
    }

    lastAvatarSourceRef.current = previewUrl;
    setForm((current) => ({
      ...current,
      avatarScale: 1.08,
      avatarOffsetX: 0,
      avatarOffsetY: 0,
    }));
  }, [avatarFiles]);

  useEffect(() => {
    if (hydratedDraftRef.current || typeof window === "undefined") {
      return;
    }

    const rawDrafts = window.localStorage.getItem(SIGNUP_DRAFTS_KEY);
    if (!rawDrafts) {
      hydratedDraftRef.current = true;
      return;
    }

    const allDrafts = JSON.parse(rawDrafts) as Record<string, Omit<typeof form, "avatarUrl"> & { avatarUrl?: string }>;
    const draft = allDrafts[session.email.trim().toLowerCase()];
    if (!draft) {
      hydratedDraftRef.current = true;
      return;
    }

    const mergedProfile = {
      userId: session.id,
      fullName: profile?.fullName || draft.fullName || session.name,
      email: profile?.email || draft.email || session.email,
      phone: profile?.phone || draft.phone || "",
      cpfCnpj: profile?.cpfCnpj || draft.cpfCnpj || "",
      rg: profile?.rg || draft.rg || "",
      birthDate: profile?.birthDate || draft.birthDate || "",
      professionalType: profile?.professionalType || draft.professionalType || "",
      registrationNumber: profile?.registrationNumber || draft.registrationNumber || "",
      companyName: profile?.companyName || draft.companyName || "",
      addressLine: profile?.addressLine || draft.addressLine || "",
      addressNumber: profile?.addressNumber || draft.addressNumber || "",
      addressComplement: profile?.addressComplement || draft.addressComplement || "",
      neighborhood: profile?.neighborhood || draft.neighborhood || "",
      city: profile?.city || draft.city || "",
      state: profile?.state || draft.state || "",
      zipCode: profile?.zipCode || draft.zipCode || "",
      avatarUrl: profile?.avatarUrl || draft.avatarUrl || "",
      avatarScale: profile?.avatarScale ?? draft.avatarScale ?? 1,
      avatarOffsetX: profile?.avatarOffsetX ?? draft.avatarOffsetX ?? 0,
      avatarOffsetY: profile?.avatarOffsetY ?? draft.avatarOffsetY ?? 0,
      useAvatarInHeader: profile?.useAvatarInHeader ?? draft.useAvatarInHeader ?? false,
      bio: profile?.bio || draft.bio || "",
    };

    setForm((current) => ({ ...current, ...mergedProfile }));
    saveUserProfile(mergedProfile);
    if (hasSupabaseEnv) {
      void saveRemoteProfile(mergedProfile);
    }

    delete allDrafts[session.email.trim().toLowerCase()];
    window.localStorage.setItem(SIGNUP_DRAFTS_KEY, JSON.stringify(allDrafts));
    hydratedDraftRef.current = true;
    setStatus("Dados iniciais do cadastro reaproveitados automaticamente no perfil.");
  }, [profile, saveUserProfile, session.email, session.id, session.name]);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateAvatarFrame = ({ scale, offsetX, offsetY }: { scale: number; offsetX: number; offsetY: number }) => {
    setForm((current) => ({
      ...current,
      avatarScale: scale,
      avatarOffsetX: offsetX,
      avatarOffsetY: offsetY,
    }));
  };

  const setAccountField = (field: keyof typeof accountForm, value: string) => {
    setAccountForm((current) => ({ ...current, [field]: value }));
  };

  const handleUpdateEmail = async () => {
    setAccountStatus("");
    if (!accountForm.nextEmail.trim()) {
      setAccountStatus("Informe o novo e-mail da conta.");
      return;
    }

    const result = await updateEmail(accountForm.nextEmail);
    if (!result.ok) {
      setAccountStatus(result.message || "Não foi possível atualizar o e-mail.");
      return;
    }

    saveUserProfile({
      ...(profile ?? {
        userId: session.id,
        fullName: form.fullName,
        email: form.email,
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
        avatarUrl: form.avatarUrl,
        avatarScale: form.avatarScale,
        avatarOffsetX: form.avatarOffsetX,
        avatarOffsetY: form.avatarOffsetY,
        useAvatarInHeader: form.useAvatarInHeader,
        bio: form.bio,
      }),
      email: accountForm.nextEmail.trim().toLowerCase(),
    });

    setForm((current) => ({ ...current, email: accountForm.nextEmail.trim().toLowerCase() }));
    setAccountStatus(result.message || "Solicitação de troca de e-mail enviada.");
  };

  const handleUpdatePassword = async () => {
    setAccountStatus("");
    if (accountForm.nextPassword.length < 8) {
      setAccountStatus("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (accountForm.nextPassword !== accountForm.confirmPassword) {
      setAccountStatus("A confirmação da senha não confere.");
      return;
    }

    const result = await updatePassword(accountForm.nextPassword);
    if (!result.ok) {
      setAccountStatus(result.message || "Não foi possível atualizar a senha.");
      return;
    }

    setAccountForm((current) => ({ ...current, nextPassword: "", confirmPassword: "" }));
    setAccountStatus(result.message || "Senha atualizada com sucesso.");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    let avatarUrl = avatarFiles[0]?.previewUrl ?? form.avatarUrl;

    if (hasSupabaseEnv && avatarFiles[0]?.file) {
      try {
        const uploaded = await uploadFileToStorage({
          bucket: "profile-assets",
          tenantId: scopeId ?? session.tenantId,
          userId: session.id,
          file: avatarFiles[0].file,
          folder: "avatars",
        });
        avatarUrl = uploaded.publicUrl;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Falha ao enviar a foto para o Supabase.");
      }
    }

    const nextProfile = {
      userId: session.id,
      fullName: form.fullName,
      email: form.email,
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
      avatarUrl,
      avatarScale: form.avatarScale,
      avatarOffsetX: form.avatarOffsetX,
      avatarOffsetY: form.avatarOffsetY,
      useAvatarInHeader: form.useAvatarInHeader,
      bio: form.bio,
    };

    if (hasSupabaseEnv) {
      try {
        await saveRemoteProfile(nextProfile);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Falha ao salvar o perfil no Supabase.");
      }
    }

    saveUserProfile(nextProfile);
    setSaving(false);
    setStatus((current) => current || "Perfil atualizado com sucesso.");
  };

  const navItems = [
    { value: "visao-geral", label: "Visão geral", helper: "Resumo e atalhos" },
    { value: "dados-pessoais", label: "Dados pessoais", helper: "Contato e identificação" },
    { value: "foto-identidade", label: "Foto e identidade", helper: "Imagem, corte e exibição" },
    { value: "dados-profissionais", label: "Dados profissionais", helper: "Registro e atuação" },
    { value: "conta-seguranca", label: "Conta e segurança", helper: "Acesso e proteção" },
    { value: "vinculos", label: "Vínculos institucionais", helper: "Prefeitura, cargo e papel" },
    { value: "historico", label: "Histórico", helper: "Ações recentes da conta" },
  ] as const;

  const profileSummary = [
    {
      label: "Nome",
      value: form.fullName || session.name,
      helper: "Identificação principal da conta.",
    },
    {
      label: "Profissão",
      value: form.professionalType || "Não informada",
      helper: "Exibição nos fluxos institucionais.",
    },
    {
      label: "Contato",
      value: form.phone || "Telefone não informado",
      helper: form.email || session.email,
    },
    {
      label: "Secretaria",
      value: tenantSettings?.secretariaResponsavel || "Não informada",
      helper: "Área institucional associada ao acesso.",
    },
  ] as const;

  const quickActions = [
    { label: "Atualizar dados pessoais", value: "dados-pessoais" },
    { label: "Atualizar dados profissionais", value: "dados-profissionais" },
    { label: "Gerenciar conta e senha", value: "conta-seguranca" },
  ] as const;

  const statusMessage = status ? (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {status}
    </div>
  ) : null;

  const historyItems = useMemo(
    () => [
      {
        id: "perfil",
        title: "Perfil institucional ativo",
        detail: `Acesso principal com perfil ${session.role}.`,
        at: "Agora",
      },
      {
        id: "conta",
        title: "Canal da conta",
        detail: accountForm.currentEmail || session.email,
        at: "Conta atual",
      },
      {
        id: "vinculo",
        title: "Vínculo institucional",
        detail: municipalityName || tenant?.name || "Sem vínculo institucional ativo",
        at: "Prefeitura vinculada",
      },
    ],
    [accountForm.currentEmail, municipalityName, session.email, session.role, tenant?.name],
  );

  return (
    <PortalFrame eyebrow="MEU PERFIL" title="Conta, identidade e vínculos institucionais">
      <PageShell>
        <PageHero
          eyebrow="Conta do usuário"
          title="Gerencie seus dados pessoais, profissionais e de acesso"
          description="Organize identidade, vínculos institucionais e segurança da conta em uma estrutura mais clara e agradável."
          icon={UserRound}
        />

        <InternalSectionNav
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as ProfileSection)}
        />

        {section === "visao-geral" ? (
          <>
            <PageStatsRow className="xl:grid-cols-4">
              <StatCard label="👤 Perfil" value={session.role} description="Permissão ativa na plataforma" icon={ShieldPlus} tone="default" />
              <StatCard
                label="🏛 Prefeitura vinculada"
                value={municipalityName || tenant?.name || "Não vinculada"}
                description="Vínculo institucional em uso"
                icon={Building2}
                tone="blue"
                valueTitle={municipalityName || tenant?.name || "Não vinculada"}
              />
              <StatCard
                label="💼 Dados profissionais"
                value={form.registrationNumber || "Não informado"}
                description="Registro usado nos fluxos técnicos"
                icon={IdCard}
                tone="amber"
              />
              <StatCard
                label="🔐 Conta e segurança"
                value={accountForm.currentEmail || "Sem e-mail"}
                description="Canal principal da conta"
                icon={Mail}
                tone="emerald"
                valueTitle={accountForm.currentEmail || "Sem e-mail"}
              />
            </PageStatsRow>

            <PageMainGrid>
              <PageMainContent>
                <SectionCard title="Resumo do perfil" description="Identidade, vínculo institucional e dados mais usados na rotina.">
                  <div className="grid gap-4 md:grid-cols-2">
                    {profileSummary.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="sig-label">{item.label}</p>
                        <p className="mt-2 truncate text-base font-semibold text-slate-950" title={item.value}>
                          {item.value}
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-500" title={item.helper}>
                          {item.helper}
                        </p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </PageMainContent>

              <PageSideContent>
                <SectionCard title="Painel da conta" description="Identidade visual, atalhos e status institucional em uma leitura curta.">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="sig-label">Foto no cabeçalho</p>
                      <p className="mt-2 text-base font-semibold text-slate-950">{form.useAvatarInHeader ? "Ativada" : "Desativada"}</p>
                      <p className="mt-1 text-sm text-slate-500">Exibição opcional ao lado da identificação do usuário.</p>
                    </div>

                    <div className="space-y-3">
                      {quickActions.map((action) => (
                        <Button
                          key={action.value}
                          type="button"
                          variant="outline"
                          className="w-full justify-start rounded-2xl"
                          onClick={() => setSection(action.value)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="sig-label">E-mail da conta</p>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-950" title={accountForm.currentEmail || session.email}>
                          {accountForm.currentEmail || session.email}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="sig-label">Prefeitura</p>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-950" title={municipalityName || tenant?.name || "Não vinculada"}>
                          {municipalityName || tenant?.name || "Não vinculada"}
                        </p>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        ) : null}

        {section === "dados-pessoais" ? (
          <SectionCard title="Dados pessoais" description="Identificação, contato e endereço do usuário." icon={UserRound}>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <Input value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={form.email} onChange={(event) => setField("email", event.target.value)} />
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
                  <Label>Data de nascimento</Label>
                  <Input type="date" value={form.birthDate} onChange={(event) => setField("birthDate", event.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input value={form.addressLine} onChange={(event) => setField("addressLine", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
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
              <div className="grid gap-4 md:grid-cols-[1fr_0.4fr_0.7fr]">
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
              {statusMessage}
              <Button type="submit" className="h-11 rounded-2xl bg-slate-950 px-6 hover:bg-slate-900" disabled={saving}>
                {saving ? "Salvando..." : "Salvar dados pessoais"}
              </Button>
            </form>
          </SectionCard>
        ) : null}

        {section === "foto-identidade" ? (
          <SectionCard title="Foto e identidade" description="Imagem de perfil, corte e exibição institucional." icon={Camera}>
            <div className="space-y-5">
              <FileDropZone
                title="Foto de perfil"
                description="Arraste uma imagem ou selecione um arquivo para personalizar a conta."
                accept="image/*"
                multiple={false}
                allowPreview
                files={avatarFiles}
                onFilesSelected={setAvatarFiles}
              />

              {avatarFiles[0]?.previewUrl ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-4">
                    <p className="text-base font-semibold text-slate-950">Enquadramento</p>
                    <p className="mt-1 text-sm text-slate-500">Ajuste posição e escala da imagem antes de salvar.</p>
                  </div>
                  <ImageFrameEditor
                    imageUrl={avatarFiles[0].previewUrl}
                    scale={form.avatarScale}
                    offsetX={form.avatarOffsetX}
                    offsetY={form.avatarOffsetY}
                    onChange={updateAvatarFrame}
                    label="Foto do perfil"
                    hint="Arraste a imagem no quadro e ajuste com precisão."
                  />
                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="pr-4">
                      <p className="text-sm font-semibold text-slate-950">Exibir foto no cabeçalho</p>
                      <p className="mt-1 text-sm text-slate-500">Ative para mostrar a foto junto da identificação.</p>
                    </div>
                    <Switch checked={form.useAvatarInHeader} onCheckedChange={(checked) => setForm((current) => ({ ...current, useAvatarInHeader: checked }))} />
                  </div>
                </div>
              ) : null}

              {statusMessage}

              <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-6 hover:bg-slate-900" onClick={(event) => void handleSubmit(event as unknown as FormEvent)} disabled={saving}>
                {saving ? "Salvando..." : "Salvar ajustes da foto"}
              </Button>
            </div>
          </SectionCard>
        ) : null}

        {section === "dados-profissionais" ? (
          <SectionCard title="Dados profissionais" description="Registro, atuação e apresentação profissional do usuário." icon={IdCard}>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo profissional</Label>
                  <Input value={form.professionalType} onChange={(event) => setField("professionalType", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Número do cadastro profissional</Label>
                  <Input value={form.registrationNumber} onChange={(event) => setField("registrationNumber", event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Empresa ou órgão</Label>
                <Input value={form.companyName} onChange={(event) => setField("companyName", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Resumo profissional</Label>
                <Textarea rows={5} value={form.bio} onChange={(event) => setField("bio", event.target.value)} />
              </div>
              {statusMessage}
              <Button type="submit" className="h-11 rounded-2xl bg-slate-950 px-6 hover:bg-slate-900" disabled={saving}>
                {saving ? "Salvando..." : "Salvar dados profissionais"}
              </Button>
            </form>
          </SectionCard>
        ) : null}

        {section === "conta-seguranca" ? (
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <SectionCard title="Situação da conta" description="Resumo do acesso e das credenciais principais." icon={ShieldPlus}>
              <div className="grid gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="sig-label">Conta do usuário</p>
                  <p className="sig-email sig-truncate mt-2 text-sm text-slate-900" title={accountForm.currentEmail || "E-mail não informado"}>
                    {accountForm.currentEmail || "E-mail não informado"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">Canal principal para autenticação e notificações.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="sig-label">Nome vinculado</p>
                  <p className="mt-2 truncate text-base font-semibold text-slate-950" title={form.fullName || session.name}>
                    {form.fullName || session.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{form.professionalType || "Profissão não informada"}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Conta e segurança" description="Atualize e-mail, senha e preferências críticas da conta." icon={KeyRound}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center gap-2 text-slate-950">
                    <Mail className="h-4 w-4" />
                    <p className="text-sm font-semibold">Alterar e-mail da conta</p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>E-mail atual</Label>
                      <Input value={accountForm.currentEmail} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>Novo e-mail</Label>
                      <Input value={accountForm.nextEmail} onChange={(event) => setAccountField("nextEmail", event.target.value)} />
                    </div>
                    <Button type="button" variant="outline" className="w-full rounded-2xl" onClick={handleUpdateEmail}>
                      Atualizar e-mail
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center gap-2 text-slate-950">
                    <KeyRound className="h-4 w-4" />
                    <p className="text-sm font-semibold">Alterar senha</p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Nova senha</Label>
                      <Input type="password" value={accountForm.nextPassword} onChange={(event) => setAccountField("nextPassword", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirmar nova senha</Label>
                      <Input type="password" value={accountForm.confirmPassword} onChange={(event) => setAccountField("confirmPassword", event.target.value)} />
                    </div>
                    <p className="sig-field-help">Use no mínimo 8 caracteres para proteger o acesso institucional.</p>
                    <Button type="button" className="w-full rounded-2xl bg-slate-950 hover:bg-slate-900" onClick={handleUpdatePassword}>
                      Atualizar senha
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-semibold">Solicitar exclusão da conta</p>
                </div>
                <p className="text-sm leading-6 text-rose-700/90">
                  A exclusão definitiva da autenticação exige validação administrativa. Em ambiente produtivo, a solicitação deve ser concluída pelo suporte ou pelo administrador master.
                </p>
              </div>

              {accountStatus ? (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {accountStatus}
                </div>
              ) : null}
            </SectionCard>
          </div>
        ) : null}

        {section === "vinculos" ? (
          <SectionCard title="Vínculos institucionais" description="Prefeitura vinculada, secretaria, perfil e relacionamento institucional." icon={Building2}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="sig-label">Prefeitura vinculada</p>
                <p className="mt-2 truncate text-base font-semibold text-slate-950" title={municipalityName || tenant?.name || "Não vinculada"}>
                  {municipalityName || tenant?.name || "Não vinculada"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {municipality?.state || tenant?.state
                    ? `${municipalityName || tenant?.name || "Prefeitura"} / ${municipality?.state || tenant?.state}`
                    : "Sem vínculo institucional ativo"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="sig-label">Secretaria</p>
                <p className="mt-2 truncate text-base font-semibold text-slate-950" title={tenantSettings?.secretariaResponsavel || "Não informada"}>
                  {tenantSettings?.secretariaResponsavel || "Não informada"}
                </p>
                <p className="mt-1 text-sm text-slate-500">Área institucional associada a este acesso.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="sig-label">Perfil de acesso</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{session.role}</p>
                <p className="mt-1 text-sm text-slate-500">Permissão ativa na plataforma.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="sig-label">Contato institucional</p>
                <p className="mt-2 truncate text-base font-semibold text-slate-950" title={tenantSettings?.emailContato || "Não informado"}>
                  {tenantSettings?.emailContato || "Não informado"}
                </p>
                <p className="mt-1 text-sm text-slate-500">Canal principal da comunicação oficial.</p>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {section === "historico" ? (
          <SectionCard title="Histórico da conta" description="Referências recentes da conta e do vínculo institucional." icon={ShieldPlus}>
            <div className="space-y-3">
              {historyItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{item.at}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
