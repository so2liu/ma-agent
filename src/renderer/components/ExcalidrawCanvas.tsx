import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import type { SimpleElement } from '../../shared/types/canvas';
import {
  fromExcalidrawElements,
  toExcalidrawElements
} from '../lib/canvas-excalidraw-converter';
import type { IntermediateElement } from '../../main/lib/canvas-converter';
import { toSimplifiedElements } from '../../main/lib/canvas-converter';

/** Minimal type for excalidraw API ref (avoids importing internal types). */
interface ExcalidrawAPI {
  getSceneElements: () => readonly ExcalidrawElement[];
  getAppState: () => Record<string, unknown>;
  updateScene: (scene: { elements: ExcalidrawElement[] }) => void;
}

/** Lazy-load excalidraw to avoid pulling it into the initial bundle. */
let ExcalidrawComponent: React.ComponentType<Record<string, unknown>> | null = null;
let exportToBlobFn: ((opts: Record<string, unknown>) => Promise<Blob>) | null = null;
let excalidrawPromise: Promise<void> | null = null;

function loadExcalidraw(): Promise<void> {
  if (ExcalidrawComponent) return Promise.resolve();
  if (!excalidrawPromise) {
    excalidrawPromise = import('@excalidraw/excalidraw').then((mod) => {
      ExcalidrawComponent = mod.Excalidraw;
      exportToBlobFn = mod.exportToBlob as typeof exportToBlobFn;
    });
  }
  return excalidrawPromise;
}

interface ExcalidrawCanvasProps {
  filePath: string;
  onDirtyChange?: (isDirty: boolean) => void;
  onElementsChange?: (elements: SimpleElement[]) => void;
}

export default function ExcalidrawCanvas({
  filePath,
  onDirtyChange,
  onElementsChange
}: ExcalidrawCanvasProps) {
  const [ready, setReady] = useState(!!ExcalidrawComponent);
  const [error, setError] = useState<string | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawAPI | null>(null);
  const lastSavedJsonRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(false);

  // Load excalidraw component
  useEffect(() => {
    if (ExcalidrawComponent) {
      setReady(true);
      return;
    }
    loadExcalidraw()
      .then(() => setReady(true))
      .catch((err) => setError(`Failed to load Excalidraw: ${err}`));
  }, []);

  // Load file content
  const [initialElements, setInitialElements] = useState<unknown[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    isLoadingRef.current = true;

    window.electron.workspace
      .readFile(filePath)
      .then((response) => {
        if (cancelled) return;
        if (!response.success || !response.content) {
          setError(response.error ?? 'Failed to read file');
          return;
        }
        try {
          const data = JSON.parse(response.content);
          const elements = data.elements ?? [];
          setInitialElements(elements);
          lastSavedJsonRef.current = JSON.stringify(elements);

          // Update state cache in main process
          const intermediate = elements.map((el: Record<string, unknown>) => ({
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
            fromId: (el.startBinding as { elementId: string } | undefined)?.elementId,
            toId: (el.endBinding as { elementId: string } | undefined)?.elementId
          }));
          const simplified = toSimplifiedElements(intermediate);
          window.electron.canvas.updateState(filePath, simplified);
        } catch (err) {
          setError(`Invalid .excalidraw file: ${err}`);
        } finally {
          isLoadingRef.current = false;
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Listen for SDK-triggered updates
  useEffect(() => {
    const unsubscribe = window.electron.canvas.onElementsUpdated((data) => {
      if (data.filePath !== filePath || !excalidrawApiRef.current) return;

      const intermediates = data.intermediateElements as IntermediateElement[];
      const currentElements = excalidrawApiRef.current.getSceneElements();
      const newElements = toExcalidrawElements(intermediates, currentElements);

      // Merge: keep existing elements, add/replace from SDK result
      const elementMap = new Map(currentElements.map((el) => [el.id, el]));
      for (const el of newElements) {
        elementMap.set(el.id, el);
      }

      excalidrawApiRef.current.updateScene({
        elements: Array.from(elementMap.values())
      });
    });

    return () => unsubscribe();
  }, [filePath]);

  // Listen for screenshot requests from main process
  useEffect(() => {
    const unsubscribe = window.electron.canvas.onScreenshotRequest(async (data) => {
      if (data.filePath !== filePath) return;

      const api = excalidrawApiRef.current;
      if (!api || !exportToBlobFn) {
        window.electron.canvas.sendScreenshotResult({
          success: false,
          error: 'Canvas not ready'
        });
        return;
      }

      try {
        const elements = api.getSceneElements().filter((e) => !e.isDeleted);
        const blob = await exportToBlobFn({
          elements,
          appState: api.getAppState(),
          mimeType: 'image/png'
        });
        const buffer = await blob.arrayBuffer();
        // Save via IPC — main process writes to outputPath
        await window.electron.canvas.saveFile(
          data.outputPath,
          Buffer.from(buffer).toString('base64')
        );
        window.electron.canvas.sendScreenshotResult({
          success: true,
          path: data.outputPath
        });
      } catch (err) {
        window.electron.canvas.sendScreenshotResult({
          success: false,
          error: String(err)
        });
      }
    });

    return () => unsubscribe();
  }, [filePath]);

  // Flush current scene to disk
  const flushSave = useCallback(async () => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const sceneElements = api.getSceneElements();
    const appState = api.getAppState();

    const content = JSON.stringify(
      {
        type: 'excalidraw',
        version: 2,
        source: 'jackson',
        elements: sceneElements.filter((e) => !e.isDeleted),
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor ?? '#ffffff'
        }
      },
      null,
      2
    );

    const result = await window.electron.canvas.saveFile(filePath, content);
    if (result.success) {
      lastSavedJsonRef.current = JSON.stringify(
        sceneElements.filter((e) => !e.isDeleted)
      );
      onDirtyChange?.(false);
    } else {
      console.error('Save failed:', result.error);
    }
  }, [filePath, onDirtyChange]);

  // Debounced auto-save
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      if (isLoadingRef.current) return;

      // Check dirty state
      const currentJson = JSON.stringify(elements.filter((e) => !e.isDeleted));
      const isDirty = currentJson !== lastSavedJsonRef.current;
      onDirtyChange?.(isDirty);

      // Update simplified elements for state cache
      const intermediate = fromExcalidrawElements(elements);
      const simplified = toSimplifiedElements(intermediate);
      onElementsChange?.(simplified);
      window.electron.canvas.updateState(filePath, simplified);

      // Debounced save to file
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        flushSave().catch((err) => console.error('Failed to save canvas:', err));
      }, 1500);
    },
    [filePath, flushSave, onDirtyChange, onElementsChange]
  );

  // Flush pending save on unmount (prevents data loss on tab switch)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        flushSave().catch((err) => console.error('Flush save on unmount failed:', err));
      }
    };
  }, [flushSave]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>
    );
  }

  if (!ready || initialElements === null) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-400">
        Loading Excalidraw...
      </div>
    );
  }

  const Excalidraw = ExcalidrawComponent!;

  return (
    <div className="h-full w-full">
      <Excalidraw
        ref={(api: unknown) => {
          excalidrawApiRef.current = api as ExcalidrawAPI | null;
        }}
        initialData={{
          elements: initialElements,
          appState: { viewBackgroundColor: '#ffffff' }
        }}
        onChange={handleChange}
      />
    </div>
  );
}
