import { AlertTriangle, Building2, ClipboardCheck, Contact, FileBadge2, MapPinned, UserRound } from "lucide-react";
import type { ProcessRecord, UserProfile } from "@/lib/platform";
import { getProcessRegistrationIssues, validateBrazilianTaxId } from "@/lib/processIdentityValidation";

interface ProcessIdentityPanelProps {
  process: ProcessRecord;
  ownerProfile?: UserProfile;
  technicalProfile?: UserProfile;
  constructionStandardLabel: string;
  canViewFullIdentity: boolean;
}

function samePerson(left: string | undefined, right: string | undefined): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(left?.trim() && right?.trim() && normalize(left) === normalize(right));
}

function dataOrPending(value: string | number | null | undefined): string {
  const text = String(value ?? "").trim();
  return text && text !== "0" ? text : "Não informado";
}

function DetailField({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={"sig-pid-field" + (warning ? " sig-pid-field-warning" : "")}>
      <span className="sig-pid-label">{label}</span>
      <span className="sig-pid-value" title={value}>{value}</span>
    </div>
  );
}

export function ProcessIdentityPanel({
  process,
  ownerProfile,
  technicalProfile,
  constructionStandardLabel,
  canViewFullIdentity,
}: ProcessIdentityPanelProps) {
  // Nunca associar cadastros só por nome parecido. Uma vinculação inequívoca é obrigatória.
  const linkedOwner = samePerson(ownerProfile?.fullName, process.ownerName) ? ownerProfile : undefined;
  const linkedProfessional = samePerson(technicalProfile?.fullName, process.technicalLead) ? technicalProfile : undefined;
  const ownerDocument = linkedOwner?.cpfCnpj?.trim() || process.ownerDocument || "";
  const ownerDocumentStatus = validateBrazilianTaxId(ownerDocument);
  const hasFullDocument = ownerDocumentStatus === "formato_valido";
  const professionalDocument = linkedProfessional?.cpfCnpj?.trim() || "";
  const professionalDocumentStatus = validateBrazilianTaxId(professionalDocument);
  const professionalRegistration = linkedProfessional?.registrationNumber?.trim() || "";
  const issues = getProcessRegistrationIssues({ ...process, ownerDocument }, Boolean(professionalRegistration));
  const visibleDocument = !canViewFullIdentity
    ? "Acesso restrito à equipe autorizada"
    : ownerDocumentStatus === "incompleto"
      ? "Documento integral não cadastrado"
      : dataOrPending(ownerDocument);

  return (
    <section className="sig-pid-panel" aria-label="Identificação cadastral e conferência do imóvel">
      <header className="sig-pid-header">
        <div className="sig-pid-heading">
          <Building2 aria-hidden="true" size={23} />
          <div>
            <p className="sig-pid-eyebrow">Processo municipal · dados cadastrais</p>
            <h2>Imóvel, proprietário e responsável técnico</h2>
            <p className="sig-pid-intro">Conferência dos dados registrados, sem preenchimento fictício.</p>
          </div>
        </div>
        <span className={"sig-pid-count" + (issues.length ? " sig-pid-count-pending" : "")}>
          <ClipboardCheck aria-hidden="true" size={16} />
          {issues.length ? issues.length + " pendência(s) para conferência" : "Campos básicos preenchidos"}
        </span>
      </header>

      <div className="sig-pid-section">
        <div className="sig-pid-section-title"><UserRound size={19} aria-hidden="true" /> Proprietário / titular</div>
        <div className="sig-pid-grid">
          <DetailField label="Nome completo" value={dataOrPending(process.ownerName)} warning={!process.ownerName.trim()} />
          <DetailField label="CPF / CNPJ" value={visibleDocument} warning={canViewFullIdentity && !hasFullDocument} />
          <DetailField label="Situação do documento" value={canViewFullIdentity ? (
            hasFullDocument ? "Formato conferido · titularidade não verificada" :
            ownerDocumentStatus === "incompleto" ? "Cadastro incompleto" :
            ownerDocumentStatus === "ausente" ? "Não informado" : "Formato inválido"
          ) : "Consulta interna"} warning={canViewFullIdentity && !hasFullDocument} />
          <DetailField label="Contato do titular" value={canViewFullIdentity ? dataOrPending(linkedOwner?.email || linkedOwner?.phone) : "Consulta interna"} />
        </div>
      </div>

      <div className="sig-pid-section">
        <div className="sig-pid-section-title"><Contact size={19} aria-hidden="true" /> Responsável técnico</div>
        <div className="sig-pid-grid">
          <DetailField label="Nome completo" value={dataOrPending(process.technicalLead)} warning={!process.technicalLead.trim()} />
          <DetailField label="Profissão" value={dataOrPending(linkedProfessional?.professionalType)} />
          <DetailField label="CPF / CNPJ do profissional" value={canViewFullIdentity ? dataOrPending(professionalDocument) : "Acesso restrito à equipe autorizada"} warning={canViewFullIdentity && professionalDocumentStatus !== "formato_valido"} />
          <DetailField label="CREA / CAU / CFT" value={dataOrPending(professionalRegistration)} warning={!professionalRegistration} />
          <DetailField label="Contato profissional" value={canViewFullIdentity ? dataOrPending(linkedProfessional?.email || linkedProfessional?.phone) : "Consulta interna"} />
        </div>
        <p className="sig-pid-footnote"><FileBadge2 size={15} aria-hidden="true" /> Registro exibido não comprova regularidade no conselho. ART/RRT/TRT e vínculo devem ser conferidos nos documentos do processo.</p>
      </div>

      <div className="sig-pid-section">
        <div className="sig-pid-section-title"><MapPinned size={19} aria-hidden="true" /> Identificação imobiliária</div>
        <div className="sig-pid-grid">
          <DetailField label="Endereço do imóvel" value={dataOrPending(process.address)} warning={!process.address.trim()} />
          <DetailField label="Inscrição imobiliária / IPTU" value={dataOrPending(process.property.iptu)} warning={!process.property.iptu.trim()} />
          <DetailField label="Matrícula" value={dataOrPending(process.property.registration)} warning={!process.property.registration.trim()} />
          <DetailField label="Lote / Quadra" value={dataOrPending([process.property.lot, process.property.block].filter(Boolean).join(" / "))} />
          <DetailField label="Área declarada" value={process.property.area > 0 ? process.property.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " m²" : "Não informada"} warning={!(process.property.area > 0)} />
          <DetailField label="Uso da edificação" value={dataOrPending(process.property.usage)} warning={!process.property.usage.trim()} />
          <DetailField label="Natureza da obra" value={dataOrPending(process.property.workType)} />
          <DetailField label="Padrão construtivo" value={constructionStandardLabel} />
        </div>
      </div>

      {canViewFullIdentity && issues.length > 0 ? (
        <div className="sig-pid-alert" role="status">
          <div className="sig-pid-alert-title"><AlertTriangle size={18} aria-hidden="true" /> Dados que precisam de conferência</div>
          <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          <p>Verificação de formato não equivale à validação de identidade, titularidade, matrícula ou registro em bases oficiais.</p>
        </div>
      ) : null}
    </section>
  );
}
