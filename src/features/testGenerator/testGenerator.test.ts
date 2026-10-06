import { generateTests } from './testGenerator';
import { AIProvider } from '../../core/AIProvider';

function fakeProvider(responseText: string): AIProvider {
  return {
    name: 'fake',
    complete: jest.fn().mockResolvedValue({ text: responseText, model: 'fake-model' }),
    isAvailable: jest.fn().mockResolvedValue(true)
  };
}

describe('generateTests', () => {
  it('derives the test file path from the source file path', async () => {
    const provider = fakeProvider('describe("x", () => { it("works", () => { expect(true).toBe(true); }); });');

    const result = await generateTests(provider, { sourceCode: 'export const x = 1;', sourceFilePath: 'src/x.ts' });

    expect(result.testFilePath).toBe('src/x.test.ts');
  });

  it('strips markdown code fences from the AI response', async () => {
    const provider = fakeProvider('```ts\ndescribe("x", () => {});\n```');

    const result = await generateTests(provider, { sourceCode: 'export const x = 1;', sourceFilePath: 'src/x.ts' });

    expect(result.content.trim()).toBe('describe("x", () => {});');
  });

  it('leaves plain (non-fenced) responses untouched aside from trimming', async () => {
    const provider = fakeProvider('  describe("x", () => {});  ');

    const result = await generateTests(provider, { sourceCode: 'export const x = 1;', sourceFilePath: 'src/x.ts' });

    expect(result.content).toBe('describe("x", () => {});\n');
  });

  it('passes the source code and file path into the prompt sent to AIProvider', async () => {
    const provider = fakeProvider('test code');

    await generateTests(provider, { sourceCode: 'export function add(a, b) { return a + b; }', sourceFilePath: 'src/add.ts' });

    const promptArg = (provider.complete as jest.Mock).mock.calls[0][0] as string;
    expect(promptArg).toContain('src/add.ts');
    expect(promptArg).toContain('export function add(a, b) { return a + b; }');
    expect(promptArg).toContain('boundary values');
    expect(promptArg).toContain('null/undefined');
  });

  it('extracts the fenced block when the model adds prose around it', async () => {
    const provider = fakeProvider('Here are your tests:\n```ts\ndescribe("x", () => {});\n```\nHope this helps!');

    const result = await generateTests(provider, { sourceCode: 'export const x = 1;', sourceFilePath: 'src/x.ts' });

    expect(result.content).toBe('describe("x", () => {});\n');
  });

  it('rejects an empty AI response instead of producing a blank test file', async () => {
    const provider = fakeProvider('   ');

    await expect(
      generateTests(provider, { sourceCode: 'export const x = 1;', sourceFilePath: 'src/x.ts' })
    ).rejects.toThrow(/empty response/);
  });
});

describe('import path correction', () => {
  it.each([
    "import { clamp } from '../src/utils/math';",
    "import { clamp } from '../math';",
    "import { clamp } from './math.ts';",
    "import { clamp } from './math';"
  ])('rewrites %s to ./math', async (importLine) => {
    const provider = fakeProvider(`${importLine}\ndescribe('x', () => {});`);

    const result = await generateTests(provider, { sourceCode: 'export const clamp = 1;', sourceFilePath: 'src/utils/math.ts' });

    expect(result.content).toContain("from './math';");
    expect(result.content).not.toContain('../');
  });

  it('leaves unrelated imports alone', async () => {
    const provider = fakeProvider("import { x } from '../other/mathematics';\nimport fs from 'fs';");

    const result = await generateTests(provider, { sourceCode: '', sourceFilePath: 'src/utils/math.ts' }).catch(() => undefined);

    expect(result?.content).toContain("'../other/mathematics'");
  });

  it('tells the model the exact import path in the prompt', async () => {
    const provider = fakeProvider('x');

    await generateTests(provider, { sourceCode: 'export const a = 1;', sourceFilePath: 'src/utils/math.ts' });

    expect((provider.complete as jest.Mock).mock.calls[0][0]).toContain("'./math'");
  });
});
