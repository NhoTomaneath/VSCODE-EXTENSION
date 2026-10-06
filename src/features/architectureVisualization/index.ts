import * as vscode from 'vscode';
import { scanFolderHierarchy } from './folderScanner';
import { buildDiagramData } from './diagramData';
import { exportDiagramAsPng, exportDiagramAsSvg } from './exporter';
import { renderDiagramAsSvg } from './svgRenderer';
import { ArchitectureContract, DiagramData, FolderTreeNode } from './types';
import { wrapWebviewHtml } from '../../ui/webviewHtml';

export type { ArchitectureContract, FolderTreeNode, DiagramData, DiagramNode, DiagramEdge } from './types';
export { scanFolderHierarchy } from './folderScanner';
export { buildDiagramData } from './diagramData';
export { renderDiagramAsSvg } from './svgRenderer';
export { exportDiagramAsSvg, exportDiagramAsPng } from './exporter';

/**
 * Holds the most recent folder-hierarchy scan and exposes it via
 * `ArchitectureContract` — the stable interface F6 (Documentation Generator)
 * consumes instead of re-implementing folder traversal itself.
 */
export class ArchitectureVisualizer implements ArchitectureContract {
  private tree: FolderTreeNode | undefined;
  private scannedAt: number | undefined;

  scan(rootDir: string): FolderTreeNode {
    this.tree = scanFolderHierarchy(rootDir);
    this.scannedAt = Date.now();
    return this.tree;
  }

  getScannedAt(): number | undefined {
    return this.scannedAt;
  }

  getFolderTree(): FolderTreeNode | undefined {
    return this.tree;
  }
}

export function activateArchitectureVisualization(
  context: vscode.ExtensionContext
): ArchitectureVisualizer {
  const visualizer = new ArchitectureVisualizer();
  let panel: vscode.WebviewPanel | undefined;
  let lastDiagram: DiagramData | undefined;

  const requireWorkspaceRoot = (): string | undefined => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      vscode.window.showErrorMessage('Dev Companion AI: open a workspace folder to visualize its architecture.');
    }
    return root;
  };

  const ensurePanel = (): vscode.WebviewPanel => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Active);
      return panel;
    }
    panel = vscode.window.createWebviewPanel(
      'devCompanionArchitecture',
      'Dev Companion AI: Architecture',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
    context.subscriptions.push(panel);
    panel.webview.onDidReceiveMessage(async (message: { type: string; base64Png?: string; format?: string }) => {
      if (message.type === 'exportPngResult' && message.base64Png) {
        const targetUri = await vscode.window.showSaveDialog({ filters: { Images: ['png'] } });
        if (targetUri) {
          exportDiagramAsPng(Buffer.from(message.base64Png, 'base64'), targetUri.fsPath);
          vscode.window.showInformationMessage(`Dev Companion AI: architecture diagram exported to ${targetUri.fsPath}`);
        }
      } else if (message.type === 'exportPngError') {
        vscode.window.showErrorMessage(
          'Dev Companion AI: could not render the diagram as a PNG (it may be too large). Try exporting as SVG instead.'
        );
      } else if (message.type === 'export' && lastDiagram) {
        await exportDiagram(message.format === 'png' ? 'png' : 'svg');
      }
    });
    return panel;
  };

  const showDiagram = (diagram: DiagramData, autoExportPng = false) => {
    lastDiagram = diagram;
    const view = ensurePanel();
    view.webview.html = renderWebviewHtml(diagram, autoExportPng);
  };

  const exportDiagram = async (format: 'svg' | 'png') => {
    if (!lastDiagram) {
      vscode.window.showInformationMessage('Dev Companion AI: run "Visualize Architecture" first.');
      return;
    }
    if (format === 'svg') {
      const targetUri = await vscode.window.showSaveDialog({ filters: { 'SVG Image': ['svg'] } });
      if (targetUri) {
        exportDiagramAsSvg(lastDiagram, targetUri.fsPath);
        vscode.window.showInformationMessage(`Dev Companion AI: architecture diagram exported to ${targetUri.fsPath}`);
      }
      return;
    }
    showDiagram(lastDiagram, true);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.visualizeArchitecture', () => {
      const root = requireWorkspaceRoot();
      if (!root) {
        return;
      }
      const tree = visualizer.scan(root);
      showDiagram(buildDiagramData(tree));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devCompanion.exportArchitectureDiagram', async () => {
      if (!lastDiagram) {
        vscode.window.showInformationMessage('Dev Companion AI: run "Visualize Architecture" first.');
        return;
      }
      const format = await vscode.window.showQuickPick(['svg', 'png'], { placeHolder: 'Export format' });
      if (format === 'svg' || format === 'png') {
        await exportDiagram(format);
      }
    })
  );

  return visualizer;
}

function renderWebviewHtml(data: DiagramData, autoExportPng = false): string {
  const svg = renderDiagramAsSvg(data);
  return wrapWebviewHtml({
    title: 'Architecture',
    body: `
  <h2>Architecture</h2>
  <p class="subtitle">${data.nodes.length} node(s) · ${data.edges.length} connection(s)</p>
  <div class="toolbar">
    <button id="exportSvg">Export SVG</button>
    <button id="exportPng" class="secondary">Export PNG</button>
  </div>
  <div class="diagram-wrap">${svg}</div>`,
    script: `
    const vscodeApi = acquireVsCodeApi();
    const MAX_CANVAS_SIDE = 16000;
    document.getElementById('exportSvg')?.addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'export', format: 'svg' });
    });
    document.getElementById('exportPng')?.addEventListener('click', () => exportPng());
    if (${autoExportPng ? 'true' : 'false'}) {
      exportPng();
    }
    function exportPng() {
      const svg = document.querySelector('svg');
      if (!svg) return;
      const xml = new XMLSerializer().serializeToString(svg);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      const img = new Image();
      const fail = () => vscodeApi.postMessage({ type: 'exportPngError' });
      img.onerror = fail;
      img.onload = () => {
        try {
          const width = svg.width.baseVal.value || img.width;
          const height = svg.height.baseVal.value || img.height;
          // Browsers cap canvas size (~32k px per side); scale big trees down instead of exporting a blank image.
          const scale = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(width * scale));
          canvas.height = Math.max(1, Math.floor(height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return fail();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/png');
          if (!dataUrl.startsWith('data:image/png')) return fail();
          vscodeApi.postMessage({ type: 'exportPngResult', base64Png: dataUrl.split(',')[1] });
        } catch (e) {
          fail();
        }
      };
      img.src = url;
    }
    `
  });
}
