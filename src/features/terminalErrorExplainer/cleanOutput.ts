/** Maximum characters of terminal output sent to the AI (the tail is kept — errors are at the end). */
export const MAX_CAPTURE_CHARS = 8000;

// CSI sequences, OSC sequences (incl. VS Code shell-integration 633/133 marks), and other 2-char escapes.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/** Strips terminal escape codes and caps the length, keeping the end of the output. */
export function cleanTerminalOutput(raw: string, maxChars: number = MAX_CAPTURE_CHARS): string {
  const stripped = raw.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return stripped.length > maxChars ? stripped.slice(stripped.length - maxChars) : stripped;
}
