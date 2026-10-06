import { AIProvider } from '../../core/AIProvider';
import { buildTestGenerationPrompt } from './promptBuilder';
import { deriveImportPath, deriveTestFilePath } from './naming';
import { TestGenerationRequest, TestGenerationResult } from './types';

/**
 * Generates a Jest test file for the given source code via AIProvider.
 * This module has zero VS Code API dependency so it can be unit tested and
 * reused outside the extension host.
 */
export async function generateTests(
  aiProvider: AIProvider,
  request: TestGenerationRequest
): Promise<TestGenerationResult> {
  const prompt = buildTestGenerationPrompt(request);
  const { text } = await aiProvider.complete(prompt, {
    systemPrompt: 'You are an expert TypeScript/JavaScript test engineer who writes precise Jest tests.'
  });

  const content = stripMarkdownFences(text).trim();
  if (!content) {
    throw new Error('The AI model returned an empty response, so no tests were generated.');
  }

  return {
    testFilePath: deriveTestFilePath(request.sourceFilePath),
    content: fixSourceImport(content, request.sourceFilePath) + '\n'
  };
}

/**
 * Models often guess the import path (e.g. '../src/utils/math'). The test is
 * always written beside the source, so point any relative import whose last
 * segment is the source module at './<module>'.
 */
function fixSourceImport(testCode: string, sourceFilePath: string): string {
  const correct = deriveImportPath(sourceFilePath);
  const moduleName = correct.slice(2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const specifier = new RegExp(
    `(from\\s+|require\\(\\s*)(['"])\\.{1,2}/(?:[^'"]*/)?${moduleName}(?:\\.(?:tsx?|jsx?))?\\2`,
    'g'
  );
  return testCode.replace(specifier, (_match, lead: string, quote: string) => `${lead}${quote}${correct}${quote}`);
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:[a-zA-Z]*)\n([\s\S]*?)\n?```$/);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  // Models often add prose around the fenced block; keep just the first block.
  const embedded = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)\n?```/);
  return embedded ? embedded[1] : trimmed;
}
