import * as vscode from 'vscode';
import * as path from 'path';
import { scanWorkspaceForEndpoints } from './scanner';
import { generateCurlCommand } from './curlGenerator';
import { ApiEndpoint, ApiExplorerContract, ScanError } from './types';
import { escapeHtml, wrapWebviewHtml } from '../../ui/webviewHtml';

export type { ApiEndpoint, ApiExplorerContract, ScanError, RequestBodyField, HttpMethod, ApiScanResult } from './types';
export { generateCurlCommand } from './curlGenerator';
export { scanWorkspaceForEndpoints } from './scanner';

/**
 * Holds the most recent scan results and exposes them via `ApiExplorerContract`
 * — the stable interface F6 (Documentation Generator) consumes instead of
 * re-scanning the workspace itself.
 */
export class ApiExplorer implements ApiExplorerContract {
  private endpoints: ApiEndpoint[] = [];
  private errors: ScanError[] = [];
  private scannedAt: number | undefined;

  scan(rootDir: string): void {
    const result = scanWorkspaceForEndpoints(rootDir);
    this.endpoints = result.endpoints;
    this.errors = result.errors;
    this.scannedAt = Date.now();
  }

  getScannedAt(): number | undefined {
    return this.scannedAt;
  }

  getEndpoints(): ApiEndpoint[] {
    return this.endpoints;
  }

  getScanErrors(): ScanError[] {
    return this.errors;
  }
}

/** Windows shells need curl.exe + double quotes; see CurlGeneratorOptions.style. */
const CURL_STYLE = process.platform === 'win32' ? 'windows' : 'posix';

const METHOD_COLORS: Record<string, string> = {
  GET: '#2f81f7',
  POST: '#3fb950',
  PUT: '#d29922',
  PATCH: '#a371f7',
  DELETE: '#f85149',
  OPTIONS: '#8b949e',
  HEAD: '#8b949e'
};

export function activateApiExplorer(
  context: vscode.ExtensionContext,
  getApiBaseUrl: () => string = () => 'http://localhost:3000'
): ApiExplorer {
  const explorer = new ApiExplorer();
  const channel = vscode.window.createOutputChannel('Dev Companion AI: API Explorer');
  let panel: vscode.WebviewPanel | undefined;

  const runScan = () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('Dev Companion AI: open a workspace folder to scan for API endpoints.');
      return;
    }
    explorer.scan(root);
    const endpoints = explorer.getEndpoints();
    const errors = explorer.getScanErrors();
    const apiBaseUrl = getApiBaseUrl();

    channel.clear();
    channel.appendLine(`Found ${endpoints.length} API endpoint(s) across the workspace.`);
    channel.appendLine('');

    for (const endpoint of endpoints) {
      const curl = generateCurlCommand(endpoint, { baseUrl: apiBaseUrl, style: CURL_STYLE });
      channel.appendLine(`${endpoint.method} ${endpoint.path}  (${endpoint.filePath}:${endpoint.line}, ${endpoint.framework})`);
      if (endpoint.bodyFields.length > 0) {
        channel.appendLine(`  body fields: ${endpoint.bodyFields.map((f) => f.name).join(', ')}`);
      }
      channel.appendLine(`  ${curl}`);
      channel.appendLine('');
    }

    if (errors.length > 0) {
      channel.appendLine(`${errors.length} file(s) could not be scanned:`);
      errors.forEach((e) => channel.appendLine(`  ${e.filePath}: ${e.message}`));
    }

    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        'devCompanionApiExplorer',
        'Dev Companion AI: API Explorer',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => {
        panel = undefined;
      });
      context.subscriptions.push(panel);
      panel.webview.onDidReceiveMessage(
        async (message: { type: string; filePath?: string; line?: number; curl?: string }) => {
          if (message.type === 'openFile' && message.filePath) {
            const resolved = path.resolve(root, message.filePath);
            // The path comes from the webview; never open anything outside the workspace.
            if (resolved !== root && !resolved.startsWith(root + path.sep)) {
              return;
            }
            const targetUri = vscode.Uri.file(resolved);
            const doc = await vscode.workspace.openTextDocument(targetUri);
            const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            const position = new vscode.Position(Math.max(0, (message.line ?? 1) - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
          } else if (message.type === 'copyCurl' && message.curl) {
            await vscode.env.clipboard.writeText(message.curl);
            vscode.window.showInformationMessage('Dev Companion AI: curl command copied to clipboard.');
          }
        }
      );
    } else {
      panel.reveal(vscode.ViewColumn.Active);
    }
    panel.webview.html = renderWebviewHtml(endpoints, errors, apiBaseUrl);

    vscode.window.showInformationMessage(
      `Dev Companion AI: found ${endpoints.length} API endpoint(s)${errors.length > 0 ? ` (${errors.length} file(s) could not be scanned)` : ''}.`
    );
  };

  context.subscriptions.push(vscode.commands.registerCommand('devCompanion.scanApiEndpoints', runScan));
  context.subscriptions.push(channel);

  return explorer;
}

