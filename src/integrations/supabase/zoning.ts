import { supabase } from "@/integrations/supabase/client";
import { type ZoningRule, type ZoningRuleStatus, type ZoningRuleType, type ZoningUseType } from "@/lib/zoning";

type ZoningRuleInput = Omit<ZoningRule, "createdAt"> & { createdAt?: string };

function normalizeNumeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAllowedUses(value: unknown): ZoningUseType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ZoningUseType => typeof item === "string");
}

function mapRowToRule(row: Record<string, unknown>): ZoningRule {
  return {
    id: String(row.id ?? ""),
    municipalityId: String(row.municipality_id ?? ""),
    nome: String(row.nome ?? ""),
    tipo: String(row.tipo ?? "residencial") as ZoningRuleType,
    descricao: String(row.descricao ?? ""),
    coeficienteAproveitamento: normalizeNumeric(row.coeficiente_aproveitamento),
    taxaOcupacao: normalizeNumeric(row.taxa_ocupacao),
    taxaPermeabilidade: normalizeNumeric(row.taxa_permeabilidade),
    alturaMaxima: normalizeNumeric(row.altura_maxima),
    recuoFrontal: normalizeNumeric(row.recuo_frontal),
    recuoLateral: normalizeNumeric(row.recuo_lateral),
    recuoFundo: normalizeNumeric(row.recuo_fundo),
    usosPermitidos: normalizeAllowedUses(row.usos_permitidos),
    usosProibidos: String(row.usos_proibidos ?? ""),
    observacoes: String(row.observacoes ?? ""),
    status: String(row.status ?? "ativa") as ZoningRuleStatus,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapRuleToPayload(rule: ZoningRuleInput) {
  return {
    id: rule.id,
    municipality_id: rule.municipalityId,
    nome: rule.nome,
    tipo: rule.tipo,
    descricao: rule.descricao,
    coeficiente_aproveitamento: rule.coeficienteAproveitamento,
    taxa_ocupacao: rule.taxaOcupacao,
    taxa_permeabilidade: rule.taxaPermeabilidade,
    altura_maxima: rule.alturaMaxima,
    recuo_frontal: rule.recuoFrontal,
    recuo_lateral: rule.recuoLateral,
    recuo_fundo: rule.recuoFundo,
    usos_permitidos: rule.usosPermitidos,
    usos_proibidos: rule.usosProibidos,
    observacoes: rule.observacoes,
    status: rule.status,
    created_at: rule.createdAt ?? new Date().toISOString(),
  };
}

export async function listRemoteZoningRules(municipalityId: string) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const { data, error } = await supabase
    .from("zoning_rules")
    .select("*")
    .eq("municipality_id", municipalityId)
    .order("nome", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapRowToRule(row as Record<string, unknown>));
}

export async function saveRemoteZoningRule(rule: ZoningRuleInput) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const payload = mapRuleToPayload(rule);

  const query = rule.id
    ? supabase
        .from("zoning_rules")
        .update(payload)
        .eq("id", rule.id)
        .eq("municipality_id", rule.municipalityId)
        .select("*")
        .single()
    : supabase.from("zoning_rules").insert(payload).select("*").single();

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return mapRowToRule(data as Record<string, unknown>);
}

export async function updateRemoteZoningRuleStatus(input: {
  id: string;
  municipalityId: string;
  status: ZoningRuleStatus;
}) {
  if (!supabase) {
    throw new Error("Supabase indisponivel.");
  }

  const { data, error } = await supabase
    .from("zoning_rules")
    .update({ status: input.status })
    .eq("id", input.id)
    .eq("municipality_id", input.municipalityId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapRowToRule(data as Record<string, unknown>);
}
