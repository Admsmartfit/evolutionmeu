import Anthropic from '@anthropic-ai/sdk';

import { AuditAiChatRequest, BaseAuditAiProviderService } from './baseAuditAiProvider.service';

const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeAuditAiProviderService extends BaseAuditAiProviderService {
  protected getProviderName(): string {
    return 'Claude';
  }

  protected async callModel(request: AuditAiChatRequest): Promise<string> {
    const client = new Anthropic({ apiKey: request.apiKey });

    const response = await client.messages.create({
      model: request.model,
      system: request.systemPrompt,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature,
      top_p: request.topP,
      messages: [{ role: 'user', content: request.userContent }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');

    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude response did not contain a text block');
    }

    return textBlock.text;
  }
}
