import { AuditAiExecutiveSummary, AuditAiOccurrence } from './baseAuditAiProvider.service';

export type AuditWhatsAppMessageInput = {
  periodStart: Date;
  periodEnd: Date;
  instancesAudited: string[] | null;
  executiveSummary: AuditAiExecutiveSummary | null;
  riskMatrix: Record<string, number> | null;
  occurrencesDetails: AuditAiOccurrence[] | null;
};

const RISK_EMOJI: Record<string, string> = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/** Builds the WhatsApp notification text (RF08.3), following the template in PRD section 8.1. */
export function buildAuditWhatsAppMessage(input: AuditWhatsAppMessageInput): string {
  const instances =
    !input.instancesAudited || input.instancesAudited.length === 0 ? 'Todas' : input.instancesAudited.join(', ');
  const matrix = input.riskMatrix || {};
  const summary = input.executiveSummary;
  const criticalOccurrence = (input.occurrencesDetails || []).find((occurrence) => occurrence.severity === 'CRITICAL');

  const criticalLine = criticalOccurrence
    ? `• ${RISK_EMOJI.CRITICAL} Crítico: ${matrix.CRITICAL ?? 0} conversa(s) com indício de ${criticalOccurrence.category}.`
    : `• ${RISK_EMOJI.CRITICAL} Crítico: ${matrix.CRITICAL ?? 0} conversas`;

  const lines = [
    '🚨 Auditoria de Comunicação & Compliance',
    '',
    `Período: ${formatDate(input.periodStart)} a ${formatDate(input.periodEnd)}`,
    `Instâncias Auditadas: ${instances}`,
    '',
    '📊 Resumo da Comunicação Executiva:',
    `• Tom Geral: ${summary?.communication_tone || 'N/A'}`,
    `• Alinhamento Sócio ↔ Gerente: ${summary?.management_alignment_score || 'N/A'}`,
    summary?.operational_bottlenecks?.length
      ? `• Gargalo Detectado: ${summary.operational_bottlenecks[0]}`
      : '• Gargalo Detectado: Nenhum registrado.',
    '',
    '⚖️ Matriz de Risco Jurídico:',
    `• ${RISK_EMOJI.LOW} Baixo Risco: ${matrix.LOW ?? 0} conversas`,
    `• ${RISK_EMOJI.MEDIUM} Médio Risco: ${matrix.MEDIUM ?? 0} conversas`,
    `• ${RISK_EMOJI.HIGH} Alto Risco: ${matrix.HIGH ?? 0} conversas`,
    criticalLine,
    '',
    '📎 O relatório executivo completo em PDF contendo as evidências e análises jurídicas está anexado abaixo.',
  ];

  return lines.join('\n');
}
