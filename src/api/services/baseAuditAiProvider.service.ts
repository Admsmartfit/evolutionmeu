export type AuditAiChatRequest = {
  systemPrompt: string;
  userContent: string;
  apiKey: string;
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
};

export type AuditAiExecutiveSummary = {
  communication_tone: string;
  key_decisions: string[];
  operational_bottlenecks: string[];
  management_alignment_score: string;
};

export type AuditAiOccurrence = {
  interlocutors: string;
  category: string;
  severity: string;
  evidence_quote: string;
  legal_fundamentation: string;
  recommendation: string;
};

export type AuditAiResult = {
  executive_summary: AuditAiExecutiveSummary;
  audit_findings: {
    overall_risk_level: string;
    occurrences: AuditAiOccurrence[];
  };
};

export abstract class BaseAuditAiProviderService {
  protected abstract getProviderName(): string;
  protected abstract callModel(request: AuditAiChatRequest): Promise<string>;

  public async generateAuditAnalysis(request: AuditAiChatRequest): Promise<AuditAiResult> {
    const rawText = await this.callModel(request);

    return this.parseAndValidate(rawText);
  }

  private parseAndValidate(rawText: string): AuditAiResult {
    const jsonText = this.extractJson(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`${this.getProviderName()} returned invalid JSON: ${(error as Error).message}`);
    }

    this.validateShape(parsed);

    return parsed as AuditAiResult;
  }

  /**
   * Some models still wrap JSON responses in a markdown code fence despite
   * being instructed to return raw JSON — strip it defensively before parsing.
   */
  private extractJson(rawText: string): string {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);

    return (fenced ? fenced[1] : rawText).trim();
  }

  private validateShape(parsed: unknown): asserts parsed is AuditAiResult {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`${this.getProviderName()} response is not a JSON object`);
    }

    const result = parsed as Partial<AuditAiResult>;

    if (!result.executive_summary || typeof result.executive_summary !== 'object') {
      throw new Error(`${this.getProviderName()} response is missing "executive_summary"`);
    }

    if (!result.audit_findings || typeof result.audit_findings !== 'object') {
      throw new Error(`${this.getProviderName()} response is missing "audit_findings"`);
    }

    if (!Array.isArray(result.audit_findings.occurrences)) {
      throw new Error(`${this.getProviderName()} response "audit_findings.occurrences" must be an array`);
    }
  }
}
