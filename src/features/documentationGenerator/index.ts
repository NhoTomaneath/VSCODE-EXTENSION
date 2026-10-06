import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from '../../core/AIProvider';
import { ApiExplorerContract } from '../apiExplorer/types';
import { ArchitectureContract } from '../architectureVisualization/types';
import { DocumentationCancelledError, generateDocumentation } from './documentationGenerator';
import { writeMarkdownFile } from './markdownWriter';

export type { DocumentationSummaryCount, FunctionSignature, ClassSignature } from './types';
export { generateDocumentation, DocumentationCancelledError } from './documentationGenerator';

/**
 * Wires the "Generate Documentation" command. Depends only on
 * `ApiExplorerContract` and `ArchitectureContract` — the documented F2->F6
 * and F3->F6 data contracts — never on F2/F3's scanning implementations.
 */
export function activateDocumentationGenerator(
  context: vscode.ExtensionContext,
  aiProvider: AIProvider,
  apiExplorer: ApiExplorerContract,
  architectureVisualizer: ArchitectureContract
): void {
  // Scan results go stale when source files change; track that so we don't document old code.
  let lastSourceChange = 0;
  const sourceWatcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx}');
  const markChanged = () => {
    lastSourceChange = Date.now();
  };
  sourceWatcher.onDidChange(markChanged);
  sourceWatcher.onDidCreate(markChanged);
  sourceWatcher.onDidDelete(markChanged);
  context.subscriptions.push(sourceWatcher);

  const isStale = (scannedAt: number | undefined) => scannedAt !== undefined && scannedAt < lastSourceChange;

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.generateDocumentation', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('Dev Companion AI: open a workspace folder to generate documentation.');
        return;
      }

      const apiStale = apiExplorer.getEndpoints().length > 0 && isStale(apiExplorer.getScannedAt?.());
      const architectureStale = !!architectureVisualizer.getFolderTree() && isStale(architectureVisualizer.getScannedAt?.());
      const needsApiScan = apiExplorer.getEndpoints().length === 0 || apiStale;
      const needsArchitectureScan = !architectureVisualizer.getFolderTree() || architectureStale;
      if (needsApiScan || needsArchitectureScan) {
        const missing = [needsApiScan && 'API scan', needsArchitectureScan && 'architecture diagram']
          .filter(Boolean)
          .join(' and ');
        const staleNote = apiStale || architectureStale ? ' is out of date (files changed since it was run)' : ' has not been run yet';
        const choice = await vscode.window.showWarningMessage(
          `Dev Companion AI: the ${missing}${staleNote}, so that section of the documentation may be empty or outdated.`,
          'Scan and generate',
          'Generate anyway',
          'Cancel'
        );
        if (choice === 'Scan and generate') {
          // Delegates to F2/F3's own registered commands — never touches
          // their scanning internals directly (see architecturalBoundary.test.ts).
          if (needsApiScan) {
            await vscode.commands.executeCommand('devCompanion.scanApiEndpoints');
          }
          if (needsArchitectureScan) {
            await vscode.commands.executeCommand('devCompanion.visualizeArchitecture');
          }
        } else if (choice !== 'Generate anyway') {
          return;
        }
      }

      const apiDocPath = path.join(root, 'API_Documentation.md');
      const architectureDocPath = path.join(root, 'Architecture_Guide.md');
      const existing = [apiDocPath, architectureDocPath].filter((p) => fs.existsSync(p)).map((p) => path.basename(p));
      if (existing.length > 0) {
        const overwrite = await vscode.window.showWarningMessage(
          `Dev Companion AI: ${existing.join(' and ')} already exist${existing.length === 1 ? 's' : ''} and will be overwritten.`,
          { modal: true },
          'Overwrite'
        );
        if (overwrite !== 'Overwrite') {
          return;
        }
      }

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Dev Companion AI: generating documentation…',
            cancellable: true
          },
          (progress, token) => {
            let reported = 0;
            return generateDocumentation({
              aiProvider,
              rootDir: root,
              endpoints: apiExplorer.getEndpoints(),
              folderTree: architectureVisualizer.getFolderTree(),
              isCancelled: () => token.isCancellationRequested,
              onProgress: (done, total) => {
                progress.report({ message: `${done}/${total}`, increment: ((done - reported) / total) * 100 });
                reported = done;
              }
            });
          }
        );

        writeMarkdownFile(result.apiDocumentationMarkdown, apiDocPath);
        writeMarkdownFile(result.architectureGuideMarkdown, architectureDocPath);

        const architectureDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(architectureDocPath));
        await vscode.window.showTextDocument(architectureDoc, { preview: false });
        const apiDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(apiDocPath));
        await vscode.window.showTextDocument(apiDoc, { preview: false, viewColumn: vscode.ViewColumn.Beside });

        vscode.window.showInformationMessage(
          `Dev Companion AI: documented ${result.summaryCount.routesDocumented} route(s), ` +
            `${result.summaryCount.controllersDocumented} controller file(s), ` +
            `${result.summaryCount.functionsDocumented} function(s), and ${result.summaryCount.classesDocumented} class(es).` +
            (result.skipped.functions + result.skipped.classes > 0
              ? ` ${result.skipped.functions + result.skipped.classes} more were skipped (AI call limit).`
              : '')
        );
      } catch (err) {
        if (err instanceof DocumentationCancelledError) {
          vscode.window.showInformationMessage('Dev Companion AI: documentation generation cancelled; no files were written.');
          return;
        }
        vscode.window.showErrorMessage(`Dev Companion AI: documentation generation failed — ${(err as Error).message}`);
      }
    })
  );
}
