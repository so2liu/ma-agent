// Skill manifest types for sharing, import/export, and LAN discovery
// Compatible with Agent Skills spec (agentskills.io) and ClawHub

/** Slug format: lowercase alphanumeric + hyphens, matching directory name */
export type SkillSlug = string;

/** Runtime dependency requirements (ClawHub-compatible) */
export interface SkillRequires {
  /** Required environment variables (e.g. ["TODOIST_API_KEY"]) */
  env?: string[];
  /** Required binaries on PATH (e.g. ["curl", "jq"]) */
  bins?: string[];
  /** Supported operating systems */
  os?: ('macos' | 'linux' | 'windows')[];
}

/** Platform-specific metadata (Agent Skills spec extensible metadata map) */
export type SkillMetadata = Record<string, Record<string, unknown>>;

export interface SkillManifest {
  // === Core identity ===
  /** UUID v4 — globally unique, stable across versions */
  id: string;
  /** Slug matching directory name: ^[a-z0-9][a-z0-9-]*$ */
  name: SkillSlug;
  /** Semver version string */
  version: string;
  /** What the skill does (max 1024 chars, mirrors SKILL.md frontmatter) */
  description: string;

  // === Authoring ===
  /** Display name or organization */
  author?: string;
  /** SPDX license identifier or description */
  license?: string;
  /** URL to source repo or docs */
  homepage?: string;

  // === Sharing & Discovery ===
  /** Whether this skill is visible on LAN discovery (default: false) */
  shared: boolean;
  /** Tags for search/filtering */
  tags?: string[];

  // === Compatibility ===
  /** Free-text environment requirements (Agent Skills spec, max 500 chars) */
  compatibility?: string;
  /** Structured runtime dependency requirements (ClawHub-compatible) */
  requires?: SkillRequires;

  // === Extensible metadata (Agent Skills spec) ===
  metadata?: SkillMetadata;

  // === Timestamps ===
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-updated timestamp */
  updatedAt: string;
}

/** Fields parsed from SKILL.md YAML frontmatter */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: SkillMetadata;
  version?: string;
}
