import * as vscode from 'vscode';
import { loadConfig, ConfigOverrides, DevCompanionConfig } from './core/config';
import { createAIProvider } from './core/createAIProvider';
import { ReloadableAIProvider } from './core/reloadableAIProvider';
import { activateTerminalErrorExplainer } from './features/terminalErrorExplainer';
import { activateApiExplorer } from './features/apiExplorer';
import { activateArchitectureVisualization } from './features/architectureVisualization';
import { activateDependencyAnalyzer } from './features/dependencyAnalyzer';
import { activateTestGenerator } from './features/testGenerator';
import { activateDocumentationGenerator } from './features/documentationGenerator';
import { activateSidebar } from './ui/sidebar';
import { activateStatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const getConfig = (): DevCompanionConfig => {
    const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return loadConfig(projectRoot, context.extensionPath, readVsCodeOverrides());
  };

  const aiProvider = new ReloadableAIProvider(() => createAIProvider(getConfig()));
  const statusBar = activateStatusBar(context, aiProvider, getConfig);

  const checkProvider = async (announceWhenUnavailable: boolean) => {
    const available = await aiProvider.isAvailable();
    const modelMissing = available && aiProvider.isModelAvailable ? !(await aiProvider.isModelAvailable()) : false;
    statusBar.refresh(available, modelMissing);
    if (available && modelMissing && announceWhenUnavailable) {
      const config = getConfig();
      void vscode.window.showWarningMessage(
        `Dev Companion AI: model "${config.model}" is not installed on the Ollama server. Run: ollama pull ${config.model}`
      );
    } else if (!available && announceWhenUnavailable) {
      const config = getConfig();
      const choice = await vscode.window.showWarningMessage(
        `Dev Companion AI: could not reach the "${config.provider}" provider at ${config.ollama_url}. ` +
          'AI-powered features will show an error until it is reachable.',
        'Open Settings',
        'Retry'
      );
      if (choice === 'Open Settings') {
        await vscode.commands.executeCommand('devCompanion.openSettings');
      } else if (choice === 'Retry') {
        await checkProvider(true);
      }
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'devCompanion')
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('devCompanion')) {
        aiProvider.reload();
        // Only model/URL changes can change reachability; skip the popup for e.g. apiBaseUrl.
        const connectionChanged =
          event.affectsConfiguration('devCompanion.model') || event.affectsConfiguration('devCompanion.ollamaUrl');
        void checkProvider(connectionChanged);
      }
    })
  );

  // config.json in the workspace root is also a config source; reload when it changes.
  const configWatcher = vscode.workspace.createFileSystemWatcher('**/config.json');
  const onConfigFileChange = () => {
    aiProvider.reload();
    void checkProvider(true);
  };
  configWatcher.onDidChange(onConfigFileChange);
  configWatcher.onDidCreate(onConfigFileChange);
  configWatcher.onDidDelete(onConfigFileChange);
  context.subscriptions.push(configWatcher);

  activateSidebar(context);
  // Startup check is silent: the status bar already turns yellow, and a popup on every launch is noise.
  void checkProvider(false);

  activateTestGenerator(context, aiProvider);
  activateTerminalErrorExplainer(context, aiProvider);
  const apiExplorer = activateApiExplorer(context, () => getConfig().apiBaseUrl);
  activateDependencyAnalyzer(context, aiProvider);
  const architectureVisualizer = activateArchitectureVisualization(context);
  activateDocumentationGenerator(context, aiProvider, apiExplorer, architectureVisualizer);
}

export function deactivate(): void {
  // No explicit teardown needed: all listeners/channels are registered via
  // context.subscriptions and disposed automatically by VS Code.
}

/**
 * Only values the user actually set in Settings — not package.json defaults —
 * so a workspace config.json still works until they override it in the UI.
 */
function readVsCodeOverrides(): ConfigOverrides {
  const settings = vscode.workspace.getConfiguration('devCompanion');
  const pick = (key: string): string | undefined => {
    const inspected = settings.inspect<string>(key);
    return inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
  };
  return {
    model: pick('model'),
    ollama_url: pick('ollamaUrl'),
    apiBaseUrl: pick('apiBaseUrl')
  };
}
