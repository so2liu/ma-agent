import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { basename, join } from 'path';
import AdmZip from 'adm-zip';

import type { SkillManifest } from '../../shared/types/skill-manifest';
import { readManifest, syncManifest, validateManifest } from './skill-manifest';

const SKILL_MD = 'SKILL.md';

/**
 * Export a skill directory as a ZIP buffer.
 * Includes SKILL.md, manifest.json, scripts/, and any other relevant files.
 * Excludes .builtin marker and compiled binaries.
 */
export function exportSkill(skillDir: string): { buffer: Buffer; filename: string } {
  if (!existsSync(skillDir)) {
    throw new Error(`Skill directory not found: ${skillDir}`);
  }

  const manifest = readManifest(skillDir);
  if (!manifest) {
    throw new Error('Skill has no manifest.json');
  }

  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`Invalid manifest: ${errors.map((e) => e.message).join(', ')}`);
  }

  const zip = new AdmZip();
  const skillName = basename(skillDir);

  // Recursively add files, skipping .builtin and compiled binaries
  addDirToZip(zip, skillDir, skillName);

  const filename = `${manifest.name}-${manifest.version}.zip`;
  return { buffer: zip.toBuffer(), filename };
}

function addDirToZip(zip: AdmZip, dirPath: string, zipPrefix: string): void {
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip .builtin marker, node_modules, compiled binaries
    if (entry.name === '.builtin' || entry.name === 'node_modules') continue;

    const fullPath = join(dirPath, entry.name);
    const zipPath = `${zipPrefix}/${entry.name}`;

    if (entry.isDirectory()) {
      addDirToZip(zip, fullPath, zipPath);
    } else {
      zip.addFile(zipPath, readFileSync(fullPath));
    }
  }
}

/**
 * Import a skill from a ZIP buffer into the skills directory.
 * Validates manifest before extraction.
 * Returns the installed skill's manifest.
 */
export function importSkill(
  zipBuffer: Buffer,
  destSkillsDir: string
): { manifest: SkillManifest; skillDir: string } {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length === 0) {
    throw new Error('ZIP file is empty');
  }

  // Find the root directory name (first path component)
  const rootDirs = new Set<string>();
  for (const entry of entries) {
    const parts = entry.entryName.split('/');
    if (parts.length > 1 && parts[0]) {
      rootDirs.add(parts[0]);
    }
  }

  if (rootDirs.size !== 1) {
    throw new Error('ZIP must contain exactly one skill directory at the root');
  }

  const rootDir = [...rootDirs][0];

  // Validate SKILL.md exists
  const skillMdEntry = entries.find((e) => e.entryName === `${rootDir}/${SKILL_MD}`);
  if (!skillMdEntry) {
    throw new Error('ZIP does not contain a SKILL.md file');
  }

  // Validate manifest if present
  const manifestEntry = entries.find((e) => e.entryName === `${rootDir}/manifest.json`);
  if (manifestEntry) {
    const manifestData = JSON.parse(manifestEntry.getData().toString('utf-8')) as SkillManifest;
    const errors = validateManifest(manifestData);
    if (errors.length > 0) {
      throw new Error(`Invalid manifest in ZIP: ${errors.map((e) => e.message).join(', ')}`);
    }
  }

  // Check for path traversal in entries
  for (const entry of entries) {
    if (entry.entryName.includes('..')) {
      throw new Error('ZIP contains path traversal entries');
    }
  }

  // Determine destination: use skill name from root dir
  const destDir = join(destSkillsDir, rootDir);

  // Don't overwrite built-in skills
  if (existsSync(join(destDir, '.builtin'))) {
    throw new Error(`Cannot overwrite built-in skill "${rootDir}"`);
  }

  // Clean-remove existing directory before extracting to avoid stale file mixing
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }

  zip.extractAllTo(destSkillsDir, true);

  // Ensure manifest exists (generate if ZIP didn't include one)
  const manifest = syncManifest(destDir, rootDir);
  if (!manifest) {
    // Workaround: avoid ending string with "import" -- triggers electron-vite esmShimPlugin false ESM import regex match
    throw new Error('Failed to generate manifest after skill installation');
  }

  return { manifest, skillDir: destDir };
}

/**
 * List all skills in the skills directory with their manifests.
 */
export function listSkills(
  skillsDir: string
): Array<{ name: string; manifest: SkillManifest | null; isBuiltin: boolean }> {
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());

  return entries.map((entry) => {
    const skillDir = join(skillsDir, entry.name);
    const manifest = readManifest(skillDir);
    const isBuiltin = existsSync(join(skillDir, '.builtin'));
    return { name: entry.name, manifest, isBuiltin };
  });
}

/**
 * Get the skills directory path from workspace.
 */
export function getSkillsDir(workspaceDir: string): string {
  return join(workspaceDir, '.claude', 'skills');
}

/**
 * Get total size of a skill directory in bytes.
 */
export function getSkillSize(skillDir: string): number {
  if (!existsSync(skillDir)) return 0;

  let total = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        total += statSync(full).size;
      }
    }
  };
  walk(skillDir);
  return total;
}
