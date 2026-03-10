import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { cp, mkdir, rename, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { app } from 'electron';

import type {
  AgentProvider,
  ChatModelPreference,
  CustomModelIds,
  OpenAIConfig
} from '../../shared/types/ipc';
import type { SkillManifest } from '../../shared/types/skill-manifest';
import { syncManifest } from './skill-manifest';

export type UpdateChannel = 'stable' | 'nightly';

export interface AppConfig {
  workspaceDir?: string;
  debugMode?: boolean;
  chatModelPreference?: ChatModelPreference | 'smart';
  apiKey?: string;
  apiBaseUrl?: string;
  updateChannel?: UpdateChannel;
  customModelId?: string; // Legacy single override — migrated to customModelIds
  customModelIds?: CustomModelIds;
  /** Active agent provider: 'anthropic' (default) or 'openai' */
  agentProvider?: AgentProvider;
  /** OpenAI provider configuration */
  openai?: OpenAIConfig;
}

const DEFAULT_MODEL_PREFERENCE: ChatModelPreference = 'fast';
const DEFAULT_SMART_MODEL: ChatModelPreference = 'smart-sonnet';

function normalizeChatModelPreference(
  preference?: ChatModelPreference | 'smart' | null
): ChatModelPreference {
  switch (preference) {
    case 'fast':
      return 'fast';
    case 'smart-opus':
      return 'smart-opus';
    case 'smart':
    case 'smart-sonnet':
      return DEFAULT_SMART_MODEL;
    default:
      return DEFAULT_MODEL_PREFERENCE;
  }
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): AppConfig {
  try {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      const data = readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return {};
}

export function saveConfig(config: AppConfig): void {
  try {
    writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

export function getApiKey(): string | null {
  const envApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envApiKey) {
    return envApiKey;
  }

  const storedApiKey = loadConfig().apiKey?.trim();
  return storedApiKey || null;
}

export function setApiKey(apiKey: string | null): void {
  const config = loadConfig();
  if (apiKey && apiKey.trim()) {
    config.apiKey = apiKey.trim();
  } else {
    delete config.apiKey;
  }
  saveConfig(config);
}

export function getApiBaseUrl(): string | null {
  const envBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl;
  }
  const storedBaseUrl = loadConfig().apiBaseUrl?.trim();
  return storedBaseUrl || null;
}

export function setApiBaseUrl(url: string | null): void {
  const config = loadConfig();
  if (url && url.trim()) {
    config.apiBaseUrl = url.trim();
  } else {
    delete config.apiBaseUrl;
  }
  saveConfig(config);
}

function getApiKeyLastFour(key: string | null | undefined): string | null {
  if (!key) {
    return null;
  }
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(-4);
}

export function getApiKeyStatus(): {
  configured: boolean;
  source: 'env' | 'local' | null;
  lastFour: string | null;
} {
  const envApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envApiKey) {
    return { configured: true, source: 'env', lastFour: getApiKeyLastFour(envApiKey) };
  }

  const storedApiKey = loadConfig().apiKey?.trim();
  if (storedApiKey) {
    return { configured: true, source: 'local', lastFour: getApiKeyLastFour(storedApiKey) };
  }

  return { configured: false, source: null, lastFour: null };
}

export function getWorkspaceDir(): string {
  const config = loadConfig();
  if (config.workspaceDir) {
    return config.workspaceDir;
  }
  // Default to Desktop/ma-agent
  return join(app.getPath('desktop'), 'ma-agent');
}

export function getDebugMode(): boolean {
  const config = loadConfig();
  return config.debugMode ?? false; // Default to false
}

export function getChatModelPreferenceSetting(): ChatModelPreference {
  const config = loadConfig();
  return normalizeChatModelPreference(config.chatModelPreference);
}

export function setChatModelPreferenceSetting(preference: ChatModelPreference): void {
  const config = loadConfig();
  config.chatModelPreference = normalizeChatModelPreference(preference);
  saveConfig(config);
}

export function getBundledGitPath(): string | null {
  // Return the path to the bundled Git directory (Windows only)
  // In development: resources/git-portable in project root
  // In production: resources/ is at the app bundle root
  if (process.platform !== 'win32') {
    return null; // Only Windows has bundled Git
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    // In dev, resources/ is in the project root
    return join(app.getAppPath(), 'resources', 'git-portable');
  } else {
    // In production, resources/ is at the app bundle root
    return join(process.resourcesPath, 'git-portable');
  }
}

export function getBundledMsys2Path(): string | null {
  // Return the path to the bundled MSYS2 directory (Windows only)
  // MSYS2 provides bash, awk, sed, and other unix utilities
  // In development: resources/msys2 in project root
  // In production: resources/ is at the app bundle root
  if (process.platform !== 'win32') {
    return null; // Only Windows has bundled MSYS2
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    // In dev, resources/ is in the project root
    return join(app.getAppPath(), 'resources', 'msys2');
  } else {
    // In production, resources/ is at the app bundle root
    return join(process.resourcesPath, 'msys2');
  }
}

/**
 * Checks if a bash.exe path is from MSYS2 (as opposed to Git Bash).
 * MSYS2 bash needs special environment variables to properly inherit Windows env vars.
 */
export function isMsys2Bash(bashExePath: string | null): boolean {
  if (!bashExePath || process.platform !== 'win32') {
    return false;
  }

  const normalizedPath = resolve(bashExePath).toLowerCase();

  // Check if it's the bundled MSYS2 bash
  const bundledMsys2Path = getBundledMsys2Path();
  if (bundledMsys2Path) {
    const msys2BashExe = resolve(join(bundledMsys2Path, 'usr', 'bin', 'bash.exe')).toLowerCase();
    if (normalizedPath === msys2BashExe) {
      return true;
    }
  }

  // Check if path contains 'msys2' or 'msys64' (common MSYS2 installation paths)
  return normalizedPath.includes('msys2') || normalizedPath.includes('msys64');
}

/**
 * Finds the path to bash.exe for Claude Code on Windows.
 * Checks bundled Git, bundled MSYS2, and system Git installations in order.
 * Returns null if bash.exe cannot be found.
 */
export function getBashExePath(): string | null {
  if (process.platform !== 'win32') {
    return null; // Only needed on Windows
  }

  // 1. Check bundled Git (git-portable/usr/bin/bash.exe)
  const bundledGitPath = getBundledGitPath();
  if (bundledGitPath) {
    const gitBashExe = join(bundledGitPath, 'usr', 'bin', 'bash.exe');
    if (existsSync(gitBashExe)) {
      return resolve(gitBashExe);
    }
  }

  // 2. Check bundled MSYS2 (msys2/usr/bin/bash.exe)
  const bundledMsys2Path = getBundledMsys2Path();
  if (bundledMsys2Path) {
    const msys2BashExe = join(bundledMsys2Path, 'usr', 'bin', 'bash.exe');
    if (existsSync(msys2BashExe)) {
      return resolve(msys2BashExe);
    }
  }

  // 3. Check common system Git installation paths
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] || process.env.PROGRAMFILES_X86 || 'C:\\Program Files (x86)';

  const commonGitPaths = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe')
  ];

  for (const gitBashPath of commonGitPaths) {
    if (existsSync(gitBashPath)) {
      return resolve(gitBashPath);
    }
  }

  // 4. Check if bash.exe is in PATH
  const pathEntries = (process.env.PATH || '').split(';');
  for (const pathEntry of pathEntries) {
    const bashExe = join(pathEntry.trim(), 'bash.exe');
    if (existsSync(bashExe)) {
      return resolve(bashExe);
    }
  }

  return null;
}

