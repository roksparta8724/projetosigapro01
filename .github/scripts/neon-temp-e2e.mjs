import { randomBytes } from "node:crypto";
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

const authUrl = process.env.NEON_TEMP_AUTH_URL;
const dataApiUrl = process.env.NEON_TEMP_DATA_API;
const tenantId = process.env.NEON_TEMP_TENANT_ID;

if (!authUrl || !dataApiUrl || !tenantId) {
  throw new Error("Missing Neon TEMP E2E environment.");
}

const runId = process.env.GITHUB_RUN_ID || Date.now().toString();
const email = `sigapro-ci-${runId}-${Date.now()}@example.com`;
const password = `Ci!${randomBytes(18).toString("base64url")}Aa9`;

const client = createClient({
  auth: {
    adapter: SupabaseAuthAdapter(),
    url: authUrl,
    allowAnonymous: true,
  },
  dataApi: {
    url: dataApiUrl,
  },
});

const signup = await client.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: "https://sigapromunicipal.com.br/acesso",
    data: {
      full_name: "SIGAPRO CI TEMP",
      role: "profissional_externo",
      tenant_id: tenantId,
    },
  },
});

if (signup.error) {
  throw new Error(`Neon Auth signup failed: ${signup.error.message}`);
}

const authUser = signup.data?.user;
const session = signup.data?.session;
if (!authUser?.id || !session) {
  throw new Error("Neon Auth signup did not create an authenticated session.");
}

console.log(`SIGAPRO_E2E_EMAIL=${email}`);
console.log(`SIGAPRO_E2E_AUTH_USER_ID=${authUser.id}`);

const registration = await client.rpc("register_external_account", {
  _tenant_id: tenantId,
  _full_name: "SIGAPRO CI TEMP",
  _email: email,
  _cpf_cnpj: null,
  _phone: null,
  _professional_type: "Teste automatizado",
  _registration_number: null,
  _company_name: null,
  _title: "Teste automatizado",
  _bio: "Conta descartavel do CI Neon TEMP",
});

if (registration.error) {
  throw new Error(`register_external_account failed: ${registration.error.message}`);
}

const profileId = registration.data?.profile_id;
if (!profileId) {
  throw new Error("Registration did not return profile_id.");
}

console.log(`SIGAPRO_E2E_PROFILE_ID=${profileId}`);

const currentProfile = await client.rpc("current_profile_id");
if (currentProfile.error) {
  throw new Error(`current_profile_id failed: ${currentProfile.error.message}`);
}
if (currentProfile.data !== profileId) {
  throw new Error(`current_profile_id mismatch: expected ${profileId}, got ${currentProfile.data}`);
}

const profile = await client
  .from("profiles")
  .select("id,role,account_status")
  .eq("id", profileId)
  .maybeSingle();

if (profile.error) {
  throw new Error(`Profile RLS read failed: ${profile.error.message}`);
}
if (profile.data?.id !== profileId || profile.data?.account_status !== "active") {
  throw new Error("Profile RLS returned an unexpected record.");
}

const membership = await client
  .from("tenant_memberships")
  .select("tenant_id,profile_id,is_active")
  .eq("tenant_id", tenantId)
  .eq("profile_id", profileId)
  .eq("is_active", true)
  .maybeSingle();

if (membership.error) {
  throw new Error(`Membership RLS read failed: ${membership.error.message}`);
}
if (membership.data?.profile_id !== profileId) {
  throw new Error("Profile-first membership was not visible after signup.");
}

const municipality = await client
  .from("municipalities")
  .select("id,status")
  .eq("id", tenantId)
  .maybeSingle();

if (municipality.error || municipality.data?.id !== tenantId) {
  throw new Error(`Authenticated municipality read failed: ${municipality.error?.message || "missing row"}`);
}

const signout = await client.auth.signOut();
if (signout?.error) {
  throw new Error(`Sign out failed: ${signout.error.message}`);
}

console.log("SIGAPRO_E2E_RESULT=PASS");
