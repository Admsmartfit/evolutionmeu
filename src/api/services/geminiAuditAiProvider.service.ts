import { GoogleGenerativeAI } from '@google/generative-ai';

import { AuditAiChatRequest, BaseAuditAiProviderService } from './baseAuditAiProvider.service';

export class GeminiAuditAiProviderService extends BaseAuditAiProviderService {
  protected getProviderName(): string {
    return 'Gemini';
  }

  protected async callModel(request: AuditAiChatRequest): Promise<string> {
    const client = new GoogleGenerativeAI(request.apiKey);

    const model = client.getGenerativeModel({
      model: request.model,
      systemInstruction: request.systemPrompt,
      generationConfig: {
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxTokens,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(request.userContent);

    return result.response.text();
  }
}
