import { PrismaRepository } from '@api/repository/repository.service';
import { getConversationMessage } from '@utils/getConversationMessage';
import { normalizePhoneNumber } from '@utils/phoneNumber';

import { anonymizePiiFromText } from './auditAnonymization.service';
import { chunkConversationText } from './auditChunking';
import { AuditParticipantAnonymizer } from './auditParticipantAnonymizer.service';

const DEFAULT_ROLE = 'OUTRO';

const MEDIA_TYPE_LABELS: Record<string, string> = {
  audioMessage: 'áudio',
  imageMessage: 'imagem',
  videoMessage: 'vídeo',
  documentMessage: 'documento',
  documentWithCaptionMessage: 'documento',
};

/**
 * `getConversationMessage` returns either plain text or, for media, a
 * "type|mediaId|caption" marker. Media IDs/URLs carry no analytical value and
 * shouldn't be sent to the AI provider, so this keeps only a friendly label + caption.
 * For message types it doesn't recognize (stickers, reactions, etc.) it returns the
 * literal string "unknown" instead of undefined — that sentinel must be filtered too.
 */
function formatMessageContent(rawContent: unknown): string | null {
  if (typeof rawContent !== 'string' || rawContent.trim().length === 0 || rawContent === 'unknown') return null;

  const [maybeType, , caption] = rawContent.split('|');
  const mediaLabel = MEDIA_TYPE_LABELS[maybeType];

  if (mediaLabel) {
    return caption ? `[mídia: ${mediaLabel}] ${caption}` : `[mídia: ${mediaLabel}]`;
  }

  return rawContent;
}

export type AuditInstanceRef = {
  id: string;
  name: string;
  number?: string;
  ownerJid?: string;
};

export type AuditConversationChunk = {
  instanceId: string;
  instanceName: string;
  counterpartRole: string;
  text: string;
};

export class AuditMessageCollectorService {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  public async collect(params: {
    instances: AuditInstanceRef[];
    periodStart: Date;
    periodEnd: Date;
    excludedJids?: string[];
  }): Promise<AuditConversationChunk[]> {
    const chunks: AuditConversationChunk[] = [];
    const excludedNumbers = new Set((params.excludedJids || []).map((jid) => jid.split('@')[0]));

    for (const instance of params.instances) {
      const ownerPhoneNumber = this.resolveOwnerPhoneNumber(instance);
      const ownerRole = ownerPhoneNumber ? await this.resolveRole(ownerPhoneNumber) : DEFAULT_ROLE;

      const messages = await this.prismaRepository.message.findMany({
        where: {
          instanceId: instance.id,
          messageTimestamp: {
            gte: Math.floor(params.periodStart.getTime() / 1000),
            lte: Math.floor(params.periodEnd.getTime() / 1000),
          },
        },
        orderBy: { messageTimestamp: 'asc' },
        select: { key: true, message: true, contextInfo: true, messageTimestamp: true },
      });

      const byCounterpart = new Map<string, typeof messages>();

      for (const msg of messages) {
        const key = msg.key as { remoteJid?: string; fromMe?: boolean } | null;
        const remoteJid = key?.remoteJid;

        // Scope: 1:1 chats only. Group audits need separate multi-party attribution logic.
        if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

        const counterpartNumber = remoteJid.split('@')[0];
        if (excludedNumbers.has(counterpartNumber)) continue;

        if (!byCounterpart.has(counterpartNumber)) byCounterpart.set(counterpartNumber, []);
        byCounterpart.get(counterpartNumber)!.push(msg);
      }

      for (const [counterpartNumber, counterpartMessages] of byCounterpart) {
        const counterpartRole = await this.resolveRole(counterpartNumber);

        const anonymizer = new AuditParticipantAnonymizer();
        const ownerLabel = anonymizer.getPlaceholder(ownerPhoneNumber || `instance-${instance.id}`, ownerRole);
        const counterpartLabel = anonymizer.getPlaceholder(counterpartNumber, counterpartRole);

        const header = `Conversa entre ${ownerLabel} e ${counterpartLabel} (instância: ${instance.name})`;
        const lines: string[] = [];

        for (const msg of counterpartMessages) {
          const content = formatMessageContent(getConversationMessage(msg));
          if (!content) continue;

          const key = msg.key as { fromMe?: boolean } | null;
          const speaker = key?.fromMe ? ownerLabel : counterpartLabel;

          lines.push(`${speaker}: ${anonymizePiiFromText(content)}`);
        }

        if (lines.length === 0) continue;

        for (const chunkText of chunkConversationText(header, lines)) {
          chunks.push({ instanceId: instance.id, instanceName: instance.name, counterpartRole, text: chunkText });
        }
      }
    }

    return chunks;
  }

  private resolveOwnerPhoneNumber(instance: AuditInstanceRef): string | undefined {
    const raw = instance.number || instance.ownerJid?.split('@')[0];
    if (!raw) return undefined;

    try {
      return normalizePhoneNumber(raw);
    } catch {
      return raw.replace(/\D/g, '');
    }
  }

  private async resolveRole(phoneNumber: string): Promise<string> {
    const mapping = await this.prismaRepository.contactRoleMapping.findUnique({ where: { phoneNumber } });

    return mapping?.role || DEFAULT_ROLE;
  }
}
