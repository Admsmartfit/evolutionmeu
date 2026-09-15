import { PrismaRepository } from '@api/repository/repository.service';
import { Audit, configService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';
import { getErrorMessage } from '@utils/getErrorMessage';

import { AuditAiProviderFactory } from './auditAiProviderFactory.service';
import { AuditConfigService } from './auditConfig.service';
import { AUDIT_DIRECTIVES_SYSTEM_PROMPT, buildAuditDirectivesUserPrompt } from './auditDirectivesPrompt';
import { AuditInstanceRef, AuditMessageCollectorService } from './auditMessageCollector.service';
import { AUDIT_SYSTEM_PROMPT, buildAuditUserPrompt } from './auditPrompt';
import {
  aggregateAuditResults,
  aggregateDirectives,
  revealUnidentifiedInDirectives,
  revealUnidentifiedInterlocutors,
} from './auditReportAggregator';
import { AuditReportDeliveryService } from './auditReportDelivery.service';
import { AuditReportPdfService } from './auditReportPdf.service';
import { AuditReportStorageService } from './auditReportStorage.service';
import { buildAuditDirectivesWhatsAppMessage, buildAuditWhatsAppMessage } from './auditWhatsAppMessage';
import { AuditAiDirectivesResult, AuditAiResult, BaseAuditAiProviderService } from './baseAuditAiProvider.service';
import { WAMonitoringService } from './monitor.service';

export type AuditExecutionParams = {
  auditConfigId: string;
  periodStart: Date;
  periodEnd: Date;
};

type AuditConfigRecord = {
  id: string;
  reportType: string;
  aiProvider: string;
  aiModel: string;
  apiKeyEncrypted: string | null;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  excludedJids: unknown;
  senderInstanceName: string | null;
  recipientPhoneNumber: string | null;
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
    private readonly deliveryService: AuditReportDeliveryService = new AuditReportDeliveryService(waMonitor),
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
        reportType: config.reportType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        instancesAudited: instances.map((instance) => instance.name),
        status: 'PROCESSING',
      },
    });

    try {
      if (config.reportType === 'DIRECTIVES') {
        await this.runDirectives(config, instances, params, report.id, report.executionDate);
      } else {
        await this.runCompliance(config, instances, params, report.id, report.executionDate);
      }

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

  private async runCompliance(
    config: AuditConfigRecord,
    instances: AuditInstanceRef[],
    params: AuditExecutionParams,
    reportId: string,
    executionDate: Date,
  ): Promise<void> {
    const results: AuditAiResult[] = [];
    let unidentifiedLabels: Record<string, string> = {};

    if (instances.length > 0) {
      const apiKey = await this.resolveApiKey(config);
      const provider = this.createAiProvider(config.aiProvider);

      const collected = await this.messageCollector.collect({
        instances,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        excludedJids: (config.excludedJids as string[] | null) || undefined,
      });
      unidentifiedLabels = collected.unidentifiedLabels;

      for (const chunk of collected.chunks) {
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

        const contextRef = {
          instanceId: chunk.instanceId,
          instanceName: chunk.instanceName,
          counterpartNumber: chunk.counterpartNumber,
          conversationStart: chunk.conversationStart.toISOString(),
          conversationEnd: chunk.conversationEnd.toISOString(),
        };

        results.push({
          ...result,
          audit_findings: {
            ...result.audit_findings,
            occurrences: result.audit_findings.occurrences.map((occurrence) => ({ ...occurrence, contextRef })),
          },
        });
      }
    }

    const aggregated = aggregateAuditResults(results);
    // AI input stays anonymized (RF07.1/RF07.2, PII never leaves to the AI provider);
    // this only reveals unidentified numbers in the report that comes back out.
    const revealed = revealUnidentifiedInterlocutors(aggregated, unidentifiedLabels);
    const instancesAudited = instances.map((instance) => instance.name);

    const pdfBuffer = await this.pdfService.generate({
      id: reportId,
      executionDate,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      instancesAudited,
      overallRiskLevel: revealed.overall_risk_level,
      riskMatrix: revealed.risk_matrix,
      executiveSummary: revealed.executive_summary,
      occurrencesDetails: revealed.occurrences,
    });
    const pdfStorageUrl = await this.storageService.uploadReportPdf(reportId, pdfBuffer);

    await this.deliverReport({
      reportId,
      senderInstanceName: config.senderInstanceName,
      recipientPhoneNumber: config.recipientPhoneNumber,
      caption: buildAuditWhatsAppMessage({
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        instancesAudited,
        executiveSummary: revealed.executive_summary,
        riskMatrix: revealed.risk_matrix,
        occurrencesDetails: revealed.occurrences,
      }),
      fileNamePrefix: 'auditoria-compliance',
      pdfBuffer,
    });

    await this.prismaRepository.auditReport.update({
      where: { id: reportId },
      data: {
        executiveSummary: revealed.executive_summary,
        occurrencesDetails: revealed.occurrences,
        overallRiskLevel: revealed.overall_risk_level,
        riskMatrix: revealed.risk_matrix,
        pdfStorageUrl,
        status: 'COMPLETED',
      },
    });
  }

  private async runDirectives(
    config: AuditConfigRecord,
    instances: AuditInstanceRef[],
    params: AuditExecutionParams,
    reportId: string,
    executionDate: Date,
  ): Promise<void> {
    const results: AuditAiDirectivesResult[] = [];
    let unidentifiedLabels: Record<string, string> = {};

    if (instances.length > 0) {
      const apiKey = await this.resolveApiKey(config);
      const provider = this.createAiProvider(config.aiProvider);

      const collected = await this.messageCollector.collect({
        instances,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        excludedJids: (config.excludedJids as string[] | null) || undefined,
      });
      unidentifiedLabels = collected.unidentifiedLabels;

      for (const chunk of collected.chunks) {
        const result = await provider.generateDirectivesAnalysis({
          systemPrompt: AUDIT_DIRECTIVES_SYSTEM_PROMPT,
          userContent: buildAuditDirectivesUserPrompt({
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

    const aggregated = aggregateDirectives(results);
    // Same anonymization contract as the compliance report: the AI never sees a real
    // number, only the report we hand back out reveals unidentified counterparts.
    const revealed = revealUnidentifiedInDirectives(aggregated, unidentifiedLabels);
    const instancesAudited = instances.map((instance) => instance.name);

    const pdfBuffer = await this.pdfService.generateDirectives({
      id: reportId,
      executionDate,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      instancesAudited,
      directives: revealed,
    });
    const pdfStorageUrl = await this.storageService.uploadReportPdf(reportId, pdfBuffer);

    await this.deliverReport({
      reportId,
      senderInstanceName: config.senderInstanceName,
      recipientPhoneNumber: config.recipientPhoneNumber,
      caption: buildAuditDirectivesWhatsAppMessage({
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        instancesAudited,
        directives: revealed,
      }),
      fileNamePrefix: 'diretivas-socios',
      pdfBuffer,
    });

    await this.prismaRepository.auditReport.update({
      where: { id: reportId },
      data: {
        occurrencesDetails: revealed,
        pdfStorageUrl,
        status: 'COMPLETED',
      },
    });
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
        `Audit report ${params.reportId} delivery: sent=${result.sent}` +
          (result.skippedReason ? ` skippedReason="${result.skippedReason}"` : '') +
          (result.failedReason ? ` failedReason="${result.failedReason}"` : ''),
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