/**
 * Builds an enhanced PATH that includes bundled binaries (git, msys2 on Windows)
 * and filters out duplicates from the user's existing PATH.
 * This ensures consistent PATH setup for both the Electron app and Claude Agent SDK.
 */
export function buildEnhancedPath(): string {
  const pathSeparator = process.platform === 'win32' ? ';' : ':';

  const bundledBinDirs: string[] = [];

  // Add Git paths (Windows only)
  const bundledGitPath = getBundledGitPath();
  if (bundledGitPath) {
    const gitPaths = ['bin', 'mingw64/bin', 'cmd']
      .map((subpath) => resolve(join(bundledGitPath, subpath)))
      .filter((p) => existsSync(p));
    bundledBinDirs.push(...gitPaths);
  }

  // Add MSYS2 paths (Windows only)
  const bundledMsys2Path = getBundledMsys2Path();
  if (bundledMsys2Path) {
    const msys2Paths = ['usr/bin', 'mingw64/bin']
      .map((subpath) => resolve(join(bundledMsys2Path, subpath)))
      .filter((p) => existsSync(p));
    bundledBinDirs.push(...msys2Paths);
  }

  // Normalize paths for comparison (case-insensitive on Windows)
  const normalize = (p: string): string => {
    const normalized = resolve(p);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };

  const bundledPathsSet = new Set(bundledBinDirs.map(normalize));

  // Filter out bundled paths from user PATH to avoid duplicates
  const userPathEntries = (process.env.PATH || '').split(pathSeparator).filter((entry) => {
    const trimmed = entry.trim();
    return trimmed && !bundledPathsSet.has(normalize(trimmed));
  });

  // Combine: bundled binaries first, then user PATH
  return [...bundledBinDirs, ...userPathEntries].join(pathSeparator);
}

