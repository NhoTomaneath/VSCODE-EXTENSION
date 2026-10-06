import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from '../../core/AIProvider';
import { walkFiles } from '../../core/fsWalk';
import { getOutdatedReport } from './npmOutdated';
import { getAuditReport } from './npmAudit';
import { buildSummary, generateFindingsSummary } from './summary';
import { CommandRunner, DependencyAnalysisResult } from './types';

/**
 * Runs the full dependency analysis: outdated packages, known
 * vulnerabilities, a results summary, and (when an AIProvider is supplied) an
 * AI-generated summary with suggested next steps.
 */
export async function analyzeDependencies(
  cwd: string,
  options: { aiProvider?: AIProvider; runCommand?: CommandRunner } = {}
): Promise<DependencyAnalysisResult> {
  const [outdatedReport, auditReport] = await Promise.all([
    getOutdatedReport(cwd, options.runCommand),
    getAuditReport(cwd, options.runCommand)
  ]);
  const outdated = outdatedReport.packages;

  const warnings = [outdatedReport.error, auditReport.error].filter((w): w is string => Boolean(w));
  const summary = buildSummary(outdated, auditReport.vulnerabilities, auditReport.totalInstalledPackages);

  let aiSummary: string | undefined;
  let aiSummaryError: string | undefined;
  if (options.aiProvider) {
    try {
      aiSummary = await generateFindingsSummary(options.aiProvider, outdated, auditReport.vulnerabilities);
    } catch (err) {
      // The npm-derived report above is already complete and useful on its
      // own — an unreachable AI provider should not discard it.
      aiSummaryError = (err as Error).message;
    }
  }

  return { outdated, vulnerabilities: auditReport.vulnerabilities, summary, aiSummary, aiSummaryError, warnings };
}

const MAX_PROJECTS = 5;

/** Directories (relative to root, '' = root) that contain a package.json, shallowest first. */
export function findNpmProjects(rootDir: string): string[] {
  const dirs = new Set<string>();
  if (fs.existsSync(path.join(rootDir, 'package.json'))) {
    dirs.add('');
  }
  for (const file of walkFiles(rootDir, { extensions: ['.json'], maxFiles: 20_000 })) {
    if (path.basename(file) === 'package.json') {
      dirs.add(path.relative(rootDir, path.dirname(file)).replace(/\\/g, '/'));
    }
  }
  return Array.from(dirs)
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))
    .slice(0, MAX_PROJECTS);
}

function depth(dir: string): number {
  return dir ? dir.split('/').length : 0;
}

/**
 * Analyzes every npm project found under `rootDir` (not just the root), merging
 * results; packages from nested projects are prefixed with their folder.
 */
export async function analyzeWorkspaceDependencies(
  rootDir: string,
  options: { aiProvider?: AIProvider; runCommand?: CommandRunner } = {}
): Promise<DependencyAnalysisResult> {
  const projects = findNpmProjects(rootDir);
  if (projects.length === 0) {
    return {
      outdated: [],
      vulnerabilities: [],
      summary: buildSummary([], [], 0),
      warnings: ['No package.json found in this workspace, so there is nothing to analyze.']
    };
  }

  const results = await Promise.all(
    projects.map(async (dir) => ({
      dir,
      result: await analyzeDependencies(dir ? path.join(rootDir, dir) : rootDir, { runCommand: options.runCommand })
    }))
  );

  const label = (dir: string, name: string) => (dir ? `${dir} › ${name}` : name);
  const outdated = results.flatMap(({ dir, result }) => result.outdated.map((p) => ({ ...p, name: label(dir, p.name) })));
  const vulnerabilities = results.flatMap(({ dir, result }) =>
    result.vulnerabilities.map((v) => ({ ...v, name: label(dir, v.name) }))
  );
  const total = results.reduce((sum, { result }) => sum + result.summary.totalInstalledPackages, 0);
  const warnings = results.flatMap(({ dir, result }) => result.warnings.map((w) => (dir ? `${dir}: ${w}` : w)));

  let aiSummary: string | undefined;
  let aiSummaryError: string | undefined;
  if (options.aiProvider) {
    try {
      aiSummary = await generateFindingsSummary(options.aiProvider, outdated, vulnerabilities);
    } catch (err) {
      aiSummaryError = (err as Error).message;
    }
  }

  return {
    outdated,
    vulnerabilities,
    summary: buildSummary(outdated, vulnerabilities, total),
    aiSummary,
    aiSummaryError,
    warnings
  };
}
