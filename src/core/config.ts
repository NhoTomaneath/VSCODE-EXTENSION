import * as fs from 'fs';
import * as path from 'path';

export interface DevCompanionConfig {
  provider: 'ollama';
  model: string;
  ollama_url: string;
  /** Host used when generating cURL commands in API Explorer. */
  apiBaseUrl: string;
}

/** Optional overlay (e.g. VS Code settings the user actually set). */
export type ConfigOverrides = Partial<DevCompanionConfig>;

export const DEFAULTS: DevCompanionConfig = {
  provider: 'ollama',
  model: 'qwen3:8b',
  ollama_url: 'http://127.0.0.1:11434',
  apiBaseUrl: 'http://localhost:3000'
};

/**
 * Loads config.json, checking the project root first and falling back to the
 * extension's own root. Missing file or fields fall back to defaults, so the
 * extension runs with zero required configuration.
 *
 * `overrides` (typically VS Code settings the user has explicitly set) win
 * over both config.json files.
 */
export function loadConfig(
  projectRoot?: string,
  extensionRoot?: string,
  overrides?: ConfigOverrides
): DevCompanionConfig {
  const candidates = [
    projectRoot ? path.join(projectRoot, 'config.json') : undefined,
    extensionRoot ? path.join(extensionRoot, 'config.json') : undefined
  ].filter((p): p is string => Boolean(p));

  let fromFiles: Partial<DevCompanionConfig> = {};
  // Project root wins over the extension's bundled config.json, so iterate
  // extension-first then overwrite with project-root if both exist.
  const ordered = [...candidates].reverse();
  for (const candidatePath of ordered) {
    const parsed = tryReadConfig(candidatePath);
    if (parsed) {
      fromFiles = { ...fromFiles, ...parsed };
    }
  }

  return sanitizeConfig({ ...DEFAULTS, ...fromFiles, ...compact(overrides) });
}

function compact(overrides?: ConfigOverrides): ConfigOverrides {
  if (!overrides) {
    return {};
  }
  const result: ConfigOverrides = {};
  (Object.keys(overrides) as Array<keyof DevCompanionConfig>).forEach((key) => {
    const value = overrides[key];
    if (value !== undefined && value !== '') {
      (result as Record<string, unknown>)[key] = value;
    }
  });
  return result;
}

function sanitizeConfig(config: DevCompanionConfig): DevCompanionConfig {
  return {
    provider: config.provider === 'ollama' ? 'ollama' : DEFAULTS.provider,
    model: typeof config.model === 'string' && config.model.trim() ? config.model.trim() : DEFAULTS.model,
    ollama_url:
      typeof config.ollama_url === 'string' && config.ollama_url.trim()
        ? config.ollama_url.trim()
        : DEFAULTS.ollama_url,
    apiBaseUrl:
      typeof config.apiBaseUrl === 'string' && config.apiBaseUrl.trim()
        ? config.apiBaseUrl.trim()
        : DEFAULTS.apiBaseUrl
  };
}

function tryReadConfig(filePath: string): Partial<DevCompanionConfig> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    if (typeof json !== 'object' || json === null) {
      return undefined;
    }
    const record = json as Record<string, unknown>;
    const parsed: Partial<DevCompanionConfig> = {};
    if (record.provider === 'ollama') {
      parsed.provider = 'ollama';
    }
    if (typeof record.model === 'string') {
      parsed.model = record.model;
    }
    if (typeof record.ollama_url === 'string') {
      parsed.ollama_url = record.ollama_url;
    }
    if (typeof record.apiBaseUrl === 'string') {
      parsed.apiBaseUrl = record.apiBaseUrl;
    }
    return parsed;
  } catch {
    // Malformed config.json falls back to defaults rather than crashing the
    // extension host.
    return undefined;
  }
}
