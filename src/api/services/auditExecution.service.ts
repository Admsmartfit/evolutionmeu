import { PrismaRepository } from '@api/repository/repository.service';
import { Audit, configService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';
import { getErrorMessage } from '@utils/getErrorMessage';

import { AuditAiProviderFactory } from './auditAiProviderFactory.service';
import { AuditConfigService } from './auditConfig.service';
import { AuditInstanceRef, AuditMessageCollectorService } from './auditMessageCollector.service';
import { AUDIT_SYSTEM_PROMPT, buildAuditUserPrompt } from './auditPrompt';
import { aggregateAuditResults } from './auditReportAggregator';
import { AuditReportDeliveryService } from './auditReportDelivery.service';
import { AuditReportPdfService } from './auditReportPdf.service';
import { AuditReportStorageService } from './auditReportStorage.service';
import { AuditAiResult, BaseAuditAiProviderService } from './baseAuditAiProvider.service';
import { WAMonitoringService } from './monitor.service';

export type AuditExecutionParams = {
  auditConfigId: string;
  periodStart: Date;
  periodEnd: Date;
};

export class AuditExecutionService {
  constructor(
    private readonly prismaRepository: PrismaRepository,
    private readonly auditConfigService: AuditConfigService,
    private readonly messageCollector: AuditMessageCollectorService,
    private readonly waMonitor: WAMonitoringService,
    private readonly createAiProvider: (
      aiProvider: string,
    ) => BaseAuditAiProviderService = AuditAiProviderFactory.create,
    private readonly pdfService: AuditReportPdfService = new AuditReportPdfService(),
    private readonly storageService: AuditReportStorageService = new AuditReportStorageService(),
    private readonly deliveryService: AuditReportDeliveryService = new AuditReportDeliveryService(
      prismaRepository,
      waMonitor,
    ),
  ) {}

  private readonly logger = new Logger('AuditExecutionService');

  public async run(params: AuditExecutionParams): Promise<string> {
    const config = await this.prismaRepository.auditConfig.findUnique({ where: { id: params.auditConfigId } });

    if (!config) {
      throw new NotFoundException(`AuditConfig not found: "${params.auditConfigId}"`);
    }

    const instances = await this.resolveInstances((config.selectedInstances as string[] | null) || []);

    const report = await this.prismaRepository.auditReport.create({
      data: {
        auditConfigId: config.id,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        instancesAudited: instances.map((instance) => instance.name),
        status: 'PROCESSING',
      },
    });

    try {
      const results: AuditAiResult[] = [];

      if (instances.length > 0) {
        const apiKey = await this.resolveApiKey(config);
        const provider = this.createAiProvider(config.aiProvider);

        const chunks = await this.messageCollector.collect({
          instances,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          excludedJids: (config.excludedJids as string[] | null) || undefined,
        });

        for (const chunk of chunks) {
          const result = await provider.generateAuditAnalysis({
            systemPrompt: AUDIT_SYSTEM_PROMPT,
            userContent: buildAuditUserPrompt({
              periodStart: params.periodStart.toISOString(),
              periodEnd: params.periodEnd.toISOString(),
              conversationText: chunk.text,
            }),
            apiKey,
            model: config.aiModel,
            temperature: config.temperature ?? undefined,
            topP: config.topP ?? undefined,
            maxTokens: config.maxTokens ?? undefined,
          });

          results.push(result);
        }
      }

      const aggregated = aggregateAuditResults(results);

      const pdfBuffer = await this.pdfService.generate({
        id: report.id,
        executionDate: report.executionDate,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        instancesAudited: instances.map((instance) => instance.name),
        overallRiskLevel: aggregated.overall_risk_level,
        riskMatrix: aggregated.risk_matrix,
        executiveSummary: aggregated.executive_summary,
        occurrencesDetails: aggregated.occurrences,
      });
      const pdfStorageUrl = await this.storageService.uploadReportPdf(report.id, pdfBuffer);

      await this.deliverReport({
        reportId: report.id,
        senderInstanceName: instances[0]?.name ?? null,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        instancesAudited: instances.map((instance) => instance.name),
        overallRiskLevel: aggregated.overall_risk_level,
        riskMatrix: aggregated.risk_matrix,
        executiveSummary: aggregated.executive_summary,
        occurrencesDetails: aggregated.occurrences,
        pdfBuffer,
      });

      await this.prismaRepository.auditReport.update({
        where: { id: report.id },
        data: {
          executiveSummary: aggregated.executive_summary,
          occurrencesDetails: aggregated.occurrences,
          overallRiskLevel: aggregated.overall_risk_level,
          riskMatrix: aggregated.risk_matrix,
          pdfStorageUrl,
          status: 'COMPLETED',
        },
      });

      return report.id;
    } catch (error) {
      const reason = getErrorMessage(error);
      this.logger.error(`Audit execution ${report.id} failed: ${reason}`);

      await this.prismaRepository.auditReport.update({
        where: { id: report.id },
        data: { status: 'FAILED', errorMessage: reason },
      });

      throw error;
    }
  }

  /**
   * WhatsApp delivery is best-effort: a bad recipient number or a disconnected
   * instance must never retroactively fail a report whose data collection and AI
   * analysis already completed successfully (which would trigger a costly BullMQ
   * retry of the whole execution just to redo an unrelated notification step).
   */
  private async deliverReport(params: Parameters<AuditReportDeliveryService['deliver']>[0]): Promise<void> {
    try {
      const result = await this.deliveryService.deliver(params);
      this.logger.info(
        `Audit report ${params.reportId} delivery: sent=${result.sent.length} skipped=${result.skipped.length} failed=${result.failed.length}`,
      );
    } catch (error) {
      this.logger.error(`Audit report ${params.reportId}: WhatsApp delivery step failed: ${getErrorMessage(error)}`);
    }
  }

  private async resolveInstances(selectedInstances: string[]): Promise<AuditInstanceRef[]> {
    const isAll = selectedInstances.length === 0 || (selectedInstances.length === 1 && selectedInstances[0] === 'ALL');

    return this.prismaRepository.instance.findMany({
      where: isAll ? {} : { name: { in: selectedInstances } },
      select: { id: true, name: true, number: true, ownerJid: true },
    });
  }

  private async resolveApiKey(config: {
    id: string;
    aiProvider: string;
    apiKeyEncrypted: string | null;
  }): Promise<string> {
    if (config.apiKeyEncrypted) {
      const decrypted = await this.auditConfigService.getDecryptedApiKey(config.id);
      if (decrypted) return decrypted;
    }

    const globalProviders = configService.get<Audit>('AUDIT').AI_PROVIDERS;
    const globalKey =
      config.aiProvider === 'GEMINI' ? globalProviders.GEMINI_API_KEY_GLOBAL : globalProviders.CLAUDE_API_KEY_GLOBAL;

    if (!globalKey) {
      throw new BadRequestException(
        `No API key configured for AuditConfig "${config.id}" and no global fallback key set for ${config.aiProvider}.`,
      );
    }

    return globalKey;
  }
}
