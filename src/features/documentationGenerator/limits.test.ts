import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DocumentationCancelledError, generateDocumentation } from './documentationGenerator';
import { AIProvider } from '../../core/AIProvider';

function repoWithFunctions(count: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-companion-limits-'));
  const source = Array.from({ length: count }, (_, i) => `export function fn${i}() {}`).join('\n');
  fs.writeFileSync(path.join(root, 'many.ts'), source);
  return root;
}

function fakeProvider(): AIProvider {
  return {
    name: 'fake',
    complete: jest.fn().mockResolvedValue({ text: 'doc', model: 'fake' }),
    isAvailable: jest.fn().mockResolvedValue(true)
  };
}

describe('generateDocumentation limits', () => {
  it('caps AI calls at maxAiItems and reports what was skipped', async () => {
    const provider = fakeProvider();

    const result = await generateDocumentation({
      aiProvider: provider,
      rootDir: repoWithFunctions(10),
      endpoints: [],
      maxAiItems: 3
    });

    expect(provider.complete).toHaveBeenCalledTimes(3);
    expect(result.skipped).toEqual({ functions: 7, classes: 0 });
    expect(result.architectureGuideMarkdown).toContain('7 function(s) were not documented');
  });

  it('aborts with DocumentationCancelledError when cancelled', async () => {
    await expect(
      generateDocumentation({
        aiProvider: fakeProvider(),
        rootDir: repoWithFunctions(5),
        endpoints: [],
        isCancelled: () => true
      })
    ).rejects.toBeInstanceOf(DocumentationCancelledError);
  });

  it('reports progress after each item', async () => {
    const onProgress = jest.fn();

    await generateDocumentation({ aiProvider: fakeProvider(), rootDir: repoWithFunctions(2), endpoints: [], onProgress });

    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
