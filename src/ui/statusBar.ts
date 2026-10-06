import * as vscode from 'vscode';
import { AIProvider } from '../core/AIProvider';
import { DevCompanionConfig } from '../core/config';

export interface CompanionStatusBar {
  refresh(available: boolean, modelMissing?: boolean): void;
}

export function activateStatusBar(
  context: vscode.ExtensionContext,
  aiProvider: AIProvider,
  getConfig: () => DevCompanionConfig
): CompanionStatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  item.command = 'devCompanion.showStatus';
  item.name = 'Dev Companion AI';
  item.text = '$(sparkle) Dev Companion';
  item.tooltip = 'Dev Companion AI — click for Ollama status';
  item.show();
  context.subscriptions.push(item);

  const refresh = (available: boolean, modelMissing = false) => {
    const config = getConfig();
    if (available && modelMissing) {
      item.text = '$(warning) Dev Companion';
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.tooltip = `Connected to ${config.provider}, but model "${config.model}" is not installed. Run: ollama pull ${config.model}`;
    } else if (available) {
      item.text = '$(sparkle) Dev Companion';
      item.backgroundColor = undefined;
      item.tooltip = `Connected to ${config.provider} (${config.model}) at ${config.ollama_url}`;
    } else {
      item.text = '$(warning) Dev Companion';
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.tooltip = `Cannot reach ${config.provider} at ${config.ollama_url}. Click to retry or open settings.`;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.showStatus', async () => {
      const config = getConfig();
      const available = await aiProvider.isAvailable();
      const modelMissing = available && aiProvider.isModelAvailable ? !(await aiProvider.isModelAvailable()) : false;
      refresh(available, modelMissing);
      const status = !available
        ? 'unreachable'
        : modelMissing
          ? `reachable, but model "${config.model}" is not installed (run: ollama pull ${config.model})`
          : `connected (${config.model})`;
      const choice = await vscode.window.showInformationMessage(
        `Dev Companion AI: ${config.provider} is ${status} at ${config.ollama_url}.`,
        'Open Settings',
        'Retry'
      );
      if (choice === 'Open Settings') {
        await vscode.commands.executeCommand('devCompanion.openSettings');
      } else if (choice === 'Retry') {
        const retried = await aiProvider.isAvailable();
        refresh(retried, retried && aiProvider.isModelAvailable ? !(await aiProvider.isModelAvailable()) : false);
      }
    })
  );

  return { refresh };
}
