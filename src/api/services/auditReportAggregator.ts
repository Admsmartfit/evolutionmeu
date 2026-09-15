import {
  AuditAiDirective,
  AuditAiDirectivesResult,
  AuditAiExecutiveSummary,
  AuditAiOccurrence,
  AuditAiResult,
} from './baseAuditAiProvider.service';

const RISK_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TONE_PRIORITY = ['CORDIAL', 'NEUTRO', 'TENSO', 'CRITICO'];
// Worst alignment score is last: BAIXO is worse than MEDIO which is worse than ALTO.
const ALIGNMENT_PRIORITY = ['ALTO', 'MEDIO', 'BAIXO'];

export type AggregatedAuditResult = {
  overall_risk_level: string;
  executive_summary: AuditAiExecutiveSummary;
  occurrences: AuditAiOccurrence[];
  risk_matrix: Record<string, number>;
};

function pickWorst(values: string[], priority: string[], fallback: string): string {
  let worstIndex = -1;
  let worst = fallback;

  for (const value of values) {
    const index = priority.indexOf(value);
    if (index > worstIndex) {
      worstIndex = index;
      worst = value;
    }
  }

  return worst;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))];
}

/** Counts how many analyzed conversations fell into each risk bucket (used by the PDF's risk matrix). */
function buildRiskMatrix(riskLevels: string[]): Record<string, number> {
  const matrix: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };

  for (const level of riskLevels) {
    if (level in matrix) matrix[level] += 1;
  }

  return matrix;
}

/**
 * Merges the per-conversation-chunk AI results (RF05/RF06) into a single report:
 * the worst risk/tone/alignment wins (so a single critical conversation is never
 * diluted by many uneventful ones), decisions/bottlenecks are deduplicated, and
 * "NENHUM" (no violation) occurrences are dropped since they carry no findings.
 */
export function aggregateAuditResults(results: AuditAiResult[]): AggregatedAuditResult {
  if (results.length === 0) {
    return {
      overall_risk_level: 'LOW',
      executive_summary: {
        communication_tone: 'NEUTRO',
        key_decisions: [],
        operational_bottlenecks: [],
        management_alignment_score: 'ALTO',
      },
      occurrences: [],
      risk_matrix: buildRiskMatrix([]),
    };
  }

  const overallRiskLevel = pickWorst(
    results.map((result) => result.audit_findings.overall_risk_level),
    RISK_PRIORITY,
    'LOW',
  );
  const communicationTone = pickWorst(
    results.map((result) => result.executive_summary.communication_tone),
    TONE_PRIORITY,
    'NEUTRO',
  );
  const managementAlignmentScore = pickWorst(
    results.map((result) => result.executive_summary.management_alignment_score),
    ALIGNMENT_PRIORITY,
    'ALTO',
  );

  const keyDecisions = uniqueStrings(results.flatMap((result) => result.executive_summary.key_decisions || []));
  const operationalBottlenecks = uniqueStrings(
    results.flatMap((result) => result.executive_summary.operational_bottlenecks || []),
  );

  const occurrences = results
    .flatMap((result) => result.audit_findings.occurrences || [])
    .filter((occurrence) => occurrence?.category && occurrence.category !== 'NENHUM');

  const riskMatrix = buildRiskMatrix(results.map((result) => result.audit_findings.overall_risk_level));

  return {
    overall_risk_level: overallRiskLevel,
    executive_summary: {
      communication_tone: communicationTone,
      key_decisions: keyDecisions,
      operational_bottlenecks: operationalBottlenecks,
      management_alignment_score: managementAlignmentScore,
    },
    occurrences,
    risk_matrix: riskMatrix,
  };
}

/**
 * Placeholders with no corporate role (e.g. "[OUTRO_B]") come from
 * AuditMessageCollectorService.collect()'s `unidentifiedLabels` map; this builds the
 * text -> text function that swaps each for the real phone number behind it. Placeholders
 * with a known role (SOCIO/GERENTE/ADMINISTRATIVO) are left alone — RF07.2 anonymization
 * still applies to identified staff. This only ever narrows what's already anonymized, it
 * never re-adds PII the AI itself introduced.
 */
function buildRevealer(unidentifiedLabels: Record<string, string>): (text: string) => string {
  const entries = Object.entries(unidentifiedLabels);

  return (text: string): string =>
    entries.reduce((acc, [label, phoneNumber]) => acc.split(label).join(`+${phoneNumber}`), text);
}

export function revealUnidentifiedInterlocutors(
  result: AggregatedAuditResult,
  unidentifiedLabels: Record<string, string>,
): AggregatedAuditResult {
  if (Object.keys(unidentifiedLabels).length === 0) return result;

  const reveal = buildRevealer(unidentifiedLabels);

  return {
    ...result,
    executive_summary: {
      ...result.executive_summary,
      key_decisions: result.executive_summary.key_decisions.map(reveal),
      operational_bottlenecks: result.executive_summary.operational_bottlenecks.map(reveal),
    },
    occurrences: result.occurrences.map((occurrence) => ({
      ...occurrence,
      interlocutors: reveal(occurrence.interlocutors),
      evidence_quote: reveal(occurrence.evidence_quote),
      legal_fundamentation: reveal(occurrence.legal_fundamentation),
      recommendation: reveal(occurrence.recommendation),
    })),
  };
}

/** Same idea as aggregateAuditResults, but for DIRECTIVES reports: just flatten, no risk/tone scoring. */
export function aggregateDirectives(results: AuditAiDirectivesResult[]): AuditAiDirective[] {
  return results.flatMap((result) => result.directives || []).filter((directive) => directive?.directive);
}

/** Same idea as revealUnidentifiedInterlocutors, but for the DIRECTIVES report's fields. */
export function revealUnidentifiedInDirectives(
  directives: AuditAiDirective[],
  unidentifiedLabels: Record<string, string>,
): AuditAiDirective[] {
  if (Object.keys(unidentifiedLabels).length === 0) return directives;

  const reveal = buildRevealer(unidentifiedLabels);

  return directives.map((directive) => ({
    ...directive,
    issued_by: reveal(directive.issued_by),
    issued_to: reveal(directive.issued_to),
    directive: reveal(directive.directive),
    context_quote: reveal(directive.context_quote),
  }));
}
