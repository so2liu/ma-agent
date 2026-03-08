import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, stderr, stdout].filter(Boolean).join('\n')
    );
  }

  return result.stdout?.trim() ?? '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNotaryCredentials() {
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;

  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    return null;
  }

  return {
    appleId: APPLE_ID,
    password: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  };
}

async function waitForNotarySubmission(id, credentials) {
  const startedAt = Date.now();
  const timeoutMs = 75 * 60 * 1000;
  const intervalMs = 30 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    const raw = run('xcrun', [
      'notarytool',
      'info',
      id,
      '--apple-id',
      credentials.appleId,
      '--password',
      credentials.password,
      '--team-id',
      credentials.teamId,
      '--output-format',
      'json'
    ]);
    const info = JSON.parse(raw);
    const status = info.status ?? 'Unknown';
    console.log(`Notarization ${id}: ${status}`);

    if (status === 'Accepted') {
      return info;
    }

    if (status === 'Invalid' || status === 'Rejected') {
      const log = run('xcrun', [
        'notarytool',
        'log',
        id,
        '--apple-id',
        credentials.appleId,
        '--password',
        credentials.password,
        '--team-id',
        credentials.teamId
      ]);
      throw new Error(`Notarization failed for submission ${id}\n${log}`);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for notarization submission ${id}`);
}

export default async function notarize(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const credentials = getNotaryCredentials();
  if (!credentials) {
    console.log('Skipping notarization: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set');
    return;
  }

  const appName = `${packager.appInfo.productFilename}.app`;
  const appPath = join(appOutDir, appName);
  const tempDir = mkdtempSync(join(tmpdir(), 'ma-agent-notarize-'));
  const zipPath = join(tempDir, `${packager.appInfo.productFilename}.zip`);

  try {
    console.log(`Zipping app for notarization: ${appPath}`);
    run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appName, zipPath], {
      cwd: appOutDir
    });

    console.log('Submitting app to Apple notarization service...');
    const submissionRaw = run('xcrun', [
      'notarytool',
      'submit',
      zipPath,
      '--apple-id',
      credentials.appleId,
      '--password',
      credentials.password,
      '--team-id',
      credentials.teamId,
      '--output-format',
      'json'
    ]);
    const submission = JSON.parse(submissionRaw);
    const submissionId = submission.id;

    if (!submissionId) {
      throw new Error(`Notary submission did not return an id\n${submissionRaw}`);
    }

    console.log(`Submitted notarization request: ${submissionId}`);
    await waitForNotarySubmission(submissionId, credentials);

    console.log(`Stapling notarization ticket to ${appPath}`);
    run('xcrun', ['stapler', 'staple', appPath]);
    run('xcrun', ['stapler', 'validate', appPath]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
