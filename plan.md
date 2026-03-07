# Skill Sharing Feature - Implementation Plan

## Phase 1: manifest.json Schema & Generation

### 1.1 Design manifest.json Schema

Create `src/shared/types/skill-manifest.ts` with the following schema:

```typescript
interface SkillManifest {
  // === Core identity (compatible with Agent Skills spec & ClawHub) ===
  id: string; // UUID v4, globally unique, stable across versions
  name: string; // slug format: lowercase alphanumeric + hyphens, matches dir name
  version: string; // semver (e.g. "1.0.0"), ClawHub requires this
  description: string; // max 1024 chars, mirrors SKILL.md frontmatter

  // === Authoring ===
  author?: string; // display name or org
  license?: string; // SPDX identifier or "Proprietary"
  homepage?: string; // URL to source repo or docs

  // === Sharing & Discovery ===
  shared: boolean; // whether this skill is visible on LAN discovery (default: false)
  tags?: string[]; // for search/filtering (e.g. ["pdf", "document", "conversion"])

  // === Compatibility (from Agent Skills spec) ===
  compatibility?: string; // environment requirements (max 500 chars)
  requires?: {
    env?: string[]; // required env vars (ClawHub compatible)
    bins?: string[]; // required binaries
    os?: ('macos' | 'linux' | 'windows')[];
  };

  // === Platform metadata (extensible, Agent Skills spec compliant) ===
  metadata?: Record<string, Record<string, unknown>>;
  // e.g. metadata.openclaw for ClawHub, metadata.skillsmp for SkillsMP

  // === Auto-generated (not user-editable) ===
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  skillMdHash?: string; // SHA-256 of SKILL.md, for detecting drift
}
```

**Design rationale:**

- `id` (UUID) ensures global uniqueness for LAN dedup and import conflict detection
- `name` matches the Agent Skills spec slug format (`^[a-z0-9][a-z0-9-]*$`)
- `version` enables semver-based update detection on LAN
- `shared` is the LAN discovery toggle
- `metadata` map follows the Agent Skills spec for platform-specific extensions
- `requires` follows ClawHub's convention for runtime dependency declarations

### 1.2 Manifest Generation & Sync Logic

Create `src/main/lib/skill-manifest.ts`:

- **`generateManifest(skillDir)`**: Reads SKILL.md frontmatter, generates manifest.json with UUID if missing
- **`syncManifest(skillDir)`**: If manifest.json exists, checks if SKILL.md changed (via hash). If SKILL.md changed, updates manifest fields from frontmatter while preserving `id`, `shared`, `tags`, `createdAt`
- **`validateManifest(manifest)`**: Validates required fields, slug format, semver format

### 1.3 Add manifest.json to Bundled Skills

Generate manifest.json for each of the 5 bundled skills:

- `workspace-tools`: shared=false, version="1.0.0"
- `docx`: shared=false, version="1.0.0"
- `pdf`: shared=false, version="1.0.0"
- `xlsx`: shared=false, version="1.0.0"
- `frontend-design`: shared=false, version="1.0.0"

### 1.4 Build Script Integration

Update `scripts/buildSkills.js` to:

- Copy manifest.json alongside SKILL.md during build
- Generate manifest.json if missing (with warning)

---

## Phase 2: Import/Export (zip) - _Future_

- Export: zip skill directory (SKILL.md + scripts/ + manifest.json + assets/)
- Import: unzip, validate manifest, handle conflicts (same id → update, different id → new)
- Compatibility: tolerate missing manifest.json (generate on import from SKILL.md)
- IPC channels: `skill:export`, `skill:import`

## Phase 3: LAN Discovery (mDNS/Bonjour) - _Future_

- Each app advertises shared skills via mDNS service
- Skill store UI shows LAN skills with version comparison
- Download = fetch zip over HTTP from peer
- IPC channels: `skill:lan-search`, `skill:lan-download`, `skill:lan-share-toggle`

---

## Scope of This PR

**This PR implements Phase 1 only**: manifest.json schema, types, generation/sync logic, bundled skill manifests, and build script integration. This establishes the foundation for Phase 2 and 3.

### Files to create/modify:

1. **Create** `src/shared/types/skill-manifest.ts` - TypeScript types
2. **Create** `src/main/lib/skill-manifest.ts` - Generation, sync, validation logic
3. **Modify** `scripts/buildSkills.js` - Copy manifest.json during build
4. **Create** `manifest.json` in each `.claude/skills/<name>/` directory
5. **Modify** `src/main/lib/config.ts` - Call manifest sync during workspace setup
6. **Add tests** for manifest validation and generation
