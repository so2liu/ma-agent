import { readdir, readFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { ipcMain, shell } from 'electron';

import { getWorkspaceDir } from '../lib/config';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.next',
  '.venv',
  'dist',
  '.DS_Store',
  '.Trash',
  'Thumbs.db'
]);

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif'
};

async function listDirectory(
  dirPath: string,
  basePath: string,
  depth: number = 0,
  maxDepth: number = 5
): Promise<FileTreeNode[]> {
  if (depth > maxDepth) return [];

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;

    const fullPath = join(dirPath, entry.name);
    const relativePath = relative(basePath, fullPath);

    if (entry.isDirectory()) {
      const children = await listDirectory(fullPath, basePath, depth + 1, maxDepth);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children
      });
    } else {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file'
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:list-files', async () => {
    const workspaceDir = getWorkspaceDir();
    try {
      const files = await listDirectory(workspaceDir, workspaceDir);
      return { success: true, files, workspaceDir };
    } catch (error) {
      return { success: false, error: String(error), files: [], workspaceDir };
    }
  });

  ipcMain.handle('workspace:read-file', async (_event, relativePath: string) => {
    const workspaceDir = getWorkspaceDir();
    const fullPath = resolve(join(workspaceDir, relativePath));

    // Security: prevent path traversal
    if (!fullPath.startsWith(resolve(workspaceDir))) {
      return { success: false, error: 'Path traversal not allowed' };
    }

    try {
      const ext = relativePath.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
      const isText = ['html', 'htm', 'svg', 'md', 'txt', 'css', 'js', 'json'].includes(ext);

      if (isText) {
        const content = await readFile(fullPath, 'utf-8');
        return { success: true, content, mimeType, isText: true };
      } else {
        const buffer = await readFile(fullPath);
        const base64 = buffer.toString('base64');
        return { success: true, content: base64, mimeType, isText: false };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('workspace:open-file', async (_event, relativePath: string) => {
    const workspaceDir = getWorkspaceDir();
    const fullPath = resolve(join(workspaceDir, relativePath));

    if (!fullPath.startsWith(resolve(workspaceDir))) {
      return { success: false, error: 'Path traversal not allowed' };
    }

    try {
      // Use openExternal with file:// URL to open in default browser
      await shell.openExternal(`file://${fullPath}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