/**
 * Builds the complete environment object used by Claude Agent SDK query sessions.
 * This ensures consistency across the Electron app, Claude Agent SDK, and debug panel.
 *
 * The environment includes:
 * - All process.env variables
 * - ANTHROPIC_API_KEY (from env or local config)
 * - PATH (enhanced with bundled binaries)
 * - CLAUDE_CODE_GIT_BASH_PATH (Windows only, if bash.exe found)
 * - MSYSTEM, MSYS2_PATH_TYPE, and HOME (Windows only, if MSYS2 bash detected - required for PATH inheritance and cwd)
 * - DEBUG (if debug mode enabled)
 */
export function buildClaudeSessionEnv(): Record<string, string> {
  const enhancedPath = buildEnhancedPath();
  const apiKey = getApiKey();
  const workspaceDir = getWorkspaceDir();

  const env: Record<string, string> = {
    ...process.env,
    PATH: enhancedPath
  };

  // Add API key if available
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  // Add custom base URL if configured
  const baseUrl = getApiBaseUrl();
  if (baseUrl) {
    env.ANTHROPIC_BASE_URL = baseUrl;
  }

  // Set CLAUDE_CODE_GIT_BASH_PATH for Windows (required by Claude Code)
  if (process.platform === 'win32') {
    const bashExePath = getBashExePath();
    if (bashExePath) {
      env.CLAUDE_CODE_GIT_BASH_PATH = bashExePath;

      // MSYS2 bash requires special environment variables to properly inherit
      // Windows environment variables and PATH. Without these, env vars and binaries
      // passed to the SDK won't be available inside the bash session.
      if (isMsys2Bash(bashExePath)) {
        // MSYSTEM tells MSYS2 which environment to use (MSYS, MINGW64, etc.)
        env.MSYSTEM = 'MSYS';
        // MSYS2_PATH_TYPE=inherit ensures Windows PATH is inherited and converted properly
        env.MSYS2_PATH_TYPE = 'inherit';
        // HOME set to workspace directory ensures bash starts in the correct cwd
        // MSYS2 will automatically convert Windows paths to Unix-style paths
        env.HOME = resolve(workspaceDir);
      }
    }
  }

  // Enable debug mode if configured
  if (getDebugMode()) {
    env.DEBUG = '1';
  }

  return env;
}

/**
 * Read user-customized manifest fields (shared, tags) from workspace skills
 * before skills are overwritten, so we can restore them after sync.
 */
function collectUserManifestSettings(
  skillsDir: string
): Map<string, Pick<SkillManifest, 'shared' | 'tags'>> {
  const settings = new Map<string, Pick<SkillManifest, 'shared' | 'tags'>>();
  if (!existsSync(skillsDir)) return settings;

  try {
    const entries = readdirSync(skillsDir).filter((name) => {
      const fullPath = join(skillsDir, name);
      return statSync(fullPath).isDirectory();
    });

    for (const skillName of entries) {
      const manifestPath = join(skillsDir, skillName, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillManifest;
        settings.set(manifest.id, { shared: manifest.shared, tags: manifest.tags });
      } catch {
        // Skip invalid manifest files
      }
    }
  } catch {
    // Skip if we can't read the directory
  }

  return settings;
}

/**
 * Restore user-customized manifest fields after workspace sync.
 */
