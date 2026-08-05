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
 * previous run. It has no effect on CUSTOM (which already uses explicit dates).
 */
export function computeExecutionPeriod(config: {
  periodicity: string;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
  lookbackDays?: number | null;
}): AuditExecutionPeriod {
  if (config.periodicity === 'CUSTOM') {
    if (!config.customStartDate || !config.customEndDate) {
      throw new BadRequestException(
        'AuditConfig periodicity is "CUSTOM" but customStartDate/customEndDate are not set.',
      );
    }

    return { periodStart: config.customStartDate, periodEnd: config.customEndDate };
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);

  if (config.lookbackDays && config.lookbackDays > 0) {
    periodStart.setDate(periodStart.getDate() - config.lookbackDays);
    return { periodStart, periodEnd };
  }

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

  return { periodStart, periodEnd };
}
