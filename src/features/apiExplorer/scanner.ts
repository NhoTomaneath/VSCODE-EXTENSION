import * as fs from 'fs';
import * as path from 'path';
import { walkFiles } from '../../core/fsWalk';
import { ApiEndpoint, ApiScanResult, ScanError } from './types';
import { ExpressRouteMatch, parseExpressRoutesWithReceivers, parseModuleImports, parseRouterMounts, RouterMount } from './expressParser';
import { parseNestJsRoutes } from './nestjsParser';

const SOURCE_EXTENSIONS = ['.ts', '.js'];
const RESOLVE_SUFFIXES = ['', '.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];
const MAX_MOUNT_DEPTH = 4;

interface ParsedFile {
  express: ExpressRouteMatch[];
  mounts: RouterMount[];
  imports: Map<string, string>;
}

/**
 * Scans a workspace for HTTP API endpoints. A failure reading or parsing any
 * single file is recorded as a scan error and does not abort the scan —
 * endpoints already found in other files are always preserved.
 *
 * Express `app.use('/prefix', router)` mounts are followed (within a file, and
 * across files via relative import/require) so reported paths include prefixes.
 */
export function scanWorkspaceForEndpoints(rootDir: string): ApiScanResult {
  const files = walkFiles(rootDir, { extensions: SOURCE_EXTENSIONS });
  const nestEndpoints: ApiEndpoint[] = [];
  const parsed = new Map<string, ParsedFile>();
  const errors: ScanError[] = [];

  for (const absoluteFilePath of files) {
    const relativeFilePath = path.relative(rootDir, absoluteFilePath).replace(/\\/g, '/');
    try {
      const text = fs.readFileSync(absoluteFilePath, 'utf8');
      parsed.set(relativeFilePath, {
        express: parseExpressRoutesWithReceivers(text, relativeFilePath),
        mounts: parseRouterMounts(text),
        imports: parseModuleImports(text)
      });
      nestEndpoints.push(...parseNestJsRoutes(text, relativeFilePath));
    } catch (err) {
      errors.push({ filePath: relativeFilePath, message: (err as Error).message });
    }
  }

  const filePrefixes = resolveFilePrefixes(parsed);
  const endpoints: ApiEndpoint[] = [];

  for (const [file, info] of parsed) {
    for (const { receiver, ...endpoint } of info.express) {
      // Prefix from a same-file mount of this specific router variable, if any.
      const sameFileMount = info.mounts.find((m) => m.identifier === receiver && !info.imports.has(receiver));
      const prefix = joinPaths(filePrefixes.get(file) ?? '', sameFileMount?.prefix ?? '');
      endpoints.push({ ...endpoint, path: prefix ? joinPaths(prefix, endpoint.path) : endpoint.path });
    }
  }
  endpoints.push(...nestEndpoints);

  return { endpoints, errors };
}

/** Prefix applied to every Express route in a file that is mounted by another file. */
function resolveFilePrefixes(parsed: Map<string, ParsedFile>): Map<string, string> {
  const known = new Set(parsed.keys());
  const prefixes = new Map<string, string>();

  for (let pass = 0; pass < MAX_MOUNT_DEPTH; pass++) {
    let changed = false;
    for (const [file, info] of parsed) {
      for (const mount of info.mounts) {
        const specifier = mount.requireSpecifier ?? (mount.identifier ? info.imports.get(mount.identifier) : undefined);
        const target = specifier ? resolveRelativeModule(file, specifier, known) : undefined;
        if (!target || target === file) {
          continue;
        }
        const next = joinPaths(prefixes.get(file) ?? '', mount.prefix);
        // Re-evaluated each pass so nested mounts pick up their parent's prefix once it is known.
        if (prefixes.get(target) !== next) {
          prefixes.set(target, next);
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return prefixes;
}

function resolveRelativeModule(fromFile: string, specifier: string, known: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  for (const suffix of RESOLVE_SUFFIXES) {
    if (known.has(base + suffix)) {
      return base + suffix;
    }
  }
  return undefined;
}

function joinPaths(...parts: string[]): string {
  const segments = parts.map((p) => p.replace(/^\/+|\/+$/g, '')).filter((p) => p.length > 0);
  return segments.length > 0 ? '/' + segments.join('/') : parts.some((p) => p.length > 0) ? '/' : '';
}
