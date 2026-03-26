import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function rmIfExists(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

// Remove .d.ts, .d.mts, .map, and other non-runtime files from copied dependencies.
// PRUNE_DIRS are only removed at the package root level (not recursively inside dist/lib/src)
// because some packages use names like 'doc' for runtime code (e.g. yaml/dist/doc/).
function pruneNonRuntimeFiles(outNodeModulesDir) {
  const PRUNE_EXTENSIONS = new Set(['.d.ts', '.d.mts', '.map']);
  const PRUNE_DIRS = new Set(['docs', 'doc', 'example', 'examples', 'test', 'tests', '__tests__']);

  // Remove non-runtime extensions recursively
  function pruneExtensions(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        pruneExtensions(fullPath);
      } else if (entry.isFile()) {
        const matchesExt = [...PRUNE_EXTENSIONS].some((ext) => entry.name.endsWith(ext));
        if (matchesExt) {
          rmSync(fullPath, { force: true });
        }
      }
    }
  }

  // Remove documentation/test dirs only at the root of each package (not inside dist/lib/src).
  // Also recurses into nested node_modules to prune their packages too.
  function pruneTopLevelDirs(pkgRoot) {
    for (const entry of readdirSync(pkgRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (PRUNE_DIRS.has(entry.name)) {
        rmSync(join(pkgRoot, entry.name), { recursive: true, force: true });
      } else if (entry.name === 'node_modules') {
        prunePackagesInDir(join(pkgRoot, entry.name));
      }
    }
  }

  // Apply pruning to all packages inside a node_modules directory
  function prunePackagesInDir(nmDir) {
    for (const entry of readdirSync(nmDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(nmDir, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scopedEntry of readdirSync(fullPath, { withFileTypes: true })) {
          if (!scopedEntry.isDirectory()) continue;
          const scopedPkgPath = join(fullPath, scopedEntry.name);
          pruneTopLevelDirs(scopedPkgPath);
          pruneExtensions(scopedPkgPath);
        }
      } else {
        pruneTopLevelDirs(fullPath);
        pruneExtensions(fullPath);
      }
    }
  }

  prunePackagesInDir(outNodeModulesDir);
}

function pruneSdkVendorArtifacts(_depName, _targetDir) {
  // No-op: Claude Agent SDK has been removed. This function is retained
  // as a hook for future vendor artifact pruning if needed.
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

  // Walk nested node_modules inside a package and ensure their transitive
  // dependencies are also copied to the flat out/node_modules. This handles
  // cases where a nested package (e.g. ajv@8 inside pi-ai) depends on a
  // module (e.g. fast-uri) that was hoisted to the root but isn't a dependency
  // of the root-level version of that package.
  function processNestedNodeModules(pkgDir) {
    const nestedNM = join(pkgDir, 'node_modules');
    if (!existsSync(nestedNM)) return;

    for (const entry of readdirSync(nestedNM, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('@')) {
        // Scoped package: iterate one level deeper
        const scopeDir = join(nestedNM, entry.name);
        for (const scopedEntry of readdirSync(scopeDir, { withFileTypes: true })) {
          if (!scopedEntry.isDirectory()) continue;
          processNestedPkg(join(scopeDir, scopedEntry.name));
        }
      } else {
        processNestedPkg(join(nestedNM, entry.name));
      }
    }
  }

  function processNestedPkg(nestedPkgDir) {
    const pkgJsonPath = join(nestedPkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) return;

    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const deps = pkgJson.dependencies ?? {};
      const optDeps = pkgJson.optionalDependencies ?? {};

      for (const depName of Object.keys(deps)) {
        // Only copy if available at root; if not, it's nested within the parent
        // and was already copied as part of the parent's directory tree.
        if (existsSync(join(nodeModulesDir, depName))) {
          copyDependency(depName, false);
        }
      }

      for (const depName of Object.keys(optDeps)) {
        if (existsSync(join(nodeModulesDir, depName))) {
          copyDependency(depName, true);
        }
      }

      // Recurse into this nested package's own node_modules
      processNestedNodeModules(nestedPkgDir);
    } catch {
      // Ignore malformed package.json
    }
  }

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

    // Also process dependencies of nested node_modules packages.
    // When a package has its own node_modules (e.g. different version from root),
    // those nested packages may depend on modules hoisted to the root that haven't
    // been copied yet.
    processNestedNodeModules(sourceDir);
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
