import type { ReactNode } from "react";
import { CalendarClock, Clock3, Files, FolderOpen, Landmark, UserRound, Workflow } from "lucide-react";
import "./ProcessDetailHero.css";

export type ProcessDetailHeroProps = {
  protocol: string;
  subject: string;
  municipality: string;
  processType: string;
  currentStage: string;
  ownerName?: string;
  responsibleUnit?: string;
  assignedTo?: string;
  deadline?: string;
  visiblePendingCount: number;
  actions?: ReactNode;
  /** External and interdepartmental tracking must not reveal internal assignees or SLA. */
  restrictedView?: boolean;
};

function safeLabel(value: string | null | undefined, fallback: string) {
  return String(value ?? "").trim() || fallback;
}

/**
 * A compact light process summary distinct from the single blue institutional
 * masthead. The two process facts are borderless editorial columns, NOT nested
 * cards; ownership, deadline and restricted views stay fully data-driven.
 */
export function ProcessDetailHero({
  protocol, subject, municipality, processType, currentStage,
  ownerName, responsibleUnit, assignedTo, deadline, visiblePendingCount,
  actions, restrictedView = false,
}: ProcessDetailHeroProps) {
  const stage = safeLabel(currentStage, "Etapa não informada");
  const unit = restrictedView
    ? "Acompanhamento do protocolo"
    : safeLabel(responsibleUnit, "Unidade não informada");
  const handler = restrictedView ? "" : String(assignedTo ?? "").trim();
  const deadlineText = restrictedView
    ? "Acompanhe a etapa atual do protocolo"
    : safeLabel(deadline, "Prazo não informado");

  return (
    <section data-process-detail-hero="premium" aria-label="Resumo do processo"
      className="sig-detail-hero">
      <div className="sig-detail-hero-main">
        <div className="sig-detail-hero-heading">
          <span className="sig-detail-hero-icon" aria-hidden="true">
            <FolderOpen size={23} strokeWidth={1.9} />
          </span>
          <div className="sig-detail-hero-copy">
            <div className="sig-detail-hero-overline">
              <span><Landmark size={13} aria-hidden="true" /> {safeLabel(municipality, "Prefeitura municipal")}</span>
              <span className="sig-detail-hero-number" title={protocol}>{protocol}</span>
            </div>
            <p className="sig-detail-hero-eyebrow">Painel do processo · {processType}</p>
            <h1 className="sig-detail-hero-title" title={subject}>
              {safeLabel(subject, "Assunto não informado no cadastro")}
            </h1>
            <div className="sig-detail-hero-subline">
              <span className="sig-detail-hero-stage" title={stage}>
                <Workflow size={14} aria-hidden="true" />{stage}
              </span>
              {ownerName?.trim() ? (
                <span className="sig-detail-hero-owner" title={ownerName}>
                  <UserRound size={14} aria-hidden="true" />
                  Interessado: {ownerName}
                </span>
              ) : (
                <span className="sig-detail-hero-owner">Interessado não informado</span>
              )}
            </div>
          </div>
        </div>
        {actions ? (
          <div data-process-detail-hero-actions="true" className="sig-detail-hero-actions">
            {actions}
          </div>
        ) : null}
      </div>

      <div className="sig-detail-hero-facts" aria-label="Informações principais do processo">
        <div data-process-detail-hero-mini-card="unit" className="sig-detail-hero-fact">
          <div className="sig-detail-hero-fact-icon"><Landmark size={18} aria-hidden="true" /></div>
          <div className="sig-detail-hero-fact-copy">
            <p className="sig-detail-hero-fact-label">Unidade / responsável</p>
            <p className="sig-detail-hero-fact-value" title={unit}>{unit}</p>
            {handler ? (
              <p className="sig-detail-hero-fact-help" title={handler}>Responsável: {handler}</p>
            ) : (
              <p className="sig-detail-hero-fact-help">
                {restrictedView ? "Consulta e acompanhamento" : "Sem atribuição individual registrada"}
              </p>
            )}
          </div>
        </div>
        <div data-process-detail-hero-mini-card="deadline" className="sig-detail-hero-fact">
          <div className="sig-detail-hero-fact-icon"><CalendarClock size={18} aria-hidden="true" /></div>
          <div className="sig-detail-hero-fact-copy">
            <p className="sig-detail-hero-fact-label">Prazo / pendências</p>
            <p className="sig-detail-hero-fact-value" title={deadlineText}>
              <Clock3 size={14} aria-hidden="true" />{deadlineText}
            </p>
            <p className="sig-detail-hero-fact-help">
              <Files size={14} aria-hidden="true" />
              {visiblePendingCount === 0
                ? "Nenhuma exigência visível nesta consulta"
                : `${visiblePendingCount} exigência(s) visível(is) nesta consulta`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
