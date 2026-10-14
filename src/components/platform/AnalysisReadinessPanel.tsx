import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, ShieldCheck } from "lucide-react";
import type { ProcessRecord, UserProfile } from "@/lib/platform";
import {
  getProcessRegistrationIssues,
  hasRealRegistryValue,
  validateBrazilianTaxId,
} from "@/lib/processIdentityValidation";
import "./AnalysisReadinessPanel.css";

type ReviewState = "ok" | "pending" | "manual";

interface ReviewLine {
  id: string;
  title: string;
  detail: string;
  state: ReviewState;
}

export function getAnalysisPreflightChecks(
  process: ProcessRecord,
  ownerProfile?: UserProfile,
  technicalProfile?: UserProfile,
): ReviewLine[] {
  const ownerDocument = ownerProfile?.cpfCnpj || process.ownerDocument || "";
  const documentIssues = getProcessRegistrationIssues(
    { ...process, ownerDocument },
    Boolean(technicalProfile?.registrationNumber?.trim()),
  );
  const identityComplete = documentIssues.length === 0 &&
    validateBrazilianTaxId(ownerDocument) === "formato_valido";
  const requiredDocuments = process.documents.filter((doc) => doc.required);
  const requiredApproved = requiredDocuments.length > 0 &&
    requiredDocuments.every((doc) => doc.uploaded && doc.reviewStatus === "aprovado");
  const openRequirements = process.requirements.some((item) =>
    item.status === "aberta" || item.status === "respondida",
  );
  const constructionReady = process.property.area > 0 &&
    hasRealRegistryValue(process.property.usage) &&
    hasRealRegistryValue(process.property.workType);

  return [
    {
      id: "cadastro",
      title: "Identificação e vínculo cadastral",
      detail: identityComplete
        ? "Campos básicos presentes; conferir legitimidade e documentos comprobatórios."
        : documentIssues.join(" ") || "Há dados de identificação incompletos.",
      state: identityComplete ? "ok" : "pending",
    },
    {
      id: "documentos",
      title: "Documentos obrigatórios apresentados e conferidos",
      detail: requiredDocuments.length === 0
        ? "Ainda não há documentos obrigatórios definidos para este serviço."
        : `${requiredDocuments.filter((doc) => doc.uploaded && doc.reviewStatus === "aprovado").length} de ${requiredDocuments.length} documentos obrigatórios aprovados.`,
      state: requiredApproved ? "ok" : "pending",
    },
    {
      id: "projeto",
      title: "Área, uso e natureza da obra",
      detail: constructionReady
        ? "Dados declarados presentes, sujeitos a conferência do analista."
        : "Metragem, uso ou natureza da obra estão ausentes ou inválidos.",
      state: constructionReady ? "ok" : "pending",
    },
    {
      id: "comunique",
      title: "Exigências e comunique-se",
      detail: openRequirements
        ? "Existem exigências abertas ou respondidas que ainda necessitam conclusão."
        : "Nenhuma exigência aberta detectada na tramitação atual.",
      state: openRequirements ? "pending" : "ok",
    },
    {
      id: "urbanismo",
      title: "Zoneamento, recuos, ocupação e legislação municipal",
      detail: "Conferência técnica manual conforme normas locais aprovadas pela Prefeitura.",
      state: "manual",
    },
    {
      id: "responsabilidade",
      title: "ART / RRT / TRT, assinatura e parecer conclusivo",
      detail: "Verificar autenticidade, atribuições e validade dos documentos; registrar parecer formal.",
      state: "manual",
    },
  ];
}

export function AnalysisReadinessPanel({
  process,
  ownerProfile,
  technicalProfile,
}: {
  process: ProcessRecord;
  ownerProfile?: UserProfile;
  technicalProfile?: UserProfile;
}) {
  const checks = getAnalysisPreflightChecks(process, ownerProfile, technicalProfile);
  const pending = checks.filter((item) => item.state === "pending").length;
  const manual = checks.filter((item) => item.state === "manual").length;
  return (
    <section className="sig-preflight" aria-label="Pré-conferência da análise urbanística">
      <div className="sig-preflight-heading">
        <div className="sig-preflight-title">
          <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
          <div>
            <p className="sig-preflight-overline">Conferência preparatória</p>
            <h2>Pontos de atenção da análise urbanística</h2>
            <p className="sig-preflight-explain">
              Informações derivadas dos documentos e registros existentes.
              Este quadro não representa aprovação técnica ou decisão automática da Prefeitura.
            </p>
          </div>
        </div>
        <span className="sig-preflight-summary">{pending} pendência(s) · {manual} conferência(s) manuais</span>
      </div>
      <div className="sig-preflight-list">
        {checks.map((check) => {
          const Icon = check.state === "ok" ? CheckCircle2 :
            check.state === "manual" ? Clock3 : AlertTriangle;
          return (
            <article className="sig-preflight-item" key={check.id}>
              <span className={`sig-preflight-icon sig-preflight-icon-${check.state}`}><Icon size={19} aria-hidden="true" /></span>
              <div className="sig-preflight-copy">
                <h3>{check.title}</h3>
                <p>{check.detail}</p>
              </div>
              <span className={`sig-preflight-status sig-preflight-status-${check.state}`}>
                {check.state === "ok" ? "Dados presentes" : check.state === "manual" ? "Revisão humana" : "Pendente"}
              </span>
            </article>
          );
        })}
      </div>
      <div className="sig-preflight-footer">
        <ShieldCheck size={18} aria-hidden="true" />
        Os critérios legais específicos e o checklist formal devem ser configurados e homologados pela unidade municipal responsável antes de integrarem a decisão de deferimento.
      </div>
    </section>
  );
}
