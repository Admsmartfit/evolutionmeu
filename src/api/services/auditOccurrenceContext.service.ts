import { PrismaRepository } from '@api/repository/repository.service';
import { BadRequestException, NotFoundException } from '@exceptions';
import { getConversationMessage } from '@utils/getConversationMessage';

import { AuditInstanceRef, formatMessageContent, resolveOwnerPhoneNumber } from './auditMessageCollector.service';
import { AuditAiOccurrence, AuditOccurrenceContextRef } from './baseAuditAiProvider.service';

// "Ver contexto da conversa": um dia antes e um dia depois da janela de mensagens que gerou
// a ocorrência, para o investigador entender o que aconteceu antes/depois do trecho flagrado.
const CONTEXT_MARGIN_MS = 24 * 60 * 60 * 1000;

export type AuditOccurrenceContextMessage = {
  timestamp: string;
  fromMe: boolean;
  speaker: string;
  content: string;
};

export type AuditOccurrenceContext = {
  instanceName: string;
  ownerLabel: string;
  counterpartLabel: string;
  windowStart: string;
  windowEnd: string;
  messages: AuditOccurrenceContextMessage[];
};

/**
 * Rebuilds the real (non-anonymized) conversation transcript behind a compliance occurrence,
 * for an authorized admin reviewing it — unlike the report itself, this never leaves the
 * system or goes to an AI provider, so there's no RF07 anonymization to preserve here.
 */
export class AuditOccurrenceContextService {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  public async getContextForOccurrence(reportId: string, occurrenceIndex: number): Promise<AuditOccurrenceContext> {
    const report = await this.prismaRepository.auditReport.findUnique({ where: { id: reportId } });

    if (!report) {
      throw new NotFoundException(`AuditReport not found: "${reportId}"`);
    }

    const occurrences = (report.occurrencesDetails as AuditAiOccurrence[] | null) || [];
    const occurrence = occurrences[occurrenceIndex];

    if (!occurrence) {
      throw new NotFoundException(`Occurrence ${occurrenceIndex} not found in report "${reportId}"`);
    }

    if (!occurrence.contextRef) {
      throw new BadRequestException(
        'This occurrence has no conversation context reference (report generated before this feature existed).',
      );
    }

    return this.buildContext(occurrence.contextRef);
  }

  private async buildContext(ref: AuditOccurrenceContextRef): Promise<AuditOccurrenceContext> {
    const instance = await this.prismaRepository.instance.findUnique({
      where: { id: ref.instanceId },
      select: { id: true, name: true, number: true, ownerJid: true },
    });

    if (!instance) {
      throw new BadRequestException(`Instance "${ref.instanceId}" no longer exists.`);
    }

    const windowStart = new Date(new Date(ref.conversationStart).getTime() - CONTEXT_MARGIN_MS);
    const windowEnd = new Date(new Date(ref.conversationEnd).getTime() + CONTEXT_MARGIN_MS);

    const messages = await this.prismaRepository.message.findMany({
      where: {
        instanceId: ref.instanceId,
        messageTimestamp: {
          gte: Math.floor(windowStart.getTime() / 1000),
          lte: Math.floor(windowEnd.getTime() / 1000),
        },
      },
      orderBy: { messageTimestamp: 'asc' },
      select: { key: true, message: true, messageTimestamp: true },
    });

    const ownerPhoneNumber = resolveOwnerPhoneNumber(instance as AuditInstanceRef);
    const [ownerMapping, counterpartMapping] = await Promise.all([
      ownerPhoneNumber
        ? this.prismaRepository.contactRoleMapping.findUnique({ where: { phoneNumber: ownerPhoneNumber } })
        : Promise.resolve(null),
      this.prismaRepository.contactRoleMapping.findUnique({ where: { phoneNumber: ref.counterpartNumber } }),
    ]);

    const ownerLabel = this.displayLabel(ownerPhoneNumber || instance.name, ownerMapping);
    const counterpartLabel = this.displayLabel(ref.counterpartNumber, counterpartMapping);

    const conversationMessages: AuditOccurrenceContextMessage[] = [];

    for (const msg of messages) {
      const key = msg.key as { remoteJid?: string; fromMe?: boolean } | null;
      const remoteJid = key?.remoteJid;
      if (!remoteJid || remoteJid.split('@')[0] !== ref.counterpartNumber) continue;

      const content = formatMessageContent(getConversationMessage(msg));
      if (!content) continue;

      conversationMessages.push({
        timestamp: new Date((msg.messageTimestamp as number) * 1000).toISOString(),
        fromMe: Boolean(key?.fromMe),
        speaker: key?.fromMe ? ownerLabel : counterpartLabel,
        content,
      });
    }

    return {
      instanceName: instance.name,
      ownerLabel,
      counterpartLabel,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      messages: conversationMessages,
    };
  }

  private displayLabel(phoneNumber: string, mapping?: { name: string | null; role: string } | null): string {
    if (mapping?.name) return `${mapping.name} (${mapping.role})`;
    if (mapping?.role) return `${mapping.role} — ${phoneNumber}`;

    return phoneNumber;
  }
}
