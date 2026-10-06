import { cleanTerminalOutput } from './cleanOutput';

describe('cleanTerminalOutput', () => {
  it('strips ANSI colour and OSC shell-integration sequences', () => {
    const raw = '\u001b]633;C\u0007\u001b[31mTypeError: boom\u001b[0m\r\n';
    expect(cleanTerminalOutput(raw)).toBe('TypeError: boom\n');
  });

  it('keeps only the tail when output exceeds the cap', () => {
    expect(cleanTerminalOutput('abcdefghij', 4)).toBe('ghij');
  });
});
