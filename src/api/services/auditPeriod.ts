import { configService, Retention } from '@config/env.config';
import { BadRequestException } from '@exceptions';
import { AUDIT_PERIODICITIES } from '@validate/auditConfig.schema';

export type AuditExecutionPeriod = {
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Computes the [periodStart, periodEnd] window a scheduled or on-demand execution
 * should analyze (RF02.1): a rolling window ending "now" for DAILY/WEEKLY/MONTHLY/YEARLY,
 * or the fixed dates stored on the config for CUSTOM. `lookbackDays`, when set,
 * overrides the periodicity's default window size — e.g. a WEEKLY schedule that only
 * looks back 5 days, so a late-firing cron never re-includes messages from the
 * previous run.
 *
 * Every branch funnels through a final clamp: `periodStart` may never precede
 * `periodEnd - RETENTION.CHAT_VISIBLE_DAYS`, since messages older than that are no longer
 * guaranteed to exist in the live table (see MessageRetentionService) — including CUSTOM,
 * which previously returned early and bypassed this. Reuses RETENTION.CHAT_VISIBLE_DAYS
 * (rather than a separate audit-specific setting) so the two windows can never drift apart.
 */
export function computeExecutionPeriod(config: {
  periodicity: string;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
  lookbackDays?: number | null;
}): AuditExecutionPeriod {
  let periodStart: Date;
  let periodEnd: Date;

  if (config.periodicity === 'CUSTOM') {
    if (!config.customStartDate || !config.customEndDate) {
      throw new BadRequestException(
        'AuditConfig periodicity is "CUSTOM" but customStartDate/customEndDate are not set.',
      );
    }

    periodStart = config.customStartDate;
    periodEnd = config.customEndDate;
  } else {
    periodEnd = new Date();
    periodStart = new Date(periodEnd);

    if (config.lookbackDays && config.lookbackDays > 0) {
      periodStart.setDate(periodStart.getDate() - config.lookbackDays);
    } else {
      switch (config.periodicity) {
        case 'DAILY':
          periodStart.setDate(periodStart.getDate() - 1);
          break;
        case 'WEEKLY':
          periodStart.setDate(periodStart.getDate() - 7);
          break;
        case 'MONTHLY':
          periodStart.setMonth(periodStart.getMonth() - 1);
          break;
        case 'YEARLY':
          periodStart.setFullYear(periodStart.getFullYear() - 1);
          break;
        default:
          throw new BadRequestException(
            `Unknown periodicity: "${config.periodicity}". Expected one of: ${AUDIT_PERIODICITIES.join(', ')}`,
          );
      }
    }
  }

  const maxLookbackDays = configService.get<Retention>('RETENTION').CHAT_VISIBLE_DAYS;
  const minAllowedStart = new Date(periodEnd);
  minAllowedStart.setDate(minAllowedStart.getDate() - maxLookbackDays);

  if (periodStart < minAllowedStart) {
    periodStart = minAllowedStart;
  }

  return { periodStart, periodEnd };
}
