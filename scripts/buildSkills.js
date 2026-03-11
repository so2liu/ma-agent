import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build Claude skills from the local `.claude/skills` directory into `out/.claude/skills`.
 * This runs for both dev (preDev) and production builds (beforeBuild hook).
 */

const projectRoot = join(__dirname, '..');
const sourceClaudeRoot = join(projectRoot, '.claude');
const sourceSkillsRoot = join(sourceClaudeRoot, 'skills');
const targetClaudeRoot = join(projectRoot, 'out', '.claude');
const targetSkillsRoot = join(targetClaudeRoot, 'skills');

/** Parse simple key: value frontmatter from SKILL.md */
function parseFrontmatterSimple(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (!kv) continue;
    const value = kv[2].replace(/^['"](.*)['"]$/, '$1').trim();
    if (['name', 'description', 'license', 'compatibility', 'version'].includes(kv[1])) {
      result[kv[1]] = value;
    }
  }
  return result;
}

/** Write a brand new manifest.json */
function writeNewManifest(manifestPath, skillMdContent, skillName, hash) {
  const fm = parseFrontmatterSimple(skillMdContent);
  const now = new Date().toISOString();
  const manifest = {
    id: randomUUID(),
    name: fm.name || skillName,
    version: fm.version || '1.0.0',
    description: fm.description || '',
    license: fm.license,
    shared: false,
    createdAt: now,
    updatedAt: now,
    skillMdHash: hash
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

console.log('Building Claude skills with root toolchain...');
console.log('  Source:', sourceSkillsRoot);
console.log('  Target:', targetSkillsRoot);

// Clean target directory
if (existsSync(targetClaudeRoot)) {
  console.log('Cleaning target directory...');
  rmSync(targetClaudeRoot, { recursive: true, force: true });
}
mkdirSync(targetSkillsRoot, { recursive: true });

// Find all skills
if (!existsSync(sourceSkillsRoot)) {
  console.warn('No .claude/skills directory found at:', sourceSkillsRoot);
  process.exit(0);
}

const skills = readdirSync(sourceSkillsRoot).filter((name) => {
  const skillPath = join(sourceSkillsRoot, name);
  return statSync(skillPath).isDirectory();
});

if (skills.length === 0) {
  console.log('No skills found.');
  process.exit(0);
}

console.log(`\nFound ${skills.length} skill(s):`, skills.join(', '));

// Process each skill
for (const skillName of skills) {
  console.log(`\nProcessing skill: ${skillName}`);
  const sourceSkillDir = join(sourceSkillsRoot, skillName);
  const targetSkillDir = join(targetSkillsRoot, skillName);

  // Create target skill directory
  mkdirSync(targetSkillDir, { recursive: true });

  // Copy all files from skill directory (except scripts/ and node_modules/ which we'll handle separately)
  const entries = readdirSync(sourceSkillDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'scripts') {
      continue; // Skip scripts directory, we'll compile these separately
    }
    if (entry.name === 'node_modules') {
      continue; // Skip node_modules - compiled binaries are standalone and don't need dependencies
    }

    const sourcePath = join(sourceSkillDir, entry.name);
    const targetPath = join(targetSkillDir, entry.name);

    try {
      cpSync(sourcePath, targetPath, { recursive: true });
      console.log(`  Copied ${entry.name}`);
    } catch (error) {
      console.warn(`  Warning: Failed to copy ${entry.name}:`, error.message);
    }
  }

  // Ensure manifest.json exists (generate if missing, sync if SKILL.md changed)
  const manifestPath = join(targetSkillDir, 'manifest.json');
  const skillMdPath = join(targetSkillDir, 'SKILL.md');
  if (existsSync(skillMdPath)) {
    const skillMdContent = readFileSync(skillMdPath, 'utf-8');
    const currentHash = createHash('sha256').update(skillMdContent).digest('hex');

    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        if (manifest.skillMdHash !== currentHash) {
          // SKILL.md changed -- update content fields, preserve identity
          const fm = parseFrontmatterSimple(skillMdContent);
          manifest.name = fm.name || manifest.name;
          manifest.description = fm.description || manifest.description;
          manifest.license = fm.license ?? manifest.license;
          manifest.version = fm.version || manifest.version;
          manifest.updatedAt = new Date().toISOString();
          manifest.skillMdHash = currentHash;
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
          console.log(`  Updated manifest.json (SKILL.md changed)`);
        }
      } catch {
        console.warn(`  Warning: Invalid manifest.json, regenerating`);
        writeNewManifest(manifestPath, skillMdContent, skillName, currentHash);
      }
    } else {
      console.warn(`  Warning: No manifest.json found, generating`);
      writeNewManifest(manifestPath, skillMdContent, skillName, currentHash);
    }
  }

  // Find and compile all TypeScript tools
  const scriptsDir = join(sourceSkillDir, 'scripts');
  if (!existsSync(scriptsDir)) {
    console.log('  No scripts directory found, skipping tool compilation');
    continue;
  }

  // First, copy all non-.ts files from scripts/ directory
  const copyNonTsFiles = (sourceDir, targetDir) => {
    const entries = readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name);
      const targetPath = join(targetDir, entry.name);

      if (entry.isDirectory()) {
        mkdirSync(targetPath, { recursive: true });
        copyNonTsFiles(sourcePath, targetPath);
      } else if (entry.isFile() && !entry.name.endsWith('.ts')) {
        cpSync(sourcePath, targetPath);
        console.log(`  Copied ${relative(sourceSkillDir, sourcePath)}`);
      }
    }
  };

  const targetScriptsDir = join(targetSkillDir, 'scripts');
  mkdirSync(targetScriptsDir, { recursive: true });
  copyNonTsFiles(scriptsDir, targetScriptsDir);

  // Recursively find all .ts files in scripts/
  const findTsFiles = (dir) => {
    const results = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  const tsFiles = findTsFiles(scriptsDir);
  console.log(`  Found ${tsFiles.length} TypeScript tool(s)`);

  for (const tsFile of tsFiles) {
    const relativePath = relative(sourceSkillDir, tsFile);

    console.log(`    Compiling ${relativePath}...`);

    // Binary output - add .exe extension on Windows
    const baseOutput = relativePath.replace(/\.ts$/, '');
    const binaryOutput = join(
      targetSkillDir,
      process.platform === 'win32' ? `${baseOutput}.exe` : baseOutput
    );

    // Create target directory
    const targetToolDir = dirname(binaryOutput);
    mkdirSync(targetToolDir, { recursive: true });

    // Compile with Bun - automatically compiles for current platform
    // --compile creates a standalone executable for the current OS/arch
    const compileResult = spawnSync(
      'bun',
      ['build', '--compile', '--outfile', binaryOutput, tsFile],
      {
        cwd: projectRoot,
        stdio: 'inherit'
      }
    );

    if (compileResult.status !== 0) {
      console.error(`    Failed to compile ${relativePath}`);
      process.exit(1);
    }

    console.log(`    ✓ Compiled to ${relative(targetSkillsRoot, binaryOutput)}`);
  }
}

// Copy .claude/tools/ directory (non-compiled TypeScript tools used by skills)
const sourceToolsDir = join(sourceClaudeRoot, 'tools');
const targetToolsDir = join(targetClaudeRoot, 'tools');
if (existsSync(sourceToolsDir)) {
  console.log('\nCopying .claude/tools/ directory...');
  mkdirSync(targetToolsDir, { recursive: true });
  const toolEntries = readdirSync(sourceToolsDir, { withFileTypes: true });
  for (const entry of toolEntries) {
    const sourcePath = join(sourceToolsDir, entry.name);
    const targetPath = join(targetToolsDir, entry.name);
    cpSync(sourcePath, targetPath, { recursive: true });
    console.log(`  Copied tools/${entry.name}`);
  }
}

// Clean up Bun build artifacts
const bunBuildFiles = readdirSync(projectRoot).filter((f) => f.endsWith('.bun-build'));
for (const file of bunBuildFiles) {
  rmSync(join(projectRoot, file), { force: true });
}
if (bunBuildFiles.length > 0) {
  console.log(`Cleaned up ${bunBuildFiles.length} .bun-build artifact(s)`);
}

console.log('\n✅ Skills build completed successfully');
