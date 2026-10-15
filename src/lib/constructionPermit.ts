import type { ProcessRecord, SessionUser } from "@/lib/platform";

export type ConstructionPermitStatus =
  | "rascunho"
  | "aguardando_diretor"
  | "emitido";

export type PermitSignature = {
  profileId: string;
  name: string;
  role: string;
  signedAt: string;
};

export interface ConstructionPermitFormData {
  ownerName: string;
  ownerDocument: string;
  technicalLead: string;
  technicalRegistration: string;
  propertyAddress: string;
  propertyRegistration: string;
  lot: string;
  block: string;
  areaM2: string;
  usage: string;
  workType: string;
  constructionStandard: string;
  licenseObject: string;
  complementaryConditions: string;
}

export interface ConstructionPermitRecord {
  processId: string;
  municipalityId: string;
  permitNumber: string;
  status: ConstructionPermitStatus;
  preparedAt: string;
  updatedAt: string;
  issuedAt?: string;
  formData?: ConstructionPermitFormData;
  analystSignature?: PermitSignature;
  directorSignature?: PermitSignature;
}

const PREFIX = "sigapro:construction-permit:v1";
export const CONSTRUCTION_PERMIT_EVENT = "sigapro:construction-permit-updated";

function key(municipalityId: string, processId: string) {
  return `${PREFIX}:${municipalityId}:${processId}`;
}

export function buildConstructionPermitNumber(protocol: string) {
  const official = String(protocol || "").trim();
  const yearMatch = official.match(/(?:^|-)(\d{4})(?:-|$)/);
  const sequenceMatch = official.match(/(\d+)(?!.*\d)/);
  const year = yearMatch?.[1] || String(new Date().getFullYear());
  const sequence = String(sequenceMatch?.[1] || "1").padStart(6, "0");
  return `ALV-${year}-${sequence}`;
}

export function buildConstructionPermitFormData(
  process: ProcessRecord,
): ConstructionPermitFormData {
  return {
    ownerName: process.ownerName || "",
    ownerDocument: process.ownerDocument || "",
    technicalLead: process.technicalLead || "",
    technicalRegistration: "",
    propertyAddress: process.address || "",
    propertyRegistration:
      process.property.iptu || process.property.registration || "",
    lot: process.property.lot || "",
    block: process.property.block || "",
    areaM2: process.property.area > 0 ? String(process.property.area) : "",
    usage: process.property.usage || "",
    workType: process.property.workType || process.type || "",
    constructionStandard: process.property.constructionStandard || "",
    licenseObject:
      process.property.workType || process.type || "Licenciamento da obra",
    complementaryConditions: "",
  };
}

export function createConstructionPermitDraft(
  process: ProcessRecord,
  municipalityId: string,
  formData?: Partial<ConstructionPermitFormData>,
): ConstructionPermitRecord {
  const now = new Date().toISOString();
  return {
    processId: process.id,
    municipalityId,
    permitNumber: buildConstructionPermitNumber(process.protocol),
    status: "rascunho",
    preparedAt: now,
    updatedAt: now,
    formData: {
      ...buildConstructionPermitFormData(process),
      ...formData,
    },
  };
}

export function readLocalConstructionPermit(
  municipalityId: string,
  processId: string,
): ConstructionPermitRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(municipalityId, processId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConstructionPermitRecord;
    return parsed?.processId === processId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalConstructionPermit(record: ConstructionPermitRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key(record.municipalityId, record.processId),
    JSON.stringify(record),
  );
  window.dispatchEvent(
    new CustomEvent(CONSTRUCTION_PERMIT_EVENT, {
      detail: {
        municipalityId: record.municipalityId,
        processId: record.processId,
        record,
      },
    }),
  );
}

export function getMunicipalDirectorCandidates(
  users: SessionUser[],
  municipalityId: string,
) {
  return users.filter((user) => {
    const scope = user.municipalityId || user.tenantId || "";
    if (scope !== municipalityId || user.accountStatus !== "active") return false;
    if (
      user.role === "profissional_externo" ||
      user.role === "property_owner" ||
      user.role === "proprietario_consulta"
    ) {
      return false;
    }

    const position = `${user.title || ""} ${user.profileLabel || ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    const department = String(user.department || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");

    return (
      /\bdiretor(?:a)?\b/.test(position) &&
      /urban|obra|planejamento|projeto|habitacao/.test(department)
    );
  });
}

export function userCanSignPermitAsAnalyst(
  user: SessionUser,
  process: ProcessRecord,
) {
  if (user.role === "master_admin" || user.role === "master_ops") return true;
  if (user.role !== "analista" && user.role !== "prefeitura_supervisor") return false;

  if (!process.analysis?.assignedProfileId && !process.analysis?.assignedTo) {
    return true;
  }
  return (
    process.analysis?.assignedProfileId === user.id ||
    process.analysis?.assignedTo === user.name
  );
}

export function userCanSignPermitAsDirector(user: SessionUser) {
  const position = `${user.title || ""} ${user.profileLabel || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  const department = String(user.department || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  return (
    /\bdiretor(?:a)?\b/.test(position) &&
    /urban|obra|planejamento|projeto|habitacao/.test(department)
  );
}

export function signConstructionPermitAsAnalyst(
  record: ConstructionPermitRecord,
  user: SessionUser,
): ConstructionPermitRecord {
  const now = new Date().toISOString();
  const next: ConstructionPermitRecord = {
    ...record,
    analystSignature: {
      profileId: user.id,
      name: user.name,
      role: user.title || user.profileLabel || "Analista técnico",
      signedAt: now,
    },
    status: record.directorSignature ? "emitido" : "aguardando_diretor",
    issuedAt: record.directorSignature ? now : record.issuedAt,
    updatedAt: now,
  };
  writeLocalConstructionPermit(next);
  return next;
}

export function signConstructionPermitAsDirector(
  record: ConstructionPermitRecord,
  user: SessionUser,
): ConstructionPermitRecord {
  const now = new Date().toISOString();
  const next: ConstructionPermitRecord = {
    ...record,
    directorSignature: {
      profileId: user.id,
      name: user.name,
      role: user.title || user.profileLabel || "Diretor",
      signedAt: now,
    },
    status: record.analystSignature ? "emitido" : "rascunho",
    issuedAt: record.analystSignature ? now : record.issuedAt,
    updatedAt: now,
  };
  writeLocalConstructionPermit(next);
  return next;
}


export function updateConstructionPermitFormData(
  record: ConstructionPermitRecord,
  formData: ConstructionPermitFormData,
): ConstructionPermitRecord {
  const next: ConstructionPermitRecord = {
    ...record,
    formData: { ...formData },
    updatedAt: new Date().toISOString(),
  };
  writeLocalConstructionPermit(next);
  return next;
}
