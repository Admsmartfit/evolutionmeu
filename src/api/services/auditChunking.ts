const DEFAULT_MAX_CHARS_PER_CHUNK = 12000;

/**
 * Splits a conversation transcript into chunks that stay under a character budget
 * (RNF: "chunking inteligente" for large batches), always keeping the given header
 * at the top of every chunk so each one is a self-contained prompt fragment. Never
 * splits in the middle of a message line.
 */
export function chunkConversationText(
  header: string,
  lines: string[],
  maxChars = DEFAULT_MAX_CHARS_PER_CHUNK,
): string[] {
  const chunks: string[] = [];
  let current = header;

  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current !== header) {
      chunks.push(current);
      current = header;
    }

    current += '\n' + line;
  }

  if (current !== header) chunks.push(current);

  return chunks.length > 0 ? chunks : [header];
}
