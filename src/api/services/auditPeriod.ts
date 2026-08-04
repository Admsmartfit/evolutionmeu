import { BadRequestException } from '@exceptions';
import { AUDIT_PERIODICITIES } from '@validate/auditConfig.schema';

export type AuditExecutionPeriod = {
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Computes the [periodStart, periodEnd] window a scheduled or on-demand execution
 * should analyze (RF02.1): a rolling window ending "now" for WEEKLY/MONTHLY/YEARLY,
 * or the fixed dates stored on the config for CUSTOM.
 */
export function computeExecutionPeriod(config: {
  periodicity: string;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
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

  switch (config.periodicity) {
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
