/**
 * Executes agent-generated TypeScript code that uses the Excalidraw SDK.
 * Runs as a `bun run` subprocess with timeout and output size limits.
 */

import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';

import type { SDKOutput } from '../../shared/types/canvas';
import { getWorkspaceDir } from './config';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5MB

interface SDKRunResult {
  success: boolean;
  output?: SDKOutput;
  error?: string;
}

export async function runSDKCode(code: string): Promise<SDKRunResult> {
  const workspace = getWorkspaceDir();
  const tmpDir = join(workspace, '.excalidraw-tmp');
  await mkdir(tmpDir, { recursive: true });

  const timestamp = Date.now();
  const scriptPath = join(tmpDir, `sdk-${timestamp}.ts`);

  try {
    await writeFile(scriptPath, code, 'utf-8');

    const result = await executeScript(scriptPath);

    // Clean up temp file
    await unlink(scriptPath).catch(() => {});

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Parse the JSON output from stdout
    try {
      const output = JSON.parse(result.stdout!) as SDKOutput;
      if (!output.filePath || !Array.isArray(output.operations)) {
        return { success: false, error: 'Invalid SDK output format' };
      }
      return { success: true, output };
    } catch {
      return { success: false, error: `Failed to parse SDK output: ${result.stdout?.slice(0, 200)}` };
    }
  } catch (error) {
    await unlink(scriptPath).catch(() => {});
    return { success: false, error: String(error) };
  }
}

function executeScript(
  scriptPath: string
): Promise<{ success: boolean; stdout?: string; error?: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let totalBytes = 0;
    let killed = false;

    const proc = spawn('bun', ['run', scriptPath], {
      timeout: TIMEOUT_MS,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_OUTPUT_BYTES) {
        killed = true;
        proc.kill('SIGTERM');
        return;
      }
      chunks.push(chunk);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      errChunks.push(chunk);
    });

    proc.on('close', (code) => {
      if (killed) {
        resolve({ success: false, error: `Output exceeded ${MAX_OUTPUT_BYTES / 1024 / 1024}MB limit` });
        return;
      }

      const stdout = Buffer.concat(chunks).toString('utf-8').trim();
      const stderr = Buffer.concat(errChunks).toString('utf-8').trim();

      if (code !== 0) {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }

      resolve({ success: true, stdout });
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to start bun: ${err.message}` });
    });
  });
}
