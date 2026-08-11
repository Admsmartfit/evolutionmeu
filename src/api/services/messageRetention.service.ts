import { deleteFile, downloadFile, uploadFile } from '@api/integrations/storage/s3/libs/minio.server';
import { PrismaRepository } from '@api/repository/repository.service';
import { ConfigService, Retention } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';
import { randomUUID } from 'crypto';

const ARCHIVE_BATCH_SIZE = 1000;
const BACKUP_FILES_PER_RUN = 50;

// Baileys message-type keys treated as heavy media, purged from backups once old enough.
// Documents (documentMessage/documentWithCaptionMessage) are deliberately excluded — kept forever.
const PURGEABLE_MEDIA_TYPES = new Set(['audioMessage', 'imageMessage', 'videoMessage', 'stickerMessage', 'ptvMessage']);

type ArchivedMessage = {
  id: string;
  key: unknown;
  pushName: string | null;
  participant: string | null;
  messageType: string;
  message: unknown;
  contextInfo: unknown;
  source: string;
  messageTimestamp: number;
  webhookUrl: string | null;
  status: string | null;
  MessageUpdate: unknown[];
  Media: { fileName: string; type: string; mimetype: string; createdAt: Date | null } | null;
};

/**
 * RF: data-retention policy. Two independent daily jobs:
 *  - archiveOldMessages: exports messages older than RETENTION.ARCHIVE_AFTER_DAYS to a JSON
 *    file in MinIO (one per batch/instance), then deletes those rows from Postgres. Upload +
 *    MessageBackupFile row are always created BEFORE the delete, so a crash mid-run can only
 *    ever produce a harmless duplicate backup, never data loss.
 *  - purgeArchivedMedia: for backups already older than RETENTION.MEDIA_PURGE_AFTER_DAYS, deletes
 *    the referenced audio/video/image/sticker/ptv objects from MinIO and rewrites the backup
 *    JSON without those references. Documents are never touched.
 * Final expiry of backup files themselves (RETENTION.BACKUP_EXPIRE_AFTER_DAYS) is NOT handled
 * here — it's a MinIO bucket lifecycle rule the operator configures once, targeting the
 * physical prefix `evolution-api/message-backups/` (uploadFile always prepends `evolution-api/`).
 */
export class MessageRetentionService {
  constructor(
    private readonly prismaRepository: PrismaRepository,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger('MessageRetentionService');

  public async archiveOldMessages(): Promise<void> {
    const { ARCHIVE_AFTER_DAYS } = this.configService.get<Retention>('RETENTION');
    const cutoff = Math.floor((Date.now() - ARCHIVE_AFTER_DAYS * 86_400_000) / 1000);

    const instances = await this.prismaRepository.instance.findMany({ select: { id: true } });

    for (const { id: instanceId } of instances) {
      let archivedInInstance = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = (await this.prismaRepository.message.findMany({
          where: { instanceId, messageTimestamp: { lt: cutoff } },
          orderBy: { messageTimestamp: 'asc' },
          take: ARCHIVE_BATCH_SIZE,
          select: {
            id: true,
            key: true,
            pushName: true,
            participant: true,
            messageType: true,
            message: true,
            contextInfo: true,
            source: true,
            messageTimestamp: true,
            webhookUrl: true,
            status: true,
            MessageUpdate: {
              select: {
                keyId: true,
                remoteJid: true,
                fromMe: true,
                participant: true,
                pollUpdates: true,
                status: true,
              },
            },
            Media: { select: { fileName: true, type: true, mimetype: true, createdAt: true } },
          },
        })) as ArchivedMessage[];

        if (batch.length === 0) break;

        await this.writeBackupFile(instanceId, batch);
        await this.prismaRepository.message.deleteMany({ where: { id: { in: batch.map((m) => m.id) } } });

        archivedInInstance += batch.length;
      }

      if (archivedInInstance > 0) {
        this.logger.info(`Archived ${archivedInInstance} message(s) for instance ${instanceId}`);
      }
    }
  }

  public async purgeArchivedMedia(): Promise<void> {
    const { MEDIA_PURGE_AFTER_DAYS } = this.configService.get<Retention>('RETENTION');
    const cutoff = new Date(Date.now() - MEDIA_PURGE_AFTER_DAYS * 86_400_000);

    const backups = await this.prismaRepository.messageBackupFile.findMany({
      where: { periodEnd: { lt: cutoff }, mediaPurgedAt: null },
      take: BACKUP_FILES_PER_RUN,
    });

    for (const backup of backups) {
      try {
        const raw = await downloadFile(backup.s3Key);
        const payload = JSON.parse(raw.toString('utf8'));
        let changed = false;

        for (const entry of payload.messages || []) {
          if (entry.media?.fileName && PURGEABLE_MEDIA_TYPES.has(entry.media.type)) {
            try {
              // 'evolution-api' folder is required here to match uploadFile's own key prefix —
              // deleteFile does NOT add it automatically, unlike uploadFile/getObjectUrl.
              await deleteFile('evolution-api', entry.media.fileName);
            } catch (error) {
              this.logger.warn(`Could not delete media object ${entry.media.fileName}: ${getErrorMessage(error)}`);
            }
            delete entry.media.fileName;
            entry.media.purged = true;
            changed = true;
          }
        }

        if (changed) {
          const buffer = Buffer.from(JSON.stringify(payload));
          await uploadFile(backup.s3Key, buffer, buffer.length, { 'Content-Type': 'application/json' });
        }

        await this.prismaRepository.messageBackupFile.update({
          where: { id: backup.id },
          data: { mediaPurgedAt: new Date() },
        });
      } catch (error) {
        this.logger.error(`Failed to purge media for backup ${backup.id} (${backup.s3Key}): ${getErrorMessage(error)}`);
      }
    }
  }

  private async writeBackupFile(instanceId: string, batch: ArchivedMessage[]): Promise<void> {
    const periodStart = new Date(batch[0].messageTimestamp * 1000);
    const periodEnd = new Date(batch[batch.length - 1].messageTimestamp * 1000);

    const payload = {
      formatVersion: 1,
      instanceId,
      generatedAt: new Date().toISOString(),
      messageCount: batch.length,
      messages: batch.map((m) => ({
        id: m.id,
        key: m.key,
        pushName: m.pushName,
        participant: m.participant,
        messageType: m.messageType,
        message: m.message,
        contextInfo: m.contextInfo,
        source: m.source,
        messageTimestamp: m.messageTimestamp,
        webhookUrl: m.webhookUrl,
        status: m.status,
        statusHistory: m.MessageUpdate,
        media: m.Media ? { fileName: m.Media.fileName, type: m.Media.type, mimetype: m.Media.mimetype } : null,
      })),
    };

    const buffer = Buffer.from(JSON.stringify(payload));
    const s3Key = `message-backups/${instanceId}/${periodStart.getUTCFullYear()}/${String(
      periodStart.getUTCMonth() + 1,
    ).padStart(2, '0')}/${randomUUID()}.json`;

    await uploadFile(s3Key, buffer, buffer.length, { 'Content-Type': 'application/json' });

    await this.prismaRepository.messageBackupFile.create({
      data: { instanceId, s3Key, periodStart, periodEnd, messageCount: batch.length },
    });
  }
}