function restoreUserManifestSettings(
  skillsDir: string,
  settings: Map<string, Pick<SkillManifest, 'shared' | 'tags'>>
): void {
  if (settings.size === 0 || !existsSync(skillsDir)) return;

  try {
    const entries = readdirSync(skillsDir).filter((name) => {
      const fullPath = join(skillsDir, name);
      return statSync(fullPath).isDirectory();
    });

    for (const skillName of entries) {
      const manifestPath = join(skillsDir, skillName, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillManifest;
        const saved = settings.get(manifest.id);
        if (saved) {
          manifest.shared = saved.shared;
          manifest.tags = saved.tags;
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        }
      } catch {
        // Skip invalid manifest files
      }
    }
  } catch {
    // Skip if we can't read the directory
  }
}

export function getCustomModelId(): string | null {
  const config = loadConfig();
  return config.customModelId?.trim() || null;
}

export function setCustomModelId(modelId: string | null): void {
  const config = loadConfig();
  if (modelId && modelId.trim()) {
    config.customModelId = modelId.trim();
  } else {
    delete config.customModelId;
  }
  saveConfig(config);
}

export function getCustomModelIds(): CustomModelIds {
  const config = loadConfig();
  return config.customModelIds ?? {};
}

export function setCustomModelIds(ids: CustomModelIds): void {
  const config = loadConfig();
  // Clean empty strings
  const cleaned: CustomModelIds = {};
  for (const [key, value] of Object.entries(ids)) {
    const trimmed = value?.trim();
    if (trimmed) {
      cleaned[key as ChatModelPreference] = trimmed;
    }
  }
  if (Object.keys(cleaned).length > 0) {
    config.customModelIds = cleaned;
  } else {
    delete config.customModelIds;
  }
  saveConfig(config);
}

export function getAgentProvider(): AgentProvider {
  const config = loadConfig();
  return config.agentProvider === 'openai' ? 'openai' : 'anthropic';
}

export function setAgentProvider(provider: AgentProvider): void {
  const config = loadConfig();
  config.agentProvider = provider;
  saveConfig(config);
}

export function getOpenAIConfig(): OpenAIConfig {
  const config = loadConfig();
  return config.openai ?? {};
}

export function setOpenAIConfig(openaiConfig: OpenAIConfig): void {
  const config = loadConfig();
  const cleaned: OpenAIConfig = {};
  if (openaiConfig.apiKey?.trim()) cleaned.apiKey = openaiConfig.apiKey.trim();
  if (openaiConfig.baseUrl?.trim()) cleaned.baseUrl = openaiConfig.baseUrl.trim();
  if (openaiConfig.modelId?.trim()) cleaned.modelId = openaiConfig.modelId.trim();
  if (Object.keys(cleaned).length > 0) {
    config.openai = cleaned;
  } else {
    delete config.openai;
  }
  saveConfig(config);
}

export function getOpenAIApiKey(): string | null {
  const envApiKey = process.env.OPENAI_API_KEY?.trim();
  if (envApiKey) return envApiKey;
  const storedKey = loadConfig().openai?.apiKey?.trim();
  return storedKey || null;
}

export function getOpenAIBaseUrl(): string | null {
  const envBaseUrl = process.env.OPENAI_BASE_URL?.trim();
  if (envBaseUrl) return envBaseUrl;
  const storedUrl = loadConfig().openai?.baseUrl?.trim();
  return storedUrl || null;
}

export function getOpenAIModelId(): string | null {
  const storedId = loadConfig().openai?.modelId?.trim();
  return storedId || null;
}

export function getUpdateChannel(): UpdateChannel {
  const config = loadConfig();
  return config.updateChannel === 'nightly' ? 'nightly' : 'stable';
}

export function setUpdateChannel(channel: UpdateChannel): void {
  const config = loadConfig();
  config.updateChannel = channel === 'nightly' ? 'nightly' : 'stable';
  saveConfig(config);
}

