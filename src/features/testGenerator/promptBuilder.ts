import { TestGenerationRequest } from './types';
import { deriveImportPath } from './naming';

/**
 * Builds the prompt sent to AIProvider. Asks for primary-behavior coverage
 * plus edge cases (boundary values, invalid input, null/undefined) in the
 * same pass, targeting Jest only.
 */
export function buildTestGenerationPrompt(request: TestGenerationRequest): string {
  return `You are generating a Jest unit test file for the TypeScript/JavaScript code below.

Source file: ${request.sourceFilePath}

Requirements:
- Target the Jest test framework only (describe/it/expect). No other test framework.
- Cover the primary behavior of every exported function, method, or class in the code.
- Also generate edge-case tests in the same file: boundary values, invalid input, and null/undefined handling.
- The test file is saved next to the source file, so import the code under test with exactly this path: '${deriveImportPath(request.sourceFilePath)}' (never ../src/... or any other path).
- Output ONLY the test file source code, with no explanation before or after it.
- Do not wrap the output in markdown code fences.

Source code:
\`\`\`
${request.sourceCode}
\`\`\`
`;
}
