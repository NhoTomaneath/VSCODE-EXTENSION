export interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
}

export type VulnerabilitySeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

export interface Vulnerability {
  name: string;
  severity: VulnerabilitySeverity;
  range?: string;
  fixAvailable?: boolean;
}

export interface DependencyAnalysisSummary {
  totalInstalledPackages: number;
  outdatedCount: number;
  criticalVulnerabilityCount: number;
}

export interface DependencyAnalysisResult {
  outdated: OutdatedPackage[];
  vulnerabilities: Vulnerability[];
  summary: DependencyAnalysisSummary;
  /** AI-generated summary of findings with suggested next steps, when available. */
  aiSummary?: string;
  /** Set when an AIProvider was supplied but the summary call failed (e.g. Ollama unreachable) — the rest of the report is still valid. */
  aiSummaryError?: string;
  /** Problems that make the report incomplete (npm failed, timed out, no package.json…). Never silently shown as "clean". */
  warnings: string[];
}

/** Injectable shell command runner, used so tests never invoke a real `npm` process. */
export interface CommandRunner {
  (command: string, cwd: string): Promise<{ stdout: string; stderr: string; timedOut?: boolean }>;
}
