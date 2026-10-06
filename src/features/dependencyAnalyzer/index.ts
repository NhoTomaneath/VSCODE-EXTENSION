import * as vscode from 'vscode';
import { AIProvider } from '../../core/AIProvider';
import { analyzeWorkspaceDependencies } from './analyzer';
import { DependencyAnalysisResult } from './types';
import { escapeHtml, wrapWebviewHtml } from '../../ui/webviewHtml';

export type {
  OutdatedPackage,
  Vulnerability,
  VulnerabilitySeverity,
  DependencyAnalysisSummary,
  DependencyAnalysisResult
} from './types';
export { analyzeDependencies, analyzeWorkspaceDependencies } from './analyzer';

export function activateDependencyAnalyzer(context: vscode.ExtensionContext, aiProvider: AIProvider): void {
  const channel = vscode.window.createOutputChannel('Dev Companion AI: Dependencies');
  let panel: vscode.WebviewPanel | undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.analyzeDependencies', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('Dev Companion AI: open a workspace folder to analyze dependencies.');
        return;
      }

      try {
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Dev Companion AI: analyzing dependencies…' },
          () => analyzeWorkspaceDependencies(root, { aiProvider })
        );

        writeChannel(channel, result);

        if (!panel) {
          panel = vscode.window.createWebviewPanel(
            'devCompanionDependencies',
            'Dev Companion AI: Dependencies',
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
          );
          panel.onDidDispose(() => {
            panel = undefined;
          });
          context.subscriptions.push(panel);
        } else {
          panel.reveal(vscode.ViewColumn.Active);
        }
        panel.webview.html = renderWebviewHtml(result);
      } catch (err) {
        vscode.window.showErrorMessage(`Dev Companion AI: dependency analysis failed — ${(err as Error).message}`);
      }
    })
  );

  context.subscriptions.push(channel);
}

function writeChannel(channel: vscode.OutputChannel, result: DependencyAnalysisResult): void {
  channel.clear();
  channel.appendLine(
    `Installed packages: ${result.summary.totalInstalledPackages} | Outdated: ${result.summary.outdatedCount} | Critical vulnerabilities: ${result.summary.criticalVulnerabilityCount}`
  );
  channel.appendLine('');

  if (result.warnings.length > 0) {
    channel.appendLine('WARNING - report may be incomplete:');
    result.warnings.forEach((w) => channel.appendLine(`  ${w}`));
    channel.appendLine('');
  }

  if (result.outdated.length > 0) {
    channel.appendLine('Outdated packages:');
    result.outdated.forEach((p) => channel.appendLine(`  ${p.name}: ${p.current} -> ${p.latest}`));
    channel.appendLine('');
  }

  if (result.vulnerabilities.length > 0) {
    channel.appendLine('Vulnerabilities:');
    result.vulnerabilities.forEach((v) => channel.appendLine(`  ${v.name} (${v.severity})`));
    channel.appendLine('');
  }

  if (result.aiSummary) {
    channel.appendLine('AI summary:');
    channel.appendLine(result.aiSummary);
  } else if (result.aiSummaryError) {
    channel.appendLine(`AI summary unavailable: ${result.aiSummaryError}`);
  }
}

function renderWebviewHtml(result: DependencyAnalysisResult): string {
  const outdatedRows =
    result.outdated.length === 0
      ? `<p class="empty">${result.warnings.length ? 'No outdated data available (see warnings above).' : 'No outdated packages reported.'}</p>`
      : `<table>
          <thead><tr><th>Package</th><th>Current</th><th>Wanted</th><th>Latest</th></tr></thead>
          <tbody>${result.outdated
            .map(
              (p) =>
                `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.current)}</td><td>${escapeHtml(p.wanted)}</td><td>${escapeHtml(p.latest)}</td></tr>`
            )
            .join('')}</tbody>
        </table>`;

  const vulnRows =
    result.vulnerabilities.length === 0
      ? `<p class="empty">${result.warnings.length ? 'No vulnerability data available (see warnings above).' : 'No vulnerabilities reported.'}</p>`
      : `<table>
          <thead><tr><th>Package</th><th>Severity</th><th>Range</th><th>Fix</th></tr></thead>
          <tbody>${result.vulnerabilities
            .map(
              (v) =>
                `<tr>
                  <td>${escapeHtml(v.name)}</td>
                  <td class="severity-${escapeHtml(v.severity)}">${escapeHtml(v.severity)}</td>
                  <td>${escapeHtml(v.range ?? '—')}</td>
                  <td>${v.fixAvailable ? 'available' : '—'}</td>
                </tr>`
            )
            .join('')}</tbody>
        </table>`;

  const ai = result.aiSummary
    ? `<div class="ai"><strong>AI summary</strong><pre>${escapeHtml(result.aiSummary)}</pre></div>`
    : result.aiSummaryError
      ? `<div class="warn"><strong>AI summary unavailable</strong><div>${escapeHtml(result.aiSummaryError)}</div></div>`
      : '';

  const warnings = result.warnings.length
    ? `<div class="warn"><strong>Report may be incomplete</strong><ul>${result.warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join('')}</ul></div>`
    : '';

  return wrapWebviewHtml({
    title: 'Dependencies',
    body: `
  <h2>Dependencies</h2>
  <p class="subtitle">npm outdated + npm audit</p>
  <div class="cards">
    <div class="card"><div class="label">Installed</div><div class="value">${result.summary.totalInstalledPackages}</div></div>
    <div class="card"><div class="label">Outdated</div><div class="value">${result.summary.outdatedCount}</div></div>
    <div class="card"><div class="label">Critical vulns</div><div class="value">${result.summary.criticalVulnerabilityCount}</div></div>
  </div>
  ${warnings}
  ${ai}
  <h2>Outdated packages</h2>
  ${outdatedRows}
  <h2 style="margin-top:24px">Vulnerabilities</h2>
  ${vulnRows}`
  });
}
