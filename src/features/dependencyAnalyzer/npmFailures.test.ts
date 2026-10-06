import { analyzeDependencies } from './analyzer';
import { CommandRunner } from './types';

describe('npm failures are reported, not shown as a clean result', () => {
  it('warns when npm audit returns an error object (e.g. no lockfile)', async () => {
    const runCommand: CommandRunner = async (command) =>
      command.includes('audit')
        ? { stdout: JSON.stringify({ error: { code: 'ENOLOCK', summary: 'requires an existing lockfile' } }), stderr: '' }
        : { stdout: '{}', stderr: '' };

    const result = await analyzeDependencies('/repo', { runCommand });

    expect(result.warnings).toEqual(['npm audit failed: requires an existing lockfile']);
  });

  it('warns when a command times out with no output', async () => {
    const runCommand: CommandRunner = async () => ({ stdout: '', stderr: '', timedOut: true });

    const result = await analyzeDependencies('/repo', { runCommand });

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toMatch(/timed out/);
  });

  it('surfaces the npm error line from stderr when stdout is empty', async () => {
    const runCommand: CommandRunner = async () => ({ stdout: '', stderr: 'npm error code ENOENT\nnpm error path /x', timedOut: false });

    const result = await analyzeDependencies('/repo', { runCommand });

    expect(result.warnings[0]).toContain('code ENOENT');
  });

  it('has no warnings for a genuinely clean project', async () => {
    const runCommand: CommandRunner = async () => ({ stdout: '', stderr: '' });

    const result = await analyzeDependencies('/repo', { runCommand });

    expect(result.warnings).toEqual([]);
  });
});
