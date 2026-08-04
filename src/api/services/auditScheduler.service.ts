import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';
import cron, { ScheduledTask } from 'node-cron';

import { computeExecutionPeriod } from './auditPeriod';
import { enqueueAuditExecution } from './auditQueue.service';

type SchedulableAuditConfig = {
  id: string;
  enabled: boolean;
  cronExpression: string;
  periodicity: string;
  customStartDate: Date | null;
  customEndDate: Date | null;
};

/**
 * Owns the RF02.2 cron schedules: one node-cron task per enabled AuditConfig, each
 * firing an enqueue onto the BullMQ audit-execution queue (not a direct run — the
 * queue/worker from the earlier stage stays the single execution path). Mirrors the
 * `cron.schedule` + task-registry pattern already used for the Chatwoot lost-message
 * sync in whatsapp.baileys.service.ts, but keyed per AuditConfig instead of a single task.
 */
export class AuditSchedulerService {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  private readonly logger = new Logger('AuditSchedulerService');
  private readonly tasks = new Map<string, ScheduledTask>();

  public async start(): Promise<void> {
    const configs = await this.prismaRepository.auditConfig.findMany({ where: { enabled: true } });

    for (const config of configs) {
      this.scheduleConfig(config);
    }

    this.logger.info(`Audit scheduler started with ${this.tasks.size} active schedule(s)`);
  }

  /** Re-reads one AuditConfig from the DB and reschedules (or unschedules) it accordingly. */
  public async resync(auditConfigId: string): Promise<void> {
    this.unschedule(auditConfigId);

    const config = await this.prismaRepository.auditConfig.findUnique({ where: { id: auditConfigId } });

    if (config?.enabled) {
      this.scheduleConfig(config);
    }
  }

  private scheduleConfig(config: SchedulableAuditConfig): void {
    if (!cron.validate(config.cronExpression)) {
      this.logger.warn(`AuditConfig ${config.id} has an invalid cron expression "${config.cronExpression}", skipping.`);
      return;
    }

    const task = cron.schedule(config.cronExpression, () => {
      this.runScheduled(config.id).catch((error) => {
        this.logger.error(`Scheduled audit execution failed for AuditConfig ${config.id}: ${getErrorMessage(error)}`);
      });
    });

    this.tasks.set(config.id, task);
  }

  private unschedule(auditConfigId: string): void {
    const task = this.tasks.get(auditConfigId);

    if (task) {
      task.stop();
      this.tasks.delete(auditConfigId);
    }
  }

  private async runScheduled(auditConfigId: string): Promise<void> {
    const config = await this.prismaRepository.auditConfig.findUnique({ where: { id: auditConfigId } });

    if (!config || !config.enabled) return;

    const { periodStart, periodEnd } = computeExecutionPeriod(config);

    await enqueueAuditExecution({
      auditConfigId: config.id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  }
}
