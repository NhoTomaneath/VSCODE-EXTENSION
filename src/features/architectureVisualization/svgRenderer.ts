import { DiagramData, DiagramNode } from './types';

const NODE_WIDTH = 150;
const NODE_HEIGHT = 26;
const ROW_HEIGHT = 34;
const DEPTH_INDENT = 170;
const PADDING = 20;
const LEGEND_SWATCH = 12;
const LEGEND_ITEM_WIDTH = 130;
const LEGEND_ROW_HEIGHT = 22;
const LEGEND_TOP_MARGIN = 12;
/** Approximate characters that fit in a node box at font-size 12. */
const MAX_LABEL_CHARS = 20;

/**
 * Fixed categorical palette (validated for light/dark contrast and
 * colorblind-safe adjacency — see the dataviz skill's reference palette).
 * Directories get their own dedicated hue; files are colored by category so
 * the diagram reads as more than two flat blocks.
 */
const DIRECTORY_COLOR = { key: 'directory', label: 'Directory', color: '#2a78d6' };
const TEST_FILE = { key: 'test', label: 'Test file', color: '#008300' };
const OTHER_FILE = { key: 'other', label: 'Other file', color: '#8b949e' };

interface FileCategory {
  key: string;
  label: string;
  color: string;
  extensions: string[];
}

const FILE_CATEGORIES: FileCategory[] = [
  { key: 'ts', label: 'TypeScript', color: '#3987e5', extensions: ['ts', 'tsx'] },
  { key: 'js', label: 'JavaScript', color: '#eb6834', extensions: ['js', 'jsx', 'mjs', 'cjs'] },
  { key: 'data', label: 'Config / data', color: '#1baf7a', extensions: ['json', 'jsonc', 'yml', 'yaml', 'toml'] },
  { key: 'docs', label: 'Docs', color: '#eda100', extensions: ['md', 'mdx', 'txt'] },
  { key: 'style', label: 'Styles', color: '#e87ba4', extensions: ['css', 'scss', 'less'] },
  { key: 'markup', label: 'Markup', color: '#e34948', extensions: ['html', 'svg', 'xml'] }
];

const EXTENSION_TO_CATEGORY = new Map<string, FileCategory>(
  FILE_CATEGORIES.flatMap((category) => category.extensions.map((ext) => [ext, category] as const))
);

interface NodeStyle {
  key: string;
  label: string;
  color: string;
}

function classifyNode(node: DiagramNode): NodeStyle {
  if (node.type === 'directory') {
    return DIRECTORY_COLOR;
  }
  if (/\.(test|spec)\.[^.]+$/i.test(node.label)) {
    return TEST_FILE;
  }
  const ext = node.label.includes('.') ? node.label.split('.').pop()!.toLowerCase() : '';
  const category = EXTENSION_TO_CATEGORY.get(ext);
  return category ?? OTHER_FILE;
}

/** Picks black or white text for readable contrast against a given fill color. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}

/**
 * Renders diagram data as a dependency-free, deterministic SVG string — a
 * simple indented tree layout, one row per node in traversal order, colored
 * by node type/file category with a legend for whichever categories appear.
 */
export function renderDiagramAsSvg(data: DiagramData): string {
  const positions = new Map<string, { x: number; y: number }>();
  const styles = new Map<string, NodeStyle>();
  data.nodes.forEach((node, index) => {
    positions.set(node.id, { x: PADDING + node.depth * DEPTH_INDENT, y: PADDING + index * ROW_HEIGHT });
    styles.set(node.id, classifyNode(node));
  });

  const diagramWidth = PADDING * 2 + (Math.max(0, ...data.nodes.map((n) => n.depth)) + 1) * DEPTH_INDENT;
  const diagramHeight = PADDING * 2 + data.nodes.length * ROW_HEIGHT;

  const legend = buildLegend(styles, diagramWidth, diagramHeight);
  const width = Math.max(diagramWidth, legend.width);
  const height = diagramHeight + legend.height;

  const edgeLines = data.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) {
        return '';
      }
      const x1 = from.x + 10;
      const y1 = from.y + NODE_HEIGHT;
      const x2 = to.x + 10;
      const y2 = to.y;
      return `<path class="edge" d="M ${x1} ${y1} L ${x1} ${(y1 + y2) / 2} L ${x2} ${(y1 + y2) / 2} L ${x2} ${y2}" fill="none" stroke="#888" stroke-width="1"/>`;
    })
    .join('\n  ');

  const nodeShapes = data.nodes
    .map((node) => {
      const pos = positions.get(node.id)!;
      const style = styles.get(node.id)!;
      const nodeClass = node.type === 'directory' ? 'node-directory' : 'node-file';
      return [
        `<rect class="${nodeClass}" x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="4" fill="${style.color}" />`,
        `<text class="node-label" x="${pos.x + 8}" y="${pos.y + NODE_HEIGHT / 2 + 4}" font-family="sans-serif" font-size="12" fill="${contrastText(style.color)}">${node.label.length > MAX_LABEL_CHARS ? `<title>${escapeXml(node.label)}</title>` : ''}${escapeXml(truncateLabel(node.label))}</text>`
      ].join('\n  ');
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect class="diagram-bg" width="${width}" height="${height}" fill="#ffffff" />
  ${edgeLines}
  ${nodeShapes}
  ${legend.markup}
</svg>
`;
}

/**
 * Builds a wrapped legend row for whichever node categories actually appear
 * in the diagram (never all eight — only what's on screen), placed below the
 * tree so exported SVG/PNG files stay self-explanatory.
 */
function buildLegend(
  styles: Map<string, NodeStyle>,
  containerWidth: number,
  offsetY: number
): { markup: string; width: number; height: number } {
  const seen = new Map<string, NodeStyle>();
  for (const style of styles.values()) {
    if (!seen.has(style.key)) {
      seen.set(style.key, style);
    }
  }
  if (seen.size === 0) {
    return { markup: '', width: 0, height: 0 };
  }

  const items = Array.from(seen.values());
  const columns = Math.max(1, Math.floor(containerWidth / LEGEND_ITEM_WIDTH));
  const rows = Math.ceil(items.length / columns);

  const markup = items
    .map((item, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = PADDING + col * LEGEND_ITEM_WIDTH;
      const y = LEGEND_TOP_MARGIN + row * LEGEND_ROW_HEIGHT;
      return [
        `<rect x="${x}" y="${y}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" rx="2" fill="${item.color}" />`,
        `<text x="${x + LEGEND_SWATCH + 6}" y="${y + LEGEND_SWATCH - 2}" font-family="sans-serif" font-size="11" class="legend-label">${escapeXml(item.label)}</text>`
      ].join('\n  ');
    })
    .join('\n  ');

  return {
    markup: `<g class="legend" transform="translate(0, ${offsetY})">${markup}</g>`,
    width: PADDING * 2 + columns * LEGEND_ITEM_WIDTH,
    height: LEGEND_TOP_MARGIN + rows * LEGEND_ROW_HEIGHT
  };
}

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
