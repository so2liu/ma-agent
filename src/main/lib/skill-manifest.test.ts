import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { SkillManifest } from '../../shared/types/skill-manifest';
import {
  generateManifest,
  parseFrontmatter,
  readManifest,
  syncManifest,
  validateManifest,
  writeManifest
} from './skill-manifest';

const TEST_DIR = join(tmpdir(), 'skill-manifest-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('parseFrontmatter', () => {
  test('parses standard SKILL.md frontmatter', () => {
    const content = `---
name: my-skill
description: A test skill for doing things
license: MIT
---

# My Skill

Some content here.`;

    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: 'my-skill',
      description: 'A test skill for doing things',
      license: 'MIT'
    });
  });

  test('handles quoted values', () => {
    const content = `---
name: docx
description: 'A skill with quotes and colons: like this'
license: "Proprietary"
---`;

    const result = parseFrontmatter(content);
    expect(result.name).toBe('docx');
    expect(result.description).toBe('A skill with quotes and colons: like this');
    expect(result.license).toBe('Proprietary');
  });

  test('returns empty object for missing frontmatter', () => {
    expect(parseFrontmatter('# Just a heading')).toEqual({});
    expect(parseFrontmatter('')).toEqual({});
  });

  test('parses version field', () => {
    const content = `---
name: versioned-skill
description: Has a version
version: 2.1.0
---`;

    const result = parseFrontmatter(content);
    expect(result.version).toBe('2.1.0');
  });
});

describe('validateManifest', () => {
  const validManifest: SkillManifest = {
    id: 'a1b2c3d4-1001-4000-8000-000000000001',
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill',
    shared: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  };

  test('valid manifest returns no errors', () => {
    expect(validateManifest(validManifest)).toEqual([]);
  });

  test('missing id', () => {
    const errors = validateManifest({ ...validManifest, id: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('id');
  });

  test('invalid name format', () => {
    const errors = validateManifest({ ...validManifest, name: 'Invalid Name!' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('name');
  });

  test('invalid semver', () => {
    const errors = validateManifest({ ...validManifest, version: 'not-semver' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('version');
  });

  test('description too long', () => {
    const errors = validateManifest({ ...validManifest, description: 'x'.repeat(1025) });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('description');
  });

  test('shared must be boolean', () => {
    const errors = validateManifest({
      ...validManifest,
      shared: 'yes' as unknown as boolean
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('shared');
  });

  test('multiple errors at once', () => {
    const errors = validateManifest({});
    expect(errors.length).toBeGreaterThanOrEqual(4); // id, name, version, description, shared
  });

  test('semver with pre-release is valid', () => {
    const errors = validateManifest({ ...validManifest, version: '1.0.0-beta.1' });
    expect(errors).toEqual([]);
  });
});

describe('readManifest / writeManifest', () => {
  test('round-trips manifest through file system', () => {
    const manifest: SkillManifest = {
      id: 'test-uuid',
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test',
      shared: true,
      tags: ['test'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };

    writeManifest(TEST_DIR, manifest);
    const read = readManifest(TEST_DIR);
    expect(read).toEqual(manifest);
  });

  test('readManifest returns null for missing file', () => {
    expect(readManifest(join(TEST_DIR, 'nonexistent'))).toBeNull();
  });

  test('readManifest returns null for invalid JSON', () => {
    writeFileSync(join(TEST_DIR, 'manifest.json'), 'not json');
    expect(readManifest(TEST_DIR)).toBeNull();
  });
});

describe('generateManifest', () => {
  test('generates manifest from SKILL.md', () => {
    writeFileSync(
      join(TEST_DIR, 'SKILL.md'),
      `---
name: my-skill
description: Does cool things
license: MIT
---

# My Skill`
    );

    const manifest = generateManifest(TEST_DIR, 'my-skill');
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe('my-skill');
    expect(manifest!.description).toBe('Does cool things');
    expect(manifest!.license).toBe('MIT');
    expect(manifest!.version).toBe('1.0.0');
    expect(manifest!.shared).toBe(false);
    expect(manifest!.id).toBeTruthy();
    // skillMdHash should be set for idempotent sync
    expect((manifest as unknown as Record<string, unknown>).skillMdHash).toBeTruthy();
  });

  test('uses directory name when frontmatter name is missing', () => {
    writeFileSync(join(TEST_DIR, 'SKILL.md'), '# No frontmatter');
    const manifest = generateManifest(TEST_DIR, 'fallback-name');
    expect(manifest!.name).toBe('fallback-name');
  });

  test('returns null when SKILL.md is missing', () => {
    expect(generateManifest(TEST_DIR, 'test')).toBeNull();
  });
});

describe('syncManifest', () => {
  test('generates new manifest when none exists', () => {
    writeFileSync(
      join(TEST_DIR, 'SKILL.md'),
      `---
name: new-skill
description: Brand new
---`
    );

    const manifest = syncManifest(TEST_DIR, 'new-skill');
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe('new-skill');
    expect(existsSync(join(TEST_DIR, 'manifest.json'))).toBe(true);
  });

  test('preserves identity fields when SKILL.md changes', () => {
    // Create initial state
    writeFileSync(
      join(TEST_DIR, 'SKILL.md'),
      `---
name: evolving-skill
description: Original description
---`
    );

    const original = syncManifest(TEST_DIR, 'evolving-skill');
    expect(original).not.toBeNull();
    const originalId = original!.id;
    const originalCreatedAt = original!.createdAt;

    // Modify manifest to add user settings
    const withUserSettings = { ...original!, shared: true, tags: ['custom'] };
    writeManifest(TEST_DIR, withUserSettings);

    // Change SKILL.md
    writeFileSync(
      join(TEST_DIR, 'SKILL.md'),
      `---
name: evolving-skill
description: Updated description
---`
    );

    const updated = syncManifest(TEST_DIR, 'evolving-skill');
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(originalId);
    expect(updated!.createdAt).toBe(originalCreatedAt);
    expect(updated!.description).toBe('Updated description');
    // shared and tags are preserved as they're identity fields
    expect(updated!.shared).toBe(true);
    expect(updated!.tags).toEqual(['custom']);
  });

  test('does not update when SKILL.md has not changed', () => {
    writeFileSync(
      join(TEST_DIR, 'SKILL.md'),
      `---
name: stable-skill
description: No changes
---`
    );

    const first = syncManifest(TEST_DIR, 'stable-skill');
    expect(first).not.toBeNull();
    const firstUpdatedAt = first!.updatedAt;

    // Second sync with same SKILL.md should be a no-op
    const second = syncManifest(TEST_DIR, 'stable-skill');
    expect(second).not.toBeNull();
    expect(second!.updatedAt).toBe(firstUpdatedAt);
  });

  test('returns null when SKILL.md is missing', () => {
    expect(syncManifest(TEST_DIR, 'missing')).toBeNull();
  });
});
