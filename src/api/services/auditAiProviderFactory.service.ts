import { BadRequestException } from '@exceptions';

import { BaseAuditAiProviderService } from './baseAuditAiProvider.service';
import { ClaudeAuditAiProviderService } from './claudeAuditAiProvider.service';
import { GeminiAuditAiProviderService } from './geminiAuditAiProvider.service';

export class AuditAiProviderFactory {
  public static create(aiProvider: string): BaseAuditAiProviderService {
    switch (aiProvider) {
      case 'GEMINI':
        return new GeminiAuditAiProviderService();
      case 'CLAUDE':
        return new ClaudeAuditAiProviderService();
      default:
        throw new BadRequestException(`Unsupported aiProvider: "${aiProvider}"`);
    }
  }
}
