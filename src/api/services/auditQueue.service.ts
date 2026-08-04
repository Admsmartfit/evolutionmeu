import { Logger } from '@config/logger.config';
import { Job, Queue, Worker } from 'bullmq';

import { AuditExecutionService } from './auditExecution.service';
import { getAuditQueueConnection } from './auditQueueConnection';

export const AUDIT_EXECUTION_QUEUE_NAME = 'audit-execution';

export type AuditExecutionJobData = {
  auditConfigId: string;
  periodStart: string;
  periodEnd: string;
};

let queue: Queue<AuditExecutionJobData> | null = null;

export function getAuditExecutionQueue(): Queue<AuditExecutionJobData> {
  if (!queue) {
    queue = new Queue<AuditExecutionJobData>(AUDIT_EXECUTION_QUEUE_NAME, { connection: getAuditQueueConnection() });
  }

  return queue;
}

export async function enqueueAuditExecution(data: AuditExecutionJobData) {
  return getAuditExecutionQueue().add('run', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  });
}

/**
 * A single execution can call the AI provider many times sequentially (once per
 * conversation chunk), so the lock is held generously long to avoid the job being
 * considered stalled and picked up again mid-run.
 */
const JOB_LOCK_DURATION_MS = 30 * 60 * 1000;

export function startAuditExecutionWorker(auditExecutionService: AuditExecutionService): Worker<AuditExecutionJobData> {
  const logger = new Logger('AuditExecutionWorker');

  const worker = new Worker<AuditExecutionJobData>(
    AUDIT_EXECUTION_QUEUE_NAME,
    async (job: Job<AuditExecutionJobData>) =>
      auditExecutionService.run({
        auditConfigId: job.data.auditConfigId,
        periodStart: new Date(job.data.periodStart),
        periodEnd: new Date(job.data.periodEnd),
      }),
    {
      connection: getAuditQueueConnection(),
      concurrency: 1,
      lockDuration: JOB_LOCK_DURATION_MS,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Audit execution job ${job?.id} failed: ${err.message}`);
  });

  worker.on('completed', (job) => {
    logger.info(`Audit execution job ${job.id} completed -> report ${job.returnvalue}`);
  });

  return worker;
}
