import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, '..');
const resourcesDir = join(projectDir, 'resources');

// Target versions
const JQ_VERSION = '1.8.1';
const PORTABLE_GIT_VERSION = '2.47.1'; // Git for Windows portable version
const MSYS2_VERSION = 'latest'; // MSYS2 base system (includes bash, awk, sed, unix tools) - using latest release

// Platform detection
const PLATFORM = process.platform;

// Platform-specific binary names
const JQ_BINARY_NAME = 'jq.exe';

/**
 * Reads the current version from a version file
 */
function getCurrentVersion(versionFile) {
  if (!existsSync(versionFile)) {
    return null;
  }
  try {
    return readFileSync(versionFile, 'utf-8').trim();
  } catch {
    return null;
  }
}

function removeLegacyArtifacts() {
  for (const legacyPath of ['uv', 'uv.exe', '.uv-version', 'bun', 'bun.exe', '.bun-version']) {
    const fullPath = join(resourcesDir, legacyPath);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true });
      console.log(`Removed legacy runtime artifact: ${fullPath}`);
    }
  }
}

/**
 * Downloads a file from a URL
 */
async function downloadFile(url, destination) {
  console.log(`Downloading from ${url}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const fileStream = createWriteStream(destination);
  await pipeline(Readable.fromWeb(response.body), fileStream);
  console.log(`Downloaded to ${destination}`);
}

/**
 * Downloads and installs jq binary (Windows only)
 */
async function downloadJq() {
  // Only download jq on Windows
  if (PLATFORM !== 'win32') {
    return;
  }

  const jqPath = join(resourcesDir, JQ_BINARY_NAME);
  const jqVersionFile = join(resourcesDir, '.jq-version');
  const currentVersion = getCurrentVersion(jqVersionFile);

  // Check if we need to download
  if (existsSync(jqPath) && currentVersion === JQ_VERSION) {
    console.log(`jq v${JQ_VERSION} already exists, skipping download.`);
    return;
  }

  console.log(`Downloading jq v${JQ_VERSION} for Windows...`);

  const jqUrl = `https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-windows-amd64.exe`;

  // Download directly (jq is a single executable, not an archive)
  await downloadFile(jqUrl, jqPath);

  // Write version file
  writeFileSync(jqVersionFile, JQ_VERSION);

  console.log(`✓ jq v${JQ_VERSION} installed successfully`);
}

/**
 * Downloads and installs PortableGit (Windows only)
 */
async function downloadPortableGit() {
  // Only download PortableGit on Windows
  if (PLATFORM !== 'win32') {
    return;
  }

  const gitDir = join(resourcesDir, 'git-portable');
  const gitVersionFile = join(resourcesDir, '.git-portable-version');
  const gitExePath = join(gitDir, 'bin', 'git.exe');
  const currentVersion = getCurrentVersion(gitVersionFile);

  // Check if we need to download (check for git.exe as indicator)
  if (existsSync(gitExePath) && currentVersion === PORTABLE_GIT_VERSION) {
    console.log(`PortableGit v${PORTABLE_GIT_VERSION} already exists, skipping download.`);
    return;
  }

  console.log(`Downloading PortableGit v${PORTABLE_GIT_VERSION} for Windows...`);

  // PortableGit download URL from Git for Windows releases
  // Format: https://github.com/git-for-windows/git/releases/download/v{VERSION}.windows.1/PortableGit-{VERSION}-64-bit.7z.exe
  const gitUrl = `https://github.com/git-for-windows/git/releases/download/v${PORTABLE_GIT_VERSION}.windows.1/PortableGit-${PORTABLE_GIT_VERSION}-64-bit.7z.exe`;

  const tempArchive = join(resourcesDir, 'PortableGit.7z.exe');
  const tempExtractDir = join(tmpdir(), `git-portable-temp-${randomUUID()}`);

  // Download
  await downloadFile(gitUrl, tempArchive);

  // Clean up any existing temp extract directory
  if (existsSync(tempExtractDir)) {
    try {
      rmSync(tempExtractDir, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`Warning: Could not remove existing temp directory: ${error.message}`);
    }
  }

  // Ensure temp extract directory exists
  if (!existsSync(tempExtractDir)) {
    try {
      mkdirSync(tempExtractDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create temp directory ${tempExtractDir}: ${error.message}`);
    }
  }

  // Extract using 7-Zip (7z.exe is available on Windows 10+)
  // PortableGit comes as a self-extracting 7z archive
  console.log(`Extracting PortableGit...`);
  const extractResult = spawnSync(tempArchive, ['-o' + tempExtractDir, '-y'], {
    stdio: 'inherit',
    shell: false
  });

  if (extractResult.status !== 0) {
    // Try alternative: use 7z if available
    const sevenZResult = spawnSync('7z', ['x', tempArchive, `-o${tempExtractDir}`, '-y'], {
      stdio: 'inherit',
      shell: false
    });

    if (sevenZResult.status !== 0) {
      throw new Error(
        'Failed to extract PortableGit. The archive is a self-extracting 7z file. ' +
          'Please ensure 7-Zip is installed or run the downloaded file manually.'
      );
    }
  }

  // Find the extracted PortableGit directory
  // PortableGit extracts to a directory like "PortableGit-{version}-64-bit" or directly to root
  const { readdirSync } = await import('fs');
  const entries = readdirSync(tempExtractDir, { withFileTypes: true });
  let extractedGitDir = null;

  // Look for directory containing bin/git.exe (verify it has the full PortableGit structure)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidatePath = join(tempExtractDir, entry.name);
      const candidateGitExe = join(candidatePath, 'bin', 'git.exe');
      const candidateBashExe = join(candidatePath, 'usr', 'bin', 'bash.exe');
      // Check for both git.exe and bash.exe to ensure we have the full PortableGit
      if (existsSync(candidateGitExe) && existsSync(candidateBashExe)) {
        extractedGitDir = candidatePath;
        break;
      }
      // Fallback: just check for git.exe if bash.exe check fails
      if (!extractedGitDir && existsSync(candidateGitExe)) {
        extractedGitDir = candidatePath;
      }
    }
  }

  // If no subdirectory found, check if git.exe is directly in tempExtractDir/bin
  if (!extractedGitDir) {
    const directGitExe = join(tempExtractDir, 'bin', 'git.exe');
    const directBashExe = join(tempExtractDir, 'usr', 'bin', 'bash.exe');
    if (existsSync(directGitExe)) {
      extractedGitDir = tempExtractDir;
      // Warn if bash.exe is missing (but don't fail - might be in a different location)
      if (!existsSync(directBashExe)) {
        console.warn(
          `Warning: bash.exe not found at ${directBashExe}. ` +
            `PortableGit may be missing some unix utilities.`
        );
      }
    }
  }

  if (!extractedGitDir) {
    throw new Error(
      `PortableGit extraction failed: Could not find bin/git.exe in extracted files. ` +
        `Contents: ${entries.map((e) => e.name).join(', ')}`
    );
  }

  // Remove existing git-portable directory if it exists
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true, maxRetries: 3 });
  }

  // Copy extracted directory to target location
  const { cpSync } = await import('fs');
  cpSync(extractedGitDir, gitDir, { recursive: true });

  // Verify essential tools are present
  const essentialTools = [
    { path: join(gitDir, 'bin', 'git.exe'), name: 'git' },
    { path: join(gitDir, 'usr', 'bin', 'bash.exe'), name: 'bash' },
    { path: join(gitDir, 'usr', 'bin', 'awk.exe'), name: 'awk' },
    { path: join(gitDir, 'usr', 'bin', 'sed.exe'), name: 'sed' }
  ];

  const missingTools = essentialTools.filter((tool) => !existsSync(tool.path));
  if (missingTools.length > 0) {
    console.warn(
      `Warning: PortableGit is missing some tools: ${missingTools.map((t) => t.name).join(', ')}`
    );
    console.warn('These tools may be required for Claude Agent SDK to work properly.');
  } else {
    console.log('✓ Verified PortableGit includes essential tools (git, bash, awk, sed)');
  }

  // Clean up
  rmSync(tempArchive);
  rmSync(tempExtractDir, { recursive: true });

  // Write version file
  writeFileSync(gitVersionFile, PORTABLE_GIT_VERSION);

  console.log(`✓ PortableGit v${PORTABLE_GIT_VERSION} installed successfully`);
}

/**
 * Downloads and installs MSYS2 base system (Windows only)
 * MSYS2 provides bash, awk, sed, and other unix utilities
 */
async function downloadMsys2() {
  // Only download MSYS2 on Windows
  if (PLATFORM !== 'win32') {
    return;
  }

  const msys2Dir = join(resourcesDir, 'msys2');
  const msys2VersionFile = join(resourcesDir, '.msys2-version');
  const bashExePath = join(msys2Dir, 'usr', 'bin', 'bash.exe');
  const currentVersion = getCurrentVersion(msys2VersionFile);

  // Check if we need to download (check for bash.exe as indicator)
  // For 'latest', always check if bash.exe exists - if it does, assume it's current
  if (existsSync(bashExePath)) {
    if (MSYS2_VERSION === 'latest' || currentVersion === MSYS2_VERSION) {
      console.log(`MSYS2 already exists, skipping download.`);
      return;
    }
  }

  console.log(`Downloading MSYS2 base system (latest) for Windows...`);

  // MSYS2 download URL - using the official distribution repository
  // MSYS2 moved from GitHub releases to repo.msys2.org/distrib/
  // Using .sfx.exe self-extracting archive (no external tools needed)
  // Using a recent version - update the date as needed for newer releases
  // Latest files available at: https://repo.msys2.org/distrib/x86_64/
  // Pattern: msys2-base-x86_64-{YYYYMMDD}.sfx.exe
  const msys2Url = 'https://repo.msys2.org/distrib/x86_64/msys2-base-x86_64-20241116.sfx.exe';

  const tempArchive = join(resourcesDir, 'msys2.sfx.exe');
  const tempExtractDir = join(tmpdir(), `msys2-temp-${randomUUID()}`);

  // Download
  await downloadFile(msys2Url, tempArchive);

  // Clean up any existing temp extract directory
  if (existsSync(tempExtractDir)) {
    try {
      rmSync(tempExtractDir, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.warn(`Warning: Could not remove existing temp directory: ${error.message}`);
    }
  }

  // Ensure temp extract directory exists
  if (!existsSync(tempExtractDir)) {
    try {
      mkdirSync(tempExtractDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create temp directory ${tempExtractDir}: ${error.message}`);
    }
  }

  // Extract .sfx.exe - MSYS2 .sfx.exe files are 7z-based self-extracting archives
  // They can be extracted by running with -o flag (similar to PortableGit)
  console.log(`Extracting MSYS2...`);

  // Try running the .sfx.exe with extraction flags (silent extraction to target dir)
  // MSYS2 .sfx.exe supports: -o"output_dir" -y (yes to all prompts)
  const extractResult = spawnSync(tempArchive, [`-o${tempExtractDir}`, '-y'], {
    stdio: 'inherit',
    shell: false,
    cwd: resourcesDir
  });

  // If that failed, try using 7z if available (fallback)
  if (extractResult.status !== 0) {
    const sevenZResult = spawnSync('7z', ['x', tempArchive, `-o${tempExtractDir}`, '-y'], {
      stdio: 'inherit',
      shell: false
    });

    if (sevenZResult.status !== 0) {
      throw new Error(
        'Failed to extract MSYS2. Tried self-extraction and 7-Zip. ' +
          'The .sfx.exe file should extract automatically. ' +
          'If this fails, please ensure 7-Zip (7z.exe) is installed and available in PATH, ' +
          'or manually run the downloaded .sfx.exe file.'
      );
    }
  }

  // Find the extracted MSYS2 directory
  // MSYS2 extracts to a directory like "msys64" or similar
  const { readdirSync } = await import('fs');
  const entries = readdirSync(tempExtractDir, { withFileTypes: true });
  let extractedMsys2Dir = null;

  // Look for directory containing usr/bin/bash.exe
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidatePath = join(tempExtractDir, entry.name);
      const candidateBashExe = join(candidatePath, 'usr', 'bin', 'bash.exe');
      if (existsSync(candidateBashExe)) {
        extractedMsys2Dir = candidatePath;
        break;
      }
    }
  }

  // If no subdirectory found, check if bash.exe is directly in tempExtractDir/usr/bin
  if (!extractedMsys2Dir) {
    const directBashExe = join(tempExtractDir, 'usr', 'bin', 'bash.exe');
    if (existsSync(directBashExe)) {
      extractedMsys2Dir = tempExtractDir;
    }
  }

  if (!extractedMsys2Dir) {
    throw new Error(
      `MSYS2 extraction failed: Could not find usr/bin/bash.exe in extracted files. ` +
        `Contents: ${entries.map((e) => e.name).join(', ')}`
    );
  }

  // Remove existing msys2 directory if it exists
  if (existsSync(msys2Dir)) {
    rmSync(msys2Dir, { recursive: true, force: true, maxRetries: 3 });
  }

  // Copy extracted directory to target location
  const { cpSync } = await import('fs');
  cpSync(extractedMsys2Dir, msys2Dir, { recursive: true });

  // Verify essential tools are present
  const essentialTools = [
    { path: join(msys2Dir, 'usr', 'bin', 'bash.exe'), name: 'bash' },
    { path: join(msys2Dir, 'usr', 'bin', 'awk.exe'), name: 'awk' },
    { path: join(msys2Dir, 'usr', 'bin', 'sed.exe'), name: 'sed' },
    { path: join(msys2Dir, 'usr', 'bin', 'grep.exe'), name: 'grep' }
  ];

  const missingTools = essentialTools.filter((tool) => !existsSync(tool.path));
  if (missingTools.length > 0) {
    throw new Error(
      `MSYS2 is missing essential tools: ${missingTools.map((t) => t.name).join(', ')}. ` +
        `Extraction may have failed.`
    );
  }

  console.log('✓ Verified MSYS2 includes essential tools (bash, awk, sed, grep)');

  // Clean up
  rmSync(tempArchive);
  rmSync(tempExtractDir, { recursive: true });

  // Write version file with 'latest' to indicate we're using the latest release
  writeFileSync(msys2VersionFile, MSYS2_VERSION);

  console.log(`✓ MSYS2 (latest) installed successfully`);
}

/**
 * Main function
 */
async function main() {
  console.log('\n=== Downloading Runtime Binaries ===\n');

  // Ensure resources directory exists
  mkdirSync(resourcesDir, { recursive: true });
  removeLegacyArtifacts();

  try {
    await downloadJq();
    await downloadPortableGit();
    await downloadMsys2();
    console.log('\n✓ All runtime binaries ready\n');
  } catch (error) {
    console.error('\n✗ Failed to download runtime binaries:', error.message);
    process.exit(1);
  }
}

// Run if called directly
// Check if this script is being run directly (not imported)
// Use path resolution to handle Windows path differences
const currentFile = resolve(fileURLToPath(import.meta.url));
const scriptArg = process.argv[1] ? resolve(process.argv[1]) : '';
const isMainModule =
  currentFile === scriptArg || currentFile.toLowerCase() === scriptArg.toLowerCase();

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default main;
