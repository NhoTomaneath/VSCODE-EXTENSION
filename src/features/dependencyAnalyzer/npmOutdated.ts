import { CommandRunner, OutdatedPackage } from './types';
import { defaultCommandRunner } from './commandRunner';
import { firstNpmErrorLine } from './npmErrors';

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
}

/**
 * Detects outdated npm packages (current vs. latest version) via
 * `npm outdated --json`.
 */
export async function getOutdatedPackages(
  cwd: string,
  runCommand: CommandRunner = defaultCommandRunner
): Promise<OutdatedPackage[]> {
  return (await getOutdatedReport(cwd, runCommand)).packages;
}

/** Like `getOutdatedPackages`, but also reports why npm produced no usable data. */
export async function getOutdatedReport(
  cwd: string,
  runCommand: CommandRunner = defaultCommandRunner
): Promise<{ packages: OutdatedPackage[]; error?: string }> {
  const { stdout, stderr, timedOut } = await runCommand('npm outdated --json', cwd);
  if (!stdout.trim()) {
    if (timedOut) {
      return { packages: [], error: 'npm outdated timed out (registry slow or unreachable).' };
    }
    const detail = firstNpmErrorLine(stderr);
    return detail ? { packages: [], error: `npm outdated failed: ${detail}` } : { packages: [] };
  }

  let parsed: Record<string, NpmOutdatedEntry>;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { packages: [], error: 'npm outdated returned output that could not be parsed.' };
  }

  const npmError = (parsed as { error?: { summary?: string; code?: string } }).error;
  if (npmError && typeof npmError === 'object') {
    return { packages: [], error: `npm outdated failed: ${npmError.summary ?? npmError.code ?? 'unknown error'}` };
  }

  const packages = Object.entries(parsed).map(([name, info]) => ({
    name,
    current: info.current ?? 'missing',
    wanted: info.wanted ?? '',
    latest: info.latest ?? ''
  }));
  return { packages };
}
