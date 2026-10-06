import * as vscode from 'vscode';
import { AIProvider } from '../../core/AIProvider';
import { detectFailure } from './errorPatterns';
import { explainError } from './explainer';
import { ErrorExplanationPanel } from './outputPanel';
import { registerTerminalListener } from './terminalListener';
import { TerminalCapture } from './types';

export function activateTerminalErrorExplainer(context: vscode.ExtensionContext, aiProvider: AIProvider): void {
  const panel = new ErrorExplanationPanel();
  let lastFailure: TerminalCapture | undefined;

  const handleCapture = (capture: TerminalCapture) => {
    // 130 = user pressed Ctrl+C; not a failure worth explaining.
    if (capture.exitCode === 130) {
      return;
    }
    const detection = detectFailure(capture);
    if (!detection.matched) {
      return;
    }
    // A bare non-zero exit with no output (e.g. `grep` with no match) has nothing to explain.
    if (detection.signature === 'non-zero-exit' && !capture.text.trim()) {
      return;
    }
    lastFailure = capture;
    void explainCapture(capture);
  };

  const explainCapture = async (capture: TerminalCapture) => {
    try {
      const explanation = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Dev Companion AI: explaining terminal error…' },
        () => explainError(aiProvider, capture)
      );
      panel.show(capture.command, explanation);
    } catch (err) {
      panel.showError((err as Error).message);
    }
  };

  context.subscriptions.push(registerTerminalListener(handleCapture));

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.explainLastTerminalError', async () => {
      if (!lastFailure) {
        vscode.window.showInformationMessage('Dev Companion AI: no terminal failure has been detected yet.');
        return;
      }
      await explainCapture(lastFailure);
    })
  );

  context.subscriptions.push(panel);
}
