import * as vscode from 'vscode';
import { cleanTerminalOutput } from './cleanOutput';
import { TerminalCapture } from './types';

/** How long to wait for a finished command's output stream to drain. */
const DRAIN_TIMEOUT_MS = 2000;

interface PendingRead {
  chunks: string[];
  done: Promise<void>;
}

/**
 * Monitors the integrated terminal for finished commands using VS Code's
 * Terminal Shell Integration API, and forwards captured output to
 * `onCommandFinished` for failure detection. VS Code only delivers data
 * written *after* `read()` is first called, so reading must begin in the
 * start event, not the end event. Never throws into the extension host.
 */
export function registerTerminalListener(
  onCommandFinished: (capture: TerminalCapture) => void
): vscode.Disposable {
  const pending = new WeakMap<vscode.TerminalShellExecution, PendingRead>();

  const startListener = vscode.window.onDidStartTerminalShellExecution((event) => {
    try {
      const chunks: string[] = [];
      const done = (async () => {
        try {
          for await (const chunk of event.execution.read()) {
            chunks.push(chunk);
          }
        } catch {
          // Stream errors just end capture early.
        }
      })();
      pending.set(event.execution, { chunks, done });
    } catch {
      // Shell integration may not be available for this terminal/shell.
    }
  });

  const endListener = vscode.window.onDidEndTerminalShellExecution(async (event) => {
    try {
      const read = pending.get(event.execution);
      pending.delete(event.execution);
      if (read) {
        await Promise.race([read.done, new Promise<void>((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS))]);
      }
      onCommandFinished({
        text: cleanTerminalOutput(read ? read.chunks.join('') : ''),
        exitCode: event.exitCode,
        command: event.execution.commandLine?.value
      });
    } catch {
      // Silently skip rather than crashing the extension host.
    }
  });

  return vscode.Disposable.from(startListener, endListener);
}
