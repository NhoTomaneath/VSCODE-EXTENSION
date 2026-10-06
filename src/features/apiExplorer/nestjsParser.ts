import { ApiEndpoint } from './types';
import { extractBodyFields } from './bodyFieldExtractor';

interface ControllerBlock {
  prefix: string;
  bodyText: string;
  /** 1-indexed line number where the controller class body begins. */
  startLine: number;
}

const METHOD_DECORATOR_PATTERN = /@(Get|Post|Put|Patch|Delete|Options|Head)\(([^)]*)\)/g;
const CONTROLLER_DECORATOR_PATTERN = /@Controller\(([^)]*)\)/g;
const STRING_LITERAL_PATTERN = /(['"`])([^'"`]*)\1/g;

/** All string literals in a decorator argument list: `'a'`, `['a', 'b']`; ignores other args like `version`. */
function pathLiterals(args: string): string[] {
  const objectPath = args.match(/\bpath\s*:\s*(\[[^\]]*\]|(['"`])[^'"`]*\2)/);
  const source = objectPath ? objectPath[1] : args.trim().startsWith('{') ? '' : args;
  return Array.from(source.matchAll(STRING_LITERAL_PATTERN), (m) => m[2]);
}

export function parseNestJsRoutes(text: string, filePath: string): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const block of findControllerBlocks(text)) {
    METHOD_DECORATOR_PATTERN.lastIndex = 0;
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = METHOD_DECORATOR_PATTERN.exec(block.bodyText))) {
      matches.push(match);
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const method = current[1].toUpperCase() as ApiEndpoint['method'];
      const subPaths = pathLiterals(current[2]);
      const lineOffset = block.bodyText.slice(0, current.index).split('\n').length - 1;
      // Bound the search window to the next method decorator (or end of the
      // controller body) so a later handler's @Body() can't leak into this one.
      const windowEnd = i + 1 < matches.length ? matches[i + 1].index : block.bodyText.length;
      const windowText = block.bodyText.slice(current.index, windowEnd);

      for (const subPath of subPaths.length > 0 ? subPaths : ['']) {
        endpoints.push({
          method,
          path: joinPaths(block.prefix, subPath),
          filePath,
          line: block.startLine + lineOffset,
          framework: 'nestjs',
          bodyFields: extractBodyFields(windowText)
        });
      }
    }
  }

  return endpoints;
}

function findControllerBlocks(text: string): ControllerBlock[] {
  const blocks: ControllerBlock[] = [];
  CONTROLLER_DECORATOR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CONTROLLER_DECORATOR_PATTERN.exec(text))) {
    const prefix = pathLiterals(match[1])[0] ?? '';
    const searchFrom = match.index + match[0].length;
    const openBraceIndex = text.indexOf('{', searchFrom);
    if (openBraceIndex === -1) {
      continue;
    }
    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    blocks.push({
      prefix,
      bodyText: text.slice(openBraceIndex + 1, closeBraceIndex),
      startLine: text.slice(0, openBraceIndex + 1).split('\n').length
    });
  }

  return blocks;
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function joinPaths(...parts: string[]): string {
  const segments = parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.length > 0);
  return '/' + segments.join('/');
}
