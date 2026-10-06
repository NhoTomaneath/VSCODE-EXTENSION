export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface RequestBodyField {
  name: string;
}

export interface ApiEndpoint {
  method: HttpMethod;
  /** Route path as written in source, e.g. "/api/users/:id". */
  path: string;
  /** File the route was discovered in, relative to the scan root. */
  filePath: string;
  /** 1-indexed line number of the route declaration. */
  line: number;
  framework: 'express' | 'nestjs';
  bodyFields: RequestBodyField[];
}

export interface ScanError {
  filePath: string;
  message: string;
}

export interface ApiScanResult {
  endpoints: ApiEndpoint[];
  /** Files that failed to scan. Partial results are always preserved. */
  errors: ScanError[];
}

/**
 * The stable contract exposed to the UI layer and, later, to F6
 * (Documentation Generator). F6 must consume this interface rather than
 * re-scanning the workspace itself.
 */
export interface ApiExplorerContract {
  getEndpoints(): ApiEndpoint[];
  getScanErrors(): ScanError[];
  /** Epoch ms of the most recent scan, if any — lets consumers detect stale data. */
  getScannedAt?(): number | undefined;
}
