/**
 * Hook that tracks canvas element changes for bidirectional sync.
 * Compares snapshots to detect added/modified/deleted elements,
 * producing CanvasChange[] that appear as input box attachments.
 * Supports multiple files simultaneously.
 */

import { useCallback, useRef, useState } from 'react';

import type { CanvasChange, SimpleElement } from '../../shared/types/canvas';

function summarizeElement(el: SimpleElement): string {
  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return el.label ? `${el.type} "${el.label}"` : el.type;
    case 'arrow':
      return el.label ? `arrow "${el.label}"` : 'arrow';
    case 'text':
      return `text "${el.text.slice(0, 30)}"`;
    case 'line':
      return `line (${el.points.length} points)`;
    default:
      return 'element';
  }
}

function diffElements(
  prev: Map<string, SimpleElement>,
  next: Map<string, SimpleElement>
): CanvasChange[] {
  const changes: CanvasChange[] = [];

  for (const [id, el] of next) {
    const old = prev.get(id);
    if (!old) {
      changes.push({
        type: 'added',
        elementId: id,
        elementType: el.type,
        summary: `Added ${summarizeElement(el)}`
      });
    } else if (JSON.stringify(old) !== JSON.stringify(el)) {
      changes.push({
        type: 'modified',
        elementId: id,
        elementType: el.type,
        summary: `Modified ${summarizeElement(el)}`
      });
    }
  }

  for (const [id, el] of prev) {
    if (!next.has(id)) {
      changes.push({
        type: 'deleted',
        elementId: id,
        elementType: el.type,
        summary: `Deleted ${summarizeElement(el)}`
      });
    }
  }

  return changes;
}

/** Per-file changes keyed by file path */
export type FileChangesMap = Map<string, CanvasChange[]>;

export interface CanvasChangesState {
  /** All pending changes grouped by file */
  changesByFile: FileChangesMap;
  /** Total change count across all files */
  totalChanges: number;
  /** Clear all changes (after sending) */
  clearChanges: () => void;
  /** Handle elements change from ExcalidrawCanvas */
  handleElementsChange: (filePath: string, elements: SimpleElement[]) => void;
}

export function useCanvasChanges(): CanvasChangesState {
  const [changesByFile, setChangesByFile] = useState<FileChangesMap>(new Map());
  const snapshotRef = useRef<Map<string, Map<string, SimpleElement>>>(new Map());

  const handleElementsChange = useCallback(
    (fp: string, elements: SimpleElement[]) => {
      const nextMap = new Map(elements.map((el) => [el.id, el]));

      const prevMap = snapshotRef.current.get(fp);
      if (!prevMap) {
        snapshotRef.current.set(fp, nextMap);
        return;
      }

      const newChanges = diffElements(prevMap, nextMap);
      if (newChanges.length > 0) {
        setChangesByFile((prev) => {
          const next = new Map(prev);
          const existing = next.get(fp) ?? [];
          // Merge by elementId
          const byId = new Map(existing.map((c) => [c.elementId, c]));
          for (const c of newChanges) {
            byId.set(c.elementId, c);
          }
          next.set(fp, Array.from(byId.values()));
          return next;
        });
      }

      snapshotRef.current.set(fp, nextMap);
    },
    []
  );

  const clearChanges = useCallback(() => {
    setChangesByFile(new Map());
  }, []);

  let totalChanges = 0;
  for (const changes of changesByFile.values()) {
    totalChanges += changes.length;
  }

  return { changesByFile, totalChanges, clearChanges, handleElementsChange };
}
