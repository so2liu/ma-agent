import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { SkillFrontmatter, SkillManifest } from '../../shared/types/skill-manifest';

const MANIFEST_FILENAME = 'manifest.json';
const SKILL_MD_FILENAME = 'SKILL.md';
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Handles the simple key: value format used by Agent Skills spec.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: SkillFrontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;

    const [, key, rawValue] = kvMatch;
    // Strip surrounding quotes
    const value = rawValue.replace(/^['"](.*)['"]$/, '$1').trim();

    switch (key) {
      case 'name':
        frontmatter.name = value;
        break;
      case 'description':
        frontmatter.description = value;
        break;
      case 'license':
        frontmatter.license = value;
        break;
      case 'compatibility':
        frontmatter.compatibility = value;
        break;
      case 'version':
        frontmatter.version = value;
        break;
    }
  }

  return frontmatter;
}

/** Compute SHA-256 hash of file content */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface ManifestValidationError {
  field: string;
  message: string;
}

/** Validate a manifest object, returning an array of errors (empty = valid) */
export function validateManifest(manifest: Partial<SkillManifest>): ManifestValidationError[] {
  const errors: ManifestValidationError[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push({ field: 'id', message: 'id is required and must be a string' });
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push({ field: 'name', message: 'name is required and must be a string' });
  } else if (!SLUG_REGEX.test(manifest.name)) {
    errors.push({
      field: 'name',
      message: 'name must be lowercase alphanumeric with hyphens (e.g. "my-skill")'
    });
  }

  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push({ field: 'version', message: 'version is required and must be a string' });
  } else if (!SEMVER_REGEX.test(manifest.version)) {
    errors.push({ field: 'version', message: 'version must be valid semver (e.g. "1.0.0")' });
  }

  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push({ field: 'description', message: 'description is required' });
  } else if (manifest.description.length > 1024) {
    errors.push({ field: 'description', message: 'description must be at most 1024 characters' });
  }

  if (typeof manifest.shared !== 'boolean') {
    errors.push({ field: 'shared', message: 'shared must be a boolean' });
  }

  if (manifest.compatibility && manifest.compatibility.length > 500) {
    errors.push({
      field: 'compatibility',
      message: 'compatibility must be at most 500 characters'
    });
  }

  if (manifest.tags && !Array.isArray(manifest.tags)) {
    errors.push({ field: 'tags', message: 'tags must be an array of strings' });
  }

  return errors;
}

/**
 * Read manifest.json from a skill directory.
 * Returns null if the file doesn't exist or is invalid JSON.
 */
export function readManifest(skillDir: string): SkillManifest | null {
  const manifestPath = join(skillDir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) return null;

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as SkillManifest;
  } catch {
    return null;
  }
}

/** Write manifest.json to a skill directory */
export function writeManifest(skillDir: string, manifest: SkillManifest): void {
  const manifestPath = join(skillDir, MANIFEST_FILENAME);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Generate a new manifest from SKILL.md frontmatter.
 * Used when manifest.json doesn't exist yet.
 */
export function generateManifest(skillDir: string, dirName: string): SkillManifest | null {
  const skillMdPath = join(skillDir, SKILL_MD_FILENAME);
  if (!existsSync(skillMdPath)) return null;

  const skillMdContent = readFileSync(skillMdPath, 'utf-8');
  const frontmatter = parseFrontmatter(skillMdContent);

  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    name: frontmatter.name || dirName,
    version: frontmatter.version || '1.0.0',
    description: frontmatter.description || '',
    license: frontmatter.license,
    shared: false,
    compatibility: frontmatter.compatibility,
    createdAt: now,
    updatedAt: now,
    skillMdHash: hashContent(skillMdContent)
  } as SkillManifest;
}

/**
 * Sync manifest.json with SKILL.md frontmatter.
 * Preserves identity fields (id, shared, tags, createdAt) while updating
 * content fields from SKILL.md if it has changed (detected via hash).
 *
 * Returns the (possibly updated) manifest, or null if SKILL.md doesn't exist.
 */
export function syncManifest(skillDir: string, dirName: string): SkillManifest | null {
  const skillMdPath = join(skillDir, SKILL_MD_FILENAME);
  if (!existsSync(skillMdPath)) return null;

  const existing = readManifest(skillDir);

  // No existing manifest — generate a new one
  if (!existing) {
    const manifest = generateManifest(skillDir, dirName);
    if (manifest) writeManifest(skillDir, manifest);
    return manifest;
  }

  // Check if SKILL.md has changed since last sync
  const skillMdContent = readFileSync(skillMdPath, 'utf-8');
  const currentHash = hashContent(skillMdContent);

  // If manifest already tracks a hash and it matches, no update needed
  if ((existing as SkillManifest & { skillMdHash?: string }).skillMdHash === currentHash) {
    return existing;
  }

  // SKILL.md changed — update content fields, preserve identity fields
  const frontmatter = parseFrontmatter(skillMdContent);
  const updated: SkillManifest & { skillMdHash: string } = {
    ...existing,
    name: frontmatter.name || existing.name,
    description: frontmatter.description || existing.description,
    license: frontmatter.license ?? existing.license,
    compatibility: frontmatter.compatibility ?? existing.compatibility,
    version: frontmatter.version || existing.version,
    updatedAt: new Date().toISOString(),
    skillMdHash: currentHash
  };

  writeManifest(skillDir, updated);
  return updated;
}
