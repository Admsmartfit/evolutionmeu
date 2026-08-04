/**
 * Assigns stable, structured placeholders (RF07.2) per role for the lifetime of a single
 * audit execution, e.g. "[GERENTE_A]", "[ADMIN_B]", "[SOCIO_A]". The same phone number
 * always resolves to the same placeholder within one instance of this class.
 */
export class AuditParticipantAnonymizer {
  private readonly counters = new Map<string, number>();
  private readonly assigned = new Map<string, string>();

  public getPlaceholder(phoneNumber: string, role: string): string {
    const cacheKey = `${role}:${phoneNumber}`;
    const existing = this.assigned.get(cacheKey);
    if (existing) return existing;

    const nextIndex = (this.counters.get(role) ?? 0) + 1;
    this.counters.set(role, nextIndex);

    const placeholder = `[${role}_${this.toLetterSuffix(nextIndex)}]`;
    this.assigned.set(cacheKey, placeholder);

    return placeholder;
  }

  /** 1 -> A, 2 -> B, ..., 26 -> Z, 27 -> AA, 28 -> AB, ... */
  private toLetterSuffix(index: number): string {
    let n = index;
    let result = '';

    while (n > 0) {
      const remainder = (n - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      n = Math.floor((n - 1) / 26);
    }

    return result;
  }
}
