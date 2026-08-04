const BANK_ACCOUNT_REGEX =
  /\b(ag[êe]ncia|conta[- ]?corrente|conta banc[áa]ria|chave pix|pix)\s*[:-]?\s*\d[\d.-]{3,}\b/gi;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]?){13,19}\b/g;
const CPF_FORMATTED_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_PLAIN_REGEX = /\b\d{11}\b/g;
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

/**
 * Best-effort LGPD PII redaction (RF07.1) applied to message text before it is sent
 * to any external AI provider. Regex-based redaction cannot guarantee 100% recall
 * (e.g. unlabeled bank account numbers are indistinguishable from other numbers),
 * so this is intentionally conservative — it prefers over-redacting to under-redacting.
 */
export function anonymizePiiFromText(text: string): string {
  if (!text) return text;

  let sanitized = text;

  sanitized = sanitized.replace(BANK_ACCOUNT_REGEX, (match) => match.replace(/\d[\d.-]*/g, '[DADO_BANCARIO_REDACTED]'));
  sanitized = sanitized.replace(CREDIT_CARD_REGEX, '[CARTAO_REDACTED]');
  sanitized = sanitized.replace(CPF_FORMATTED_REGEX, '[CPF_REDACTED]');
  sanitized = sanitized.replace(CPF_PLAIN_REGEX, '[CPF_REDACTED]');
  sanitized = sanitized.replace(EMAIL_REGEX, '[EMAIL_REDACTED]');

  return sanitized;
}
