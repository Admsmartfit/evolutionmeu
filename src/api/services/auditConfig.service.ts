import { AuditConfigDto, AuditConfigFindDto, AuditConfigUpdateDto } from '@api/dto/auditConfig.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { Audit, configService } from '@config/env.config';
import { BadRequestException, NotFoundException } from '@exceptions';
import { decrypt, encrypt } from '@utils/crypto';
import { AUDIT_AI_PROVIDERS, AUDIT_PERIODICITIES } from '@validate/auditConfig.schema';
import cron from 'node-cron';

import { computeExecutionPeriod } from './auditPeriod';
import { enqueueAuditExecution } from './auditQueue.service';
import { AuditSchedulerService } from './auditScheduler.service';

function maskAuditConfig<T extends { apiKeyEncrypted?: string | null }>(config: T) {
  if (!config) return config;

  const { apiKeyEncrypted, ...rest } = config;

  return { ...rest, apiKeyConfigured: Boolean(apiKeyEncrypted) };
}

export class AuditConfigService {
  constructor(
    private readonly prismaRepository: PrismaRepository,
    private readonly auditScheduler?: AuditSchedulerService,
  ) {}

  private getEncryptionKey(): string {
    const key = configService.get<Audit>('AUDIT').ENCRYPTION_KEY;

    if (!key) {
      throw new BadRequestException(
        'AUDIT_ENCRYPTION_KEY is not configured on the server. Set it before creating an AuditConfig with an apiKey.',
      );
    }

    return key;
  }

  private validatePeriodicity(data: { periodicity?: string; customStartDate?: string; customEndDate?: string }) {
    if (!data.periodicity) return;

    if (!AUDIT_PERIODICITIES.includes(data.periodicity)) {
      throw new BadRequestException(
        `Invalid periodicity: "${data.periodicity}". Expected one of: ${AUDIT_PERIODICITIES.join(', ')}`,
      );
    }

    if (data.periodicity === 'CUSTOM' && (!data.customStartDate || !data.customEndDate)) {
      throw new BadRequestException('customStartDate and customEndDate are required when periodicity is "CUSTOM"');
    }
  }

  private validateCronExpression(cronExpression?: string) {
    if (!cronExpression) return;

    if (!cron.validate(cronExpression)) {
      throw new BadRequestException(`Invalid cron expression: "${cronExpression}"`);
    }
  }

  private validateAiProvider(aiProvider?: string) {
    if (!aiProvider) return;

    if (!AUDIT_AI_PROVIDERS.includes(aiProvider)) {
      throw new BadRequestException(
        `Invalid aiProvider: "${aiProvider}". Expected one of: ${AUDIT_AI_PROVIDERS.join(', ')}`,
      );
    }
  }

  private async validateSelectedInstances(selectedInstances?: string[]) {
    if (!selectedInstances || selectedInstances.length === 0) return;
    if (selectedInstances.length === 1 && selectedInstances[0] === 'ALL') return;

    const found = await this.prismaRepository.instance.findMany({
      where: { name: { in: selectedInstances } },
      select: { name: true },
    });

    const foundNames = new Set(found.map((instance) => instance.name));
    const missing = selectedInstances.filter((name) => name !== 'ALL' && !foundNames.has(name));

    if (missing.length > 0) {
      throw new BadRequestException(`Unknown instance name(s): ${missing.join(', ')}`);
    }
  }

  public async create(data: AuditConfigDto) {
    this.validatePeriodicity(data);
    this.validateCronExpression(data.cronExpression);
    this.validateAiProvider(data.aiProvider);
    await this.validateSelectedInstances(data.selectedInstances);

    const apiKeyEncrypted = data.apiKey ? encrypt(data.apiKey, this.getEncryptionKey()) : undefined;

    const config = await this.prismaRepository.auditConfig.create({
      data: {
        name: data.name,
        enabled: data.enabled ?? true,
        periodicity: data.periodicity,
        customStartDate: data.customStartDate ? new Date(data.customStartDate) : undefined,
        customEndDate: data.customEndDate ? new Date(data.customEndDate) : undefined,
        cronExpression: data.cronExpression,
        lookbackDays: data.lookbackDays,
        selectedInstances: data.selectedInstances,
        excludedJids: data.excludedJids,
        aiProvider: data.aiProvider,
        aiModel: data.aiModel,
        apiKeyEncrypted,
        temperature: data.temperature,
        topP: data.topP,
        maxTokens: data.maxTokens,
      },
    });

    await this.auditScheduler?.resync(config.id);

    return maskAuditConfig(config);
  }

