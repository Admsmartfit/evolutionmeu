import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';

import { MessageRetentionSchedulerService } from '../services/messageRetentionScheduler.service';

export class MessageRetentionController {
  constructor(private readonly retentionScheduler: MessageRetentionSchedulerService) {}

  private readonly logger = new Logger('MessageRetentionController');

  /**
   * Fire-and-forget: a full run can take a long time on a large table, so this doesn't
   * await completion — it triggers the same runOnce() the cron uses (sharing its lock)
   * and returns immediately. Progress is only observable via logs / MessageBackupFile rows.
   */
  public async runNow() {
    this.retentionScheduler.runOnce().catch((error) => {
      this.logger.error(`Manual retention run failed: ${getErrorMessage(error)}`);
    });

    return { status: 'triggered' };
  }
}