function renderWebviewHtml(endpoints: ApiEndpoint[], errors: ScanError[], apiBaseUrl: string): string {
  const rows = endpoints.map((endpoint, i) => {
    const curl = generateCurlCommand(endpoint, { baseUrl: apiBaseUrl, style: CURL_STYLE });
    const color = METHOD_COLORS[endpoint.method] || '#8b949e';
    const fields = endpoint.bodyFields.length
      ? escapeHtml(endpoint.bodyFields.map((f) => f.name).join(', '))
      : '—';
    return `<tr>
      <td><span class="method" style="background:${color}">${escapeHtml(endpoint.method)}</span></td>
      <td class="path">${escapeHtml(endpoint.path)}</td>
      <td>
        <a class="location" href="#" data-i="${i}">${escapeHtml(endpoint.filePath)}:${endpoint.line}</a>
        <div class="framework">${escapeHtml(endpoint.framework)}</div>
      </td>
      <td class="fields">${fields}</td>
      <td>
        <div class="curl-row">
          <code class="curl">${escapeHtml(curl)}</code>
          <button class="secondary copy" data-curl="${escapeHtml(curl)}">Copy</button>
        </div>
      </td>
    </tr>`;
  });

  const errorsHtml = errors.length
    ? `<div class="errors">
        <strong>${errors.length} file(s) could not be scanned:</strong>
        <ul>${errors.map((e) => `<li>${escapeHtml(e.filePath)}: ${escapeHtml(e.message)}</li>`).join('')}</ul>
      </div>`
    : '';

  const table =
    endpoints.length === 0
      ? '<p class="empty">No API endpoints found in this workspace.</p>'
      : `<table>
    <thead>
      <tr><th>Method</th><th>Path</th><th>Source</th><th>Body fields</th><th>cURL</th></tr>
    </thead>
    <tbody id="rows">${rows.join('')}</tbody>
  </table>`;

  const serialized = JSON.stringify(endpoints).replace(/</g, '\\u003c');

  return wrapWebviewHtml({
    title: 'API Explorer',
    body: `
  <style>
    .method {
      display: inline-block;
      min-width: 52px;
      text-align: center;
      font-weight: 700;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      color: #fff;
    }
    .path, .location, .curl { font-family: var(--vscode-editor-font-family, monospace); }
    .location { color: var(--vscode-textLink-foreground); text-decoration: none; font-size: 12px; }
    .location:hover { text-decoration: underline; }
    .framework { font-size: 11px; opacity: 0.65; }
    .curl-row { display: flex; align-items: center; gap: 8px; }
    code.curl {
      background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15));
      padding: 3px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }
  </style>
  <h2>API Explorer</h2>
  <p class="subtitle">Found ${endpoints.length} endpoint(s)${errors.length ? `, ${errors.length} file(s) failed to scan` : ''} · cURL host ${escapeHtml(apiBaseUrl)}</p>
  ${errorsHtml}
  ${table}`,
    script: `
    const vscodeApi = acquireVsCodeApi();
    const endpoints = ${serialized};
    const rows = document.getElementById('rows');
    if (rows) {
      rows.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains('location')) {
          event.preventDefault();
          const endpoint = endpoints[Number(target.getAttribute('data-i'))];
          vscodeApi.postMessage({ type: 'openFile', filePath: endpoint.filePath, line: endpoint.line });
        } else if (target.classList.contains('copy')) {
          vscodeApi.postMessage({ type: 'copyCurl', curl: target.getAttribute('data-curl') });
          target.textContent = 'Copied!';
          setTimeout(() => { target.textContent = 'Copy'; }, 1200);
        }
      });
    }
    `
  });
}