  public async update(auditConfigId: string, data: AuditConfigUpdateDto) {
    const existing = await this.findByIdOrThrow(auditConfigId);

    this.validatePeriodicity({
      periodicity: data.periodicity ?? existing.periodicity,
      customStartDate: data.customStartDate ?? existing.customStartDate?.toISOString(),
      customEndDate: data.customEndDate ?? existing.customEndDate?.toISOString(),
    });
    this.validateCronExpression(data.cronExpression);
    this.validateAiProvider(data.aiProvider);
    await this.validateSelectedInstances(data.selectedInstances);

    const apiKeyEncrypted = data.apiKey ? encrypt(data.apiKey, this.getEncryptionKey()) : undefined;

    const config = await this.prismaRepository.auditConfig.update({
      where: { id: auditConfigId },
      data: {
        name: data.name,
        enabled: data.enabled,
        periodicity: data.periodicity,
        customStartDate: data.customStartDate ? new Date(data.customStartDate) : undefined,
        customEndDate: data.customEndDate ? new Date(data.customEndDate) : undefined,
        cronExpression: data.cronExpression,
        lookbackDays: data.lookbackDays,
        selectedInstances: data.selectedInstances,
        excludedJids: data.excludedJids,
        aiProvider: data.aiProvider,
        aiModel: data.aiModel,
        ...(apiKeyEncrypted ? { apiKeyEncrypted } : {}),
        temperature: data.temperature,
        topP: data.topP,
        maxTokens: data.maxTokens,
      },
    });

    await this.auditScheduler?.resync(config.id);

    return maskAuditConfig(config);
  }

  public async delete(auditConfigId: string) {
    await this.findByIdOrThrow(auditConfigId);

    await this.prismaRepository.auditConfig.delete({ where: { id: auditConfigId } });

    await this.auditScheduler?.resync(auditConfigId);

    return { auditConfigId, deleted: true };
  }

  public async find(query: AuditConfigFindDto) {
    const configs = await this.prismaRepository.auditConfig.findMany({
      where: {
        enabled: query?.enabled !== undefined ? query.enabled === 'true' : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });

    return configs.map(maskAuditConfig);
  }

  private async findByIdOrThrow(auditConfigId: string) {
    const config = await this.prismaRepository.auditConfig.findUnique({ where: { id: auditConfigId } });

    if (!config) {
      throw new NotFoundException(`AuditConfig not found: "${auditConfigId}"`);
    }

    return config;
  }

  /**
   * Enqueues an on-demand execution ("rodar agora") for a config, bypassing its cron
   * schedule. If periodStart/periodEnd aren't given, they're computed the same way a
   * scheduled firing would (RF02.1 rolling window, or the config's CUSTOM dates).
   */
  public async runNow(auditConfigId: string, overrides?: { periodStart?: string; periodEnd?: string }) {
    const config = await this.findByIdOrThrow(auditConfigId);

    const computed = overrides?.periodStart && overrides?.periodEnd ? null : computeExecutionPeriod(config);
    const periodStart = overrides?.periodStart ? new Date(overrides.periodStart) : computed!.periodStart;
    const periodEnd = overrides?.periodEnd ? new Date(overrides.periodEnd) : computed!.periodEnd;

    const job = await enqueueAuditExecution({
      auditConfigId: config.id,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    return { jobId: job.id, auditConfigId: config.id, periodStart, periodEnd };
  }

  /**
   * Returns the decrypted API key for internal use by the AI provider pipeline.
   * Never expose this value through an HTTP response.
   */
  public async getDecryptedApiKey(auditConfigId: string): Promise<string | null> {
    const config = await this.findByIdOrThrow(auditConfigId);

    if (!config.apiKeyEncrypted) return null;

    return decrypt(config.apiKeyEncrypted, this.getEncryptionKey());
  }
}