export async function ensureWorkspaceDir(): Promise<void> {
  const workspaceDir = getWorkspaceDir();

  // Migrate from old default workspace (claude-agent) to new default (ma-agent)
  if (!existsSync(workspaceDir)) {
    const oldDefault = join(app.getPath('desktop'), 'claude-agent');
    if (workspaceDir === join(app.getPath('desktop'), 'ma-agent') && existsSync(oldDefault)) {
      await rename(oldDefault, workspaceDir);
      console.log(`Migrated workspace from ${oldDefault} to ${workspaceDir}`);
    } else {
      await mkdir(workspaceDir, { recursive: true });
    }
  }

  // Sync .claude directory to workspace, preserving user-installed skills
  try {
    const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL;
    const sourceClaudeDir =
      isDev ?
        join(app.getAppPath(), 'out', '.claude')
      : join(process.resourcesPath, 'app.asar.unpacked', 'out', '.claude');

    if (!existsSync(sourceClaudeDir)) {
      console.warn(`Could not find .claude directory at ${sourceClaudeDir}`);
      return;
    }

    const destClaudeDir = join(workspaceDir, '.claude');
    await mkdir(destClaudeDir, { recursive: true });

    // Sync non-skills files from .claude/ (e.g., CLAUDE.md, settings)
    const sourceTopLevel = readdirSync(sourceClaudeDir, { withFileTypes: true });
    for (const entry of sourceTopLevel) {
      if (entry.name === 'skills') continue;
      const src = join(sourceClaudeDir, entry.name);
      const dest = join(destClaudeDir, entry.name);
      await cp(src, dest, { recursive: true, force: true });
    }

    // Sync built-in skills, preserving user-installed skills
    const sourceSkillsDir = join(sourceClaudeDir, 'skills');
    if (existsSync(sourceSkillsDir)) {
      const destSkillsDir = join(destClaudeDir, 'skills');
      await mkdir(destSkillsDir, { recursive: true });

      // Preserve user manifest settings before overwriting built-in skills
      const userSettings = collectUserManifestSettings(destSkillsDir);

      const sourceSkills = readdirSync(sourceSkillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => existsSync(join(sourceSkillsDir, entry.name, '.builtin')));

      const sourceSkillNames = new Set(sourceSkills.map((s) => s.name));

      // Sync each built-in skill
      for (const skill of sourceSkills) {
        const destSkillDir = join(destSkillsDir, skill.name);
        if (existsSync(destSkillDir) && !existsSync(join(destSkillDir, '.builtin'))) {
          // Migration: if this skill exists in source as builtin, treat legacy dest as builtin too
          if (sourceSkillNames.has(skill.name)) {
            console.log(`  Migrating legacy built-in skill: ${skill.name}`);
          } else {
            console.log(`  Skipping "${skill.name}": user-installed skill with same name`);
            continue;
          }
        }
        try {
          // Copy to temp dir first, then swap to avoid data loss on copy failure
          const tempDir = `${destSkillDir}.tmp`;
          if (existsSync(tempDir)) {
            await rm(tempDir, { recursive: true, force: true });
          }
          await cp(join(sourceSkillsDir, skill.name), tempDir, { recursive: true });
          if (existsSync(destSkillDir)) {
            await rm(destSkillDir, { recursive: true, force: true });
          }
          await rename(tempDir, destSkillDir);
          console.log(`  Synced built-in skill: ${skill.name}`);
        } catch (skillError) {
          console.error(`  Failed to sync skill "${skill.name}":`, skillError);
        }
      }

      // Restore user manifest settings after overwriting
      restoreUserManifestSettings(destSkillsDir, userSettings);

      // Sync manifests for all skills (generate if missing, update if SKILL.md changed)
      try {
        const allSkillDirs = readdirSync(destSkillsDir).filter((name) =>
          statSync(join(destSkillsDir, name)).isDirectory()
        );
        for (const skillName of allSkillDirs) {
          syncManifest(join(destSkillsDir, skillName), skillName);
        }
      } catch (err) {
        console.warn('Failed to sync skill manifests:', err);
      }

      // Clean up stale built-in skills that are no longer shipped
      if (existsSync(destSkillsDir)) {
        const destSkills = readdirSync(destSkillsDir, { withFileTypes: true }).filter((entry) =>
          entry.isDirectory()
        );
        for (const skill of destSkills) {
          if (
            existsSync(join(destSkillsDir, skill.name, '.builtin')) &&
            !sourceSkillNames.has(skill.name)
          ) {
            await rm(join(destSkillsDir, skill.name), { recursive: true, force: true });
            console.log(`  Removed stale built-in skill: ${skill.name}`);
          }
        }
      }

      console.log('Built-in skills synced successfully');
    }
  } catch (error) {
    console.error('Failed to sync .claude directory:', error);
  }
}
