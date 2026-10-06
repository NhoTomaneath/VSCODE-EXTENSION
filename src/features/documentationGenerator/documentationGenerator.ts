import { AIProvider } from '../../core/AIProvider';
import { mapWithConcurrency } from '../../core/concurrency';
import { ApiEndpoint } from '../apiExplorer/types';
import { FolderTreeNode } from '../architectureVisualization/types';
import { generateApiDocumentation } from './apiDocGenerator';
import { generateArchitectureSummary, renderTreeAsText } from './architectureDocGenerator';
import { generateFunctionDoc } from './functionDocGenerator';
import { generateClassDoc } from './classDocGenerator';
import { scanWorkspaceSignatures } from './sourceScanner';
import { computeSummaryCount } from './summaryCount';
import { ClassSignature, DocumentationSummaryCount, FunctionSignature } from './types';

export interface GenerateDocumentationOptions {
  aiProvider: AIProvider;
  /** Workspace root, used only to parse source files for function/class docs. */
  rootDir: string;
  /** F2's already-discovered endpoints — consumed as data, never re-scanned. */
  endpoints: ApiEndpoint[];
  /** F3's already-collected folder tree — consumed as data, never re-traversed. */
  folderTree?: FolderTreeNode;
  /** Max concurrent AI calls for per-function/per-class doc generation. */
  concurrency?: number;
  /**
   * Cap on per-function/per-class AI calls so a huge repo can't run for hours
   * on a local model. Classes and exported functions are documented first.
   */
  maxAiItems?: number;
  /** Polled between AI calls; return true to abort (generation then throws). */
  isCancelled?: () => boolean;
  /** Called after each per-function/per-class doc finishes. */
  onProgress?: (done: number, total: number) => void;
}

export const DEFAULT_MAX_AI_ITEMS = 40;

export class DocumentationCancelledError extends Error {
  constructor() {
    super('Documentation generation was cancelled.');
    this.name = 'DocumentationCancelledError';
  }
}

export interface GenerateDocumentationResult {
  apiDocumentationMarkdown: string;
  architectureGuideMarkdown: string;
  summaryCount: DocumentationSummaryCount;
  /** Functions/classes found but not sent to the AI because of `maxAiItems`. */
  skipped: { functions: number; classes: number };
}

export async function generateDocumentation(
  options: GenerateDocumentationOptions
): Promise<GenerateDocumentationResult> {
  const concurrency = options.concurrency ?? 2;

  const apiDocumentationMarkdown = generateApiDocumentation(options.endpoints);
  const { functions: allFunctions, classes: allClasses } = scanWorkspaceSignatures(options.rootDir);

  // Classes first, then exported functions, then the rest, up to the cap.
  const maxItems = options.maxAiItems ?? DEFAULT_MAX_AI_ITEMS;
  const classes = allClasses.slice(0, maxItems);
  const functionBudget = Math.max(0, maxItems - classes.length);
  const functions = [...allFunctions].sort((a, b) => Number(b.isExported) - Number(a.isExported)).slice(0, functionBudget);
  const skipped = { functions: allFunctions.length - functions.length, classes: allClasses.length - classes.length };

  const total = functions.length + classes.length;
  let done = 0;
  const step = async <T>(work: () => Promise<T>): Promise<T> => {
    if (options.isCancelled?.()) {
      throw new DocumentationCancelledError();
    }
    const value = await work();
    options.onProgress?.(++done, total);
    return value;
  };

  const [functionDocs, classDocs, architectureSummary] = await Promise.all([
    mapWithConcurrency(functions, concurrency, (fn) =>
      step(async () => ({ fn, doc: await generateFunctionDoc(options.aiProvider, fn) }))
    ),
    mapWithConcurrency(classes, concurrency, (cls) =>
      step(async () => ({ cls, doc: await generateClassDoc(options.aiProvider, cls) }))
    ),
    options.folderTree ? generateArchitectureSummary(options.aiProvider, options.folderTree) : Promise.resolve('')
  ]);

  if (options.isCancelled?.()) {
    throw new DocumentationCancelledError();
  }

  const architectureGuideMarkdown = buildArchitectureGuideMarkdown(
    architectureSummary,
    options.folderTree,
    classDocs,
    functionDocs,
    skipped
  );

  const summaryCount = computeSummaryCount(options.endpoints, functions, classes);

  return { apiDocumentationMarkdown, architectureGuideMarkdown, summaryCount, skipped };
}

function buildArchitectureGuideMarkdown(
  architectureSummary: string,
  folderTree: FolderTreeNode | undefined,
  classDocs: Array<{ cls: ClassSignature; doc: string }>,
  functionDocs: Array<{ fn: FunctionSignature; doc: string }>,
  skipped: { functions: number; classes: number }
): string {
  const lines: string[] = ['# Architecture Guide', ''];

  if (folderTree) {
    lines.push('## Overview', '', architectureSummary || '_No AI summary available._', '');
    lines.push('## Folder Structure', '', '```', renderTreeAsText(folderTree), '```', '');
  } else {
    lines.push(
      '## Overview',
      '',
      '_No folder hierarchy data available. Run "Dev Companion: Visualize Architecture" first for a full architecture summary._',
      ''
    );
  }

  if (classDocs.length > 0) {
    lines.push('## Classes', '');
    for (const { cls, doc } of classDocs) {
      lines.push(`### \`${cls.name}\` (${cls.filePath}:${cls.line})`, '', doc, '');
    }
  }

  if (functionDocs.length > 0) {
    lines.push('## Functions', '');
    for (const { fn, doc } of functionDocs) {
      lines.push(`### \`${fn.name}(${fn.params.join(', ')})\` (${fn.filePath}:${fn.line})`, '', doc, '');
    }
  }

  if (skipped.functions > 0 || skipped.classes > 0) {
    lines.push(
      `_${skipped.classes} class(es) and ${skipped.functions} function(s) were not documented to keep generation time reasonable (AI call limit reached)._`,
      ''
    );
  }

  return lines.join('\n');
}
