import { exec } from 'child_process';
import { CommandRunner } from './types';

/**
 * Runs a shell command and always resolves with whatever stdout/stderr it
 * produced — never rejects on a non-zero exit code. This matters because
 * both `npm outdated` and `npm audit` exit non-zero precisely when they have
 * useful JSON to report (outdated packages / vulnerabilities found), which is
 * the normal case, not a failure.
 */
/**
 * `npm outdated`/`npm audit` can hit the registry over the network — without
 * a timeout, a slow or unreachable registry (e.g. offline) would leave the
 * analysis spinning indefinitely instead of falling back to whatever local
 * data npm managed to report.
 */
const COMMAND_TIMEOUT_MS = 60_000;

export const defaultCommandRunner: CommandRunner = (command, cwd) =>
  new Promise((resolve) => {
    exec(command, { cwd, maxBuffer: 10 * 1024 * 1024, timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? '',
        timedOut: Boolean(error && (error as { killed?: boolean }).killed)
      });
    });
  });
