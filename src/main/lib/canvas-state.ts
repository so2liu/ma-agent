/**
 * In-memory cache of canvas states, indexed by file path.
 * Used by CLI tools and IPC handlers to get the latest state
 * including unsaved user edits from the renderer.
 */

import type { SimpleElement } from '../../shared/types/canvas';

interface CanvasSnapshot {
  filePath: string;
  elements: SimpleElement[];
  updatedAt: number;
}

const snapshots = new Map<string, CanvasSnapshot>();

export function updateCanvasState(filePath: string, elements: SimpleElement[]): void {
  snapshots.set(filePath, { filePath, elements, updatedAt: Date.now() });
}

export function getCanvasState(filePath: string): CanvasSnapshot | undefined {
  return snapshots.get(filePath);
}

export function removeCanvasState(filePath: string): void {
  snapshots.delete(filePath);
}

export function listCanvasStates(): CanvasSnapshot[] {
  return [...snapshots.values()];
}
