import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, isAbsolute, join, resolve } from 'path';
import { BrowserWindow, ipcMain } from 'electron';

import type { SimpleElement } from '../../shared/types/canvas';
import { toSimplifiedElements } from '../lib/canvas-converter';
import { getCanvasState, updateCanvasState } from '../lib/canvas-state';
import { getWorkspaceDir } from '../lib/config';

function isInsideWorkspace(filePath: string): boolean {
  const workspace = resolve(getWorkspaceDir()) + '/';
  const resolved = resolve(filePath);
  return resolved.startsWith(workspace) || resolved === workspace.slice(0, -1);
}

function resolveCanvasPath(filePathOrRelative: string): string {
  if (isAbsolute(filePathOrRelative)) return filePathOrRelative;
  return join(getWorkspaceDir(), filePathOrRelative);
}

export function registerCanvasHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  // Load .excalidraw file → simplified elements
  ipcMain.handle(
    'canvas:load-file',
    async (_event, filePath: string): Promise<{ success: boolean; elements?: SimpleElement[]; error?: string }> => {
      try {
        const absPath = resolveCanvasPath(filePath);
        if (!isInsideWorkspace(absPath)) {
          return { success: false, error: 'File path outside workspace' };
        }
        const raw = await readFile(absPath, 'utf-8');
        const data = JSON.parse(raw);
        // Standard .excalidraw format has elements array
        const excalidrawElements = data.elements ?? [];
        const simplified = toSimplifiedElements(
          excalidrawElements.map((el: Record<string, unknown>) => ({
            id: el.id as string,
            type: el.type as string,
            x: (el.x as number) ?? 0,
            y: (el.y as number) ?? 0,
            width: el.width as number | undefined,
            height: el.height as number | undefined,
            strokeColor: el.strokeColor as string | undefined,
            backgroundColor: el.backgroundColor as string | undefined,
            fillStyle: el.fillStyle as string | undefined,
            text: el.text as string | undefined,
            fontSize: el.fontSize as number | undefined,
            points: el.points as [number, number][] | undefined,
            // Arrow bindings
            fromId: (el.startBinding as { elementId: string } | undefined)?.elementId,
            toId: (el.endBinding as { elementId: string } | undefined)?.elementId,
            // Label from bound text (handled separately in renderer converter)
            label: undefined
          }))
        );
        updateCanvasState(absPath, simplified);
        return { success: true, elements: simplified };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // Save excalidraw content to file
  ipcMain.handle(
    'canvas:save-file',
    async (_event, filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const absPath = resolveCanvasPath(filePath);
        if (!isInsideWorkspace(absPath)) {
          return { success: false, error: 'File path outside workspace' };
        }
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(absPath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // Create a new .excalidraw file with empty canvas
  ipcMain.handle(
    'canvas:create-file',
    async (_event, filePath: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const absPath = resolveCanvasPath(filePath);
        if (!isInsideWorkspace(absPath)) {
          return { success: false, error: 'File path outside workspace' };
        }
        const emptyCanvas = {
          type: 'excalidraw',
          version: 2,
          source: 'jackson',
          elements: [],
          appState: { viewBackgroundColor: '#ffffff' }
        };
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(absPath, JSON.stringify(emptyCanvas, null, 2), 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // Update canvas state from renderer (user edits)
  ipcMain.handle(
    'canvas:update-state',
    async (_event, filePath: string, elements: SimpleElement[]): Promise<{ success: boolean; error?: string }> => {
      const absPath = resolveCanvasPath(filePath);
      if (!isInsideWorkspace(absPath)) {
        return { success: false, error: 'File path outside workspace' };
      }
      updateCanvasState(absPath, elements);
      return { success: true };
    }
  );

  // Get canvas state (for CLI tools)
  ipcMain.handle(
    'canvas:get-state',
    async (_event, filePath: string): Promise<{ success: boolean; elements?: SimpleElement[]; error?: string }> => {
      const absPath = resolveCanvasPath(filePath);
      if (!isInsideWorkspace(absPath)) {
        return { success: false, error: 'File path outside workspace' };
      }
      const state = getCanvasState(absPath);
      if (!state) {
        return { success: false, error: 'Canvas not loaded' };
      }
      return { success: true, elements: state.elements };
    }
  );

  // Notify renderer to update canvas with new elements from SDK execution
  ipcMain.handle(
    'canvas:apply-sdk-result',
    async (
      _event,
      filePath: string,
      intermediateElementsJson: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const mainWindow = getMainWindow();
        if (!mainWindow) return { success: false, error: 'No window' };

        mainWindow.webContents.send('canvas:elements-updated', {
          filePath: resolveCanvasPath(filePath),
          intermediateElements: JSON.parse(intermediateElementsJson)
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // Request screenshot from renderer
  ipcMain.handle(
    'canvas:screenshot',
    async (
      _event,
      filePath: string,
      outputPath: string
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      const mainWindow = getMainWindow();
      if (!mainWindow) return { success: false, error: 'No window' };

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          ipcMain.removeAllListeners('canvas:screenshot-result');
          resolve({ success: false, error: 'Screenshot timeout (10s)' });
        }, 10000);

        // One-time listener for the screenshot result from renderer
        ipcMain.once(
          'canvas:screenshot-result',
          (_ev, result: { success: boolean; path?: string; error?: string }) => {
            clearTimeout(timeout);
            resolve(result);
          }
        );

        mainWindow.webContents.send('canvas:screenshot-request', {
          filePath: resolveCanvasPath(filePath),
          outputPath
        });
      });
    }
  );
}
