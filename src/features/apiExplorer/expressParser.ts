import { ApiEndpoint } from './types';
import { extractBodyFields } from './bodyFieldExtractor';

/**
 * Matches Express/Koa-router-style `app.get('/path', ...)`,
 * `router.post("/path", ...)` calls. Requires the path literal to start with
 * "/" to avoid false positives on unrelated `.get(key)`-style calls (e.g.
 * Map/cache lookups).
 */
const ROUTE_PATTERN = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|options|head)\s*\(\s*(['"`])(\/[^'"`]*)\3/i;

/** `router.route('/path')` — verbs are chained after it. */
const ROUTE_CHAIN_PATTERN = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\.route\s*\(\s*(['"`])(\/[^'"`]*)\2\s*\)/g;
const CHAINED_VERB_PATTERN = /\.(get|post|put|patch|delete|options|head)\s*\(/gi;

/** HTTP *client* objects — their `.get('/x')` calls consume APIs, they don't define routes. */
const CLIENT_RECEIVERS = new Set([
  'axios', 'http', 'https', 'request', 'superagent', 'got', 'ky', 'client', 'httpclient', '$http',
  'cy', 'agent', 'fetcher', 'needle', 'wretch'
]);

/** Variables created by `axios.create()` / `ky.create()` / `got.extend()` are clients too. */
const CLIENT_FACTORY_PATTERN = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:axios|ky|got|superagent)\s*\.\s*(?:create|extend)\s*\(/g;

const MAX_BODY_WINDOW_LINES = 40;
const MAX_CHAIN_CHARS = 800;

function findClientReceivers(text: string): Set<string> {
  const clients = new Set(CLIENT_RECEIVERS);
  CLIENT_FACTORY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLIENT_FACTORY_PATTERN.exec(text))) {
    clients.add(match[1].toLowerCase());
  }
  return clients;
}

export interface ExpressRouteMatch extends ApiEndpoint {
  /** Variable the route was declared on (e.g. `router`, `app`), used to apply `.use()` mount prefixes. */
  receiver: string;
}

export function parseExpressRoutes(text: string, filePath: string): ApiEndpoint[] {
  return parseExpressRoutesWithReceivers(text, filePath).map((match) => {
    const endpoint: ApiEndpoint = {
      method: match.method,
      path: match.path,
      filePath: match.filePath,
      line: match.line,
      framework: match.framework,
      bodyFields: match.bodyFields
    };
    return endpoint;
  });
}

export function parseExpressRoutesWithReceivers(text: string, filePath: string): ExpressRouteMatch[] {
  const lines = text.split(/\r?\n/);
  const clients = findClientReceivers(text);
  const matches: RawMatch[] = [];

  lines.forEach((lineText, idx) => {
    const match = ROUTE_PATTERN.exec(lineText);
    if (match && !clients.has(match[1].toLowerCase())) {
      matches.push({ line: idx + 1, method: match[2].toUpperCase(), path: match[4], receiver: match[1] });
    }
  });

  matches.push(...findChainedRoutes(text, clients));
  matches.sort((a, b) => a.line - b.line);

  return matches.map((match, i) => {
    const nextMatchLine = matches[i + 1]?.line;
    const windowEnd = nextMatchLine ? Math.max(match.line, nextMatchLine - 1) : Math.min(lines.length, match.line + MAX_BODY_WINDOW_LINES);
    const windowText = lines.slice(match.line - 1, windowEnd).join('\n');

    return {
      method: match.method as ApiEndpoint['method'],
      path: match.path,
      filePath,
      line: match.line,
      framework: 'express',
      bodyFields: extractBodyFields(windowText),
      receiver: match.receiver
    };
  });
}

interface RawMatch {
  line: number;
  method: string;
  path: string;
  receiver: string;
}

/** Handles `router.route('/x').get(...).post(...)`, including multi-line chains. */
function findChainedRoutes(text: string, clients: Set<string>): RawMatch[] {
  const results: RawMatch[] = [];
  ROUTE_CHAIN_PATTERN.lastIndex = 0;
  let route: RegExpExecArray | null;

  while ((route = ROUTE_CHAIN_PATTERN.exec(text))) {
    if (clients.has(route[1].toLowerCase())) {
      continue;
    }
    const chainStart = route.index + route[0].length;
    const semicolon = text.indexOf(';', chainStart);
    const chainEnd = Math.min(semicolon === -1 ? text.length : semicolon, chainStart + MAX_CHAIN_CHARS);
    const chain = text.slice(chainStart, chainEnd);

    CHAINED_VERB_PATTERN.lastIndex = 0;
    let verb: RegExpExecArray | null;
    while ((verb = CHAINED_VERB_PATTERN.exec(chain))) {
      const absoluteIndex = chainStart + verb.index;
      results.push({
        line: text.slice(0, absoluteIndex).split('\n').length,
        method: verb[1].toUpperCase(),
        path: route[3],
        receiver: route[1]
      });
    }
  }
  return results;
}

export interface RouterMount {
  prefix: string;
  /** Identifier passed to `.use()`, e.g. `usersRouter`; or a require() specifier for inline requires. */
  identifier?: string;
  requireSpecifier?: string;
}

const MOUNT_PATTERN = /\.use\s*\(\s*(['"`])(\/[^'"`]*)\1\s*,\s*(?:([A-Za-z_$][\w$]*)\s*[,)]|require\s*\(\s*(['"`])([^'"`]+)\4\s*\))/g;
const IMPORT_PATTERN = /import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+(['"`])([^'"`]+)\2/g;
const REQUIRE_PATTERN = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*(['"`])([^'"`]+)\2\s*\)/g;

/** `app.use('/api', router)` mounts, so the scanner can prefix the mounted router's routes. */
export function parseRouterMounts(text: string): RouterMount[] {
  const mounts: RouterMount[] = [];
  MOUNT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MOUNT_PATTERN.exec(text))) {
    mounts.push({ prefix: match[2], identifier: match[3], requireSpecifier: match[5] });
  }
  return mounts;
}

/** Maps imported/required identifiers to their module specifier (relative ones only matter). */
export function parseModuleImports(text: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const pattern of [IMPORT_PATTERN, REQUIRE_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      imports.set(match[1], match[3]);
    }
  }
  return imports;
}
