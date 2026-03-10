import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CURRENT_RIPGREP_TARGET =
  process.platform === 'darwin' ? `${process.arch === 'arm64' ? 'arm64' : 'x64'}-darwin`
  : process.platform === 'linux' ? `${process.arch === 'arm64' ? 'arm64' : 'x64'}-linux`
  : 'x64-win32';

function rmIfExists(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

// Remove .d.ts, .d.mts, .map, and other non-runtime files from a copied dependency tree.
function pruneNonRuntimeFiles(dir) {
  const PRUNE_EXTENSIONS = new Set(['.d.ts', '.d.mts', '.map']);
  const PRUNE_DIRS = new Set(['docs', 'doc', 'example', 'examples', 'test', 'tests', '__tests__']);

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true });
      } else {
        pruneNonRuntimeFiles(fullPath);
      }
    } else if (entry.isFile()) {
      const matchesExt = [...PRUNE_EXTENSIONS].some((ext) => entry.name.endsWith(ext));
      if (matchesExt) {
        rmSync(fullPath, { force: true });
      }
    }
  }
}

function pruneSdkVendorArtifacts(depName, targetDir) {
  if (depName !== '@anthropic-ai/claude-agent-sdk') {
    return;
  }

  const vendorDir = join(targetDir, 'vendor');
  const jetbrainsPath = join(vendorDir, 'claude-code-jetbrains-plugin');
  const ripgrepDir = join(vendorDir, 'ripgrep');

  // The desktop app doesn't use the JetBrains plugin, and keeping it inflates
  // the app bundle and signing surface substantially.
  rmIfExists(jetbrainsPath);

  if (!existsSync(ripgrepDir)) {
    return;
  }

  for (const target of ['arm64-darwin', 'x64-darwin', 'arm64-linux', 'x64-linux', 'x64-win32']) {
    if (target !== CURRENT_RIPGREP_TARGET) {
      rmIfExists(join(ripgrepDir, target));
    }
  }
}

export default async function beforeBuild(_context) {
  const projectDir = join(__dirname, '..');

  // Step 1: Download runtime binaries
  console.log('Downloading runtime binaries...');
  const downloadBinariesScript = join(__dirname, 'downloadRuntimeBinaries.js');
  const downloadResult = spawnSync('node', [downloadBinariesScript], {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (downloadResult.status !== 0) {
    throw new Error('Failed to download runtime binaries');
  }

  // Step 2: Copy runtime dependencies (SDK + native bindings)
  console.log('Copying runtime dependencies to out/node_modules...');

  const pkgJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
  const optionalDeps = new Set(Object.keys(pkgJson.optionalDependencies ?? {}));
  const runtimeDeps = new Set([...Object.keys(pkgJson.dependencies ?? {}), ...optionalDeps]);

  const nodeModulesDir = join(projectDir, 'node_modules');
  const outNodeModulesDir = join(projectDir, 'out', 'node_modules');
  rmIfExists(outNodeModulesDir);
  mkdirSync(outNodeModulesDir, { recursive: true });

  // Track which dependencies we've already copied to avoid duplicates
  const copiedDeps = new Set();

  // Recursively copy a dependency and its transitive dependencies
  function copyDependency(depName, isOptional = false) {
    if (copiedDeps.has(depName)) {
      return; // Already copied
    }

    const sourceDir = join(nodeModulesDir, depName);
    const targetDir = join(outNodeModulesDir, depName);

    if (!existsSync(sourceDir)) {
      if (isOptional) {
        console.log(`- Skipping optional dependency ${depName} (not installed on this platform)`);
        return;
      }

      throw new Error(`Dependency ${depName} not found in node_modules`);
    }

    // Copy the dependency
    mkdirSync(dirname(targetDir), { recursive: true });
    rmIfExists(targetDir);
    cpSync(sourceDir, targetDir, {
      recursive: true,
      dereference: true,
      force: true
    });

    pruneSdkVendorArtifacts(depName, targetDir);

    copiedDeps.add(depName);
    console.log(`- Copied ${depName}`);

    // Read the dependency's package.json to find its dependencies
    const depPkgJsonPath = join(sourceDir, 'package.json');
    if (existsSync(depPkgJsonPath)) {
      try {
        const depPkgJson = JSON.parse(readFileSync(depPkgJsonPath, 'utf-8'));
        const depDependencies = depPkgJson.dependencies ?? {};
        const depOptionalDeps = depPkgJson.optionalDependencies ?? {};

        // Copy all runtime dependencies of this dependency
        // Note: We only copy from 'dependencies', not 'devDependencies'
        for (const depDepName of Object.keys(depDependencies)) {
          copyDependency(depDepName, false);
        }

        // Copy optional dependencies
        for (const depDepName of Object.keys(depOptionalDeps)) {
          copyDependency(depDepName, true);
        }
      } catch (error) {
        console.warn(`- Warning: Failed to read package.json for ${depName}:`, error.message);
      }
    }
  }

  // Copy all direct runtime dependencies (this will recursively copy transitive deps)
  for (const depName of runtimeDeps) {
    copyDependency(depName, optionalDeps.has(depName));
  }

  // Step 2b: Remove non-runtime files (.d.ts, .map, tests, docs) from copied dependencies
  console.log('Pruning non-runtime files from out/node_modules...');
  pruneNonRuntimeFiles(outNodeModulesDir);

  // Step 3: Clean stale skills from previous builds, then compile
  const outSkillsDir = join(projectDir, 'out', '.claude', 'skills');
  rmIfExists(outSkillsDir);

  console.log('\nCompiling Claude skills...');
  const buildSkillsScript = join(__dirname, 'buildSkills.js');
  const result = spawnSync('bun', [buildSkillsScript], {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error('Failed to compile Claude skills');
  }
}
