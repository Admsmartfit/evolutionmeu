import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';
import cron, { ScheduledTask } from 'node-cron';

import { MessageRetentionService } from './messageRetention.service';

/**
 * Single global cron for the data-retention policy (not per-instance/per-config like
 * AuditSchedulerService — there's exactly one policy here). `runOnce` is shared by both the
 * cron trigger and the manual "run now" endpoint, and its `running` flag prevents the two
 * from ever overlapping within this process. Note: this in-memory lock only protects a single
 * process — if the API ever runs multiple replicas, only one replica should enable this cron.
 */
export class MessageRetentionSchedulerService {
  constructor(
    private readonly retentionService: MessageRetentionService,
    private readonly cronExpression: string,
  ) {}

  private readonly logger = new Logger('MessageRetentionSchedulerService');
  private task: ScheduledTask | null = null;
  private running = false;

  public start(): void {
    if (!cron.validate(this.cronExpression)) {
      this.logger.warn(`Invalid RETENTION_CRON expression "${this.cronExpression}", retention jobs will not run.`);
      return;
    }

    this.task = cron.schedule(this.cronExpression, () => {
      this.runOnce().catch((error) => this.logger.error(`Retention run failed: ${getErrorMessage(error)}`));
    });

    this.logger.info(`Message retention scheduler started (cron: "${this.cronExpression}")`);
  }

  public async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn('Retention run already in progress, skipping this trigger.');
      return;
    }

    this.running = true;

    try {
      await this.retentionService.archiveOldMessages();
      await this.retentionService.purgeArchivedMedia();
    } finally {
      this.running = false;
    }
  }
}
