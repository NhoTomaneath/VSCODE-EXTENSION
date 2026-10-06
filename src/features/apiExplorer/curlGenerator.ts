import { ApiEndpoint } from './types';

export interface CurlGeneratorOptions {
  baseUrl?: string;
  /**
   * `posix` (default) uses single quotes for bash/zsh. `windows` uses `curl.exe`
   * with double quotes, which works in both PowerShell (where plain `curl` is an
   * alias for Invoke-WebRequest) and cmd.exe (which has no single-quote quoting).
   */
  style?: 'posix' | 'windows';
}

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteWindows(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Generates a cURL command for an endpoint, reflecting method, path, and any
 * detected request body fields (as an empty-value JSON template).
 */
export function generateCurlCommand(endpoint: ApiEndpoint, options: CurlGeneratorOptions = {}): string {
  const quote = options.style === 'windows' ? quoteWindows : quotePosix;
  const baseUrl = (options.baseUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
  const url = `${baseUrl}${endpoint.path}`;
  const parts = [options.style === 'windows' ? 'curl.exe' : 'curl', '-X', endpoint.method, quote(url)];

  if (endpoint.bodyFields.length > 0 && !METHODS_WITHOUT_BODY.has(endpoint.method)) {
    const bodyTemplate = Object.fromEntries(endpoint.bodyFields.map((field) => [field.name, '']));
    parts.push('-H', quote('Content-Type: application/json'), '-d', quote(JSON.stringify(bodyTemplate)));
  }

  return parts.join(' ');
}
