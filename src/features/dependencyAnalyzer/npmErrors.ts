/** First meaningful npm error line from stderr, e.g. "code ENOLOCK". */
export function firstNpmErrorLine(stderr: string): string | undefined {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.replace(/^npm (?:ERR!|error)\s*/i, '').trim())
    .filter(Boolean);
  return lines.find((l) => /^(code|\w*error)/i.test(l)) ?? lines[0];
}
