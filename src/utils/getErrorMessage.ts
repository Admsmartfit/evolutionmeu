/**
 * This project's exception classes (@exceptions) throw plain objects with
 * `message` as an array of strings rather than `Error` instances, so a plain
 * `error.message` access doesn't reliably yield a string. This normalizes both shapes.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  const message = (error as { message?: unknown })?.message;
  if (Array.isArray(message)) return message.join('; ');
  if (typeof message === 'string') return message;

  return String(error);
}
