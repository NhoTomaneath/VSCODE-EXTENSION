import { renderDiagramAsSvg } from './svgRenderer';
import { DiagramData } from './types';

describe('renderDiagramAsSvg', () => {
  it('produces a well-formed SVG document containing one shape per node', () => {
    const data: DiagramData = {
      nodes: [
        { id: '.', label: 'root', depth: 0, type: 'directory' },
        { id: 'src', label: 'src', parentId: '.', depth: 1, type: 'directory' }
      ],
      edges: [{ from: '.', to: 'src' }]
    };

    const svg = renderDiagramAsSvg(data);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2); // background + 1 per node
    expect(svg).toContain('>root<');
    expect(svg).toContain('>src<');
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
  });

  it('escapes XML-unsafe characters in labels', () => {
    const data: DiagramData = { nodes: [{ id: 'a<b>', label: 'a<b>&"\'', depth: 0, type: 'file' }], edges: [] };

    const svg = renderDiagramAsSvg(data);

    expect(svg).toContain('a&lt;b&gt;&amp;&quot;&apos;');
  });

  it('handles an empty diagram without throwing', () => {
    expect(() => renderDiagramAsSvg({ nodes: [], edges: [] })).not.toThrow();
  });
});

describe('long labels', () => {
  it('truncates labels that would overflow the node box and keeps the full name as a tooltip', () => {
    const longName = 'a-very-long-file-name-that-overflows.service.ts';
    const svg = renderDiagramAsSvg({
      nodes: [{ id: longName, label: longName, depth: 0, type: 'file' }],
      edges: []
    });

    expect(svg).toContain(`<title>${longName}</title>`);
    expect(svg).toContain('\u2026</text>');
  });
});
