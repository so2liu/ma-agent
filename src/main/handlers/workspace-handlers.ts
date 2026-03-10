import { watch, type FSWatcher } from 'fs';
import { readdir, readFile, rm, stat } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';
import { ipcMain, shell, type BrowserWindow } from 'electron';

import { ALL_TEXT_EXTENSIONS, MAX_PREVIEW_FILE_SIZE } from '../../shared/file-extensions';
import { getWorkspaceDir } from '../lib/config';

function isWithinWorkspace(fullPath: string, workspaceDir: string): boolean {
  const resolved = resolve(workspaceDir);
  return fullPath === resolved || fullPath.startsWith(resolved + sep);
}

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
  avif: 'image/avif',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  css: 'text/css',
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  py: 'text/x-python',
  rb: 'text/x-ruby',
  go: 'text/x-go',
  rs: 'text/x-rust',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  h: 'text/x-c',
  hpp: 'text/x-c++',
  sh: 'text/x-sh',
  bash: 'text/x-sh',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/toml',
  xml: 'text/xml',
  sql: 'text/x-sql',
  graphql: 'text/x-graphql',
  vue: 'text/x-vue',
  svelte: 'text/x-svelte'
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

let fileWatcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let storedGetMainWindow: (() => BrowserWindow | null) | null = null;

/** Restart the file watcher on the current workspace directory. Safe to call repeatedly. */
export function restartFileWatcher(): void {
  stopFileWatcher();
  if (!storedGetMainWindow) return;

  const getMainWindow = storedGetMainWindow;
  const workspaceDir = getWorkspaceDir();
  try {
    fileWatcher = watch(workspaceDir, { recursive: true }, (_eventType, filename) => {
      if (filename && IGNORED_NAMES.has(filename.split(sep)[0]!)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('workspace:files-changed');
        }
      }, 300);
    });

    fileWatcher.on('error', () => {
      stopFileWatcher();
    });
  } catch {
    // watch() can throw if directory doesn't exist yet
  }
}

function stopFileWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}

export function registerWorkspaceHandlers(getMainWindow: () => BrowserWindow | null): void {
  storedGetMainWindow = getMainWindow;

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
    if (!isWithinWorkspace(fullPath, workspaceDir)) {
      return { success: false, error: 'Path traversal not allowed' };
    }

    try {
      const ext = relativePath.split('.').pop()?.toLowerCase() || '';
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
      const isText = ALL_TEXT_EXTENSIONS.has(ext);

      if (isText) {
        const fileStat = await stat(fullPath);
        if (fileStat.size > MAX_PREVIEW_FILE_SIZE) {
          return {
            success: false,
            error: `File is too large to preview (${Math.round(fileStat.size / 1024)}KB, max ${Math.round(MAX_PREVIEW_FILE_SIZE / 1024)}KB)`
          };
        }
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

  ipcMain.handle(
    'workspace:delete-file',
    async (_event, relativePath: string, isDirectory: boolean) => {
      const workspaceDir = getWorkspaceDir();
      const fullPath = resolve(join(workspaceDir, relativePath));

      if (!isWithinWorkspace(fullPath, workspaceDir)) {
        return { success: false, error: 'Path traversal not allowed' };
      }

      try {
        const fileStat = await stat(fullPath);
        if (isDirectory && !fileStat.isDirectory()) {
          return { success: false, error: 'Expected directory but found file' };
        }
        if (!isDirectory && fileStat.isDirectory()) {
          return { success: false, error: 'Expected file but found directory' };
        }
        await rm(fullPath, { recursive: isDirectory });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('workspace:open-file', async (_event, relativePath: string) => {
    const workspaceDir = getWorkspaceDir();
    const fullPath = resolve(join(workspaceDir, relativePath));

    if (!isWithinWorkspace(fullPath, workspaceDir)) {
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
