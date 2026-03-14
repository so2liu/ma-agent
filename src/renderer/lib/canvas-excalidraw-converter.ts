/**
 * Renderer-side converter: intermediate format ↔ excalidraw native format.
 * Uses excalidraw's convertToExcalidrawElements for label/arrow binding.
 */

import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { IntermediateElement } from '../../main/lib/canvas-converter';
import { REVERSE_COLOR_MAP } from '../../shared/types/canvas';

/**
 * Convert intermediate elements → excalidraw native elements.
 * Uses excalidraw's skeleton API to handle label binding and arrow binding.
 */
export function toExcalidrawElements(
  intermediates: IntermediateElement[],
  existingElements: readonly ExcalidrawElement[] = []
): ExcalidrawElement[] {
  const existingMap = new Map(existingElements.map((el) => [el.id, el]));

  const skeletons = intermediates.map((el) => {
    switch (el.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
        return {
          id: el.id,
          type: el.type as 'rectangle' | 'ellipse' | 'diamond',
          x: el.x,
          y: el.y,
          width: el.width ?? 100,
          height: el.height ?? 100,
          strokeColor: el.strokeColor ?? '#1e1e1e',
          backgroundColor: el.backgroundColor ?? 'transparent',
          fillStyle: (el.fillStyle ?? 'solid') as 'solid' | 'hachure' | 'cross-hatch',
          ...(el.label
            ? {
                label: {
                  text: el.label.text,
                  fontSize: el.label.fontSize ?? 20,
                  textAlign: 'center' as const,
                  verticalAlign: 'middle' as const
                }
              }
            : {})
        };

      case 'arrow': {
        const fromEl = el.fromId ? existingMap.get(el.fromId) : undefined;
        const toEl = el.toId ? existingMap.get(el.toId) : undefined;

        // Calculate arrow position from bound elements
        const startX = fromEl ? fromEl.x + (fromEl.width ?? 0) : 0;
        const startY = fromEl ? fromEl.y + (fromEl.height ?? 0) / 2 : 0;
        const endX = toEl ? toEl.x : startX + 100;
        const endY = toEl ? toEl.y + (toEl.height ?? 0) / 2 : startY;

        return {
          id: el.id,
          type: 'arrow' as const,
          x: startX,
          y: startY,
          points: [
            [0, 0],
            [endX - startX, endY - startY]
          ] as [number, number][],
          strokeColor: el.strokeColor ?? '#1e1e1e',
          ...(el.fromId
            ? {
                startBinding: {
                  elementId: el.fromId,
                  focus: 0,
                  gap: 5,
                  fixedPoint: [1, 0.5] as [number, number]
                }
              }
            : {}),
          ...(el.toId
            ? {
                endBinding: {
                  elementId: el.toId,
                  focus: 0,
                  gap: 5,
                  fixedPoint: [0, 0.5] as [number, number]
                }
              }
            : {}),
          ...(el.label
            ? {
                label: {
                  text: el.label.text,
                  fontSize: el.label.fontSize ?? 16,
                  textAlign: 'center' as const,
                  verticalAlign: 'middle' as const
                }
              }
            : {})
        };
      }

      case 'text':
        return {
          id: el.id,
          type: 'text' as const,
          x: el.x,
          y: el.y,
          text: el.text ?? '',
          fontSize: el.fontSize ?? 20,
          strokeColor: el.strokeColor ?? '#1e1e1e'
        };

      case 'line':
        return {
          id: el.id,
          type: 'line' as const,
          x: el.x,
          y: el.y,
          points: el.points ?? [],
          strokeColor: el.strokeColor ?? '#1e1e1e'
        };

      default:
        return {
          id: el.id,
          type: el.type as 'rectangle',
          x: el.x,
          y: el.y,
          width: el.width ?? 100,
          height: el.height ?? 100
        };
    }
  });

  return convertToExcalidrawElements(skeletons as Parameters<typeof convertToExcalidrawElements>[0], {
    regenerateIds: false
  }) as unknown as ExcalidrawElement[];
}

/**
 * Convert excalidraw native elements → intermediate format.
 * Merges bound text elements back into their container's `label` field.
 */
export function fromExcalidrawElements(elements: readonly ExcalidrawElement[]): IntermediateElement[] {
  // Build a set of text element IDs that are bound to containers
  const boundTextIds = new Set<string>();
  const textById = new Map<string, ExcalidrawElement>();

  for (const el of elements) {
    if (el.type === 'text') {
      textById.set(el.id, el);
    }
  }

  for (const el of elements) {
    if ('boundElements' in el && Array.isArray(el.boundElements)) {
      for (const bound of el.boundElements) {
        if (bound.type === 'text') {
          boundTextIds.add(bound.id);
        }
      }
    }
  }

  const results: IntermediateElement[] = [];

  for (const el of elements) {
    // Skip bound text elements — they'll be merged into container's label
    if (boundTextIds.has(el.id)) continue;
    // Skip deleted elements
    if (el.isDeleted) continue;

    // Find bound text label
    let label: { text: string; fontSize?: number } | undefined;
    if ('boundElements' in el && Array.isArray(el.boundElements)) {
      const boundText = el.boundElements.find(
        (b: { type: string; id: string }) => b.type === 'text'
      );
      if (boundText) {
        const textEl = textById.get(boundText.id);
        if (textEl && 'text' in textEl) {
          label = {
            text: textEl.text as string,
            ...('fontSize' in textEl ? { fontSize: textEl.fontSize as number } : {})
          };
        }
      }
    }

    const base: IntermediateElement = {
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      strokeColor: 'strokeColor' in el ? (el.strokeColor as string) : '#1e1e1e'
    };

    switch (el.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
        base.width = el.width;
        base.height = el.height;
        if ('backgroundColor' in el) base.backgroundColor = el.backgroundColor as string;
        if ('fillStyle' in el) base.fillStyle = el.fillStyle as string;
        if (label) base.label = label;
        break;

      case 'arrow':
      case 'line':
        if ('points' in el) base.points = el.points as [number, number][];
        if ('startBinding' in el && el.startBinding) {
          base.fromId = (el.startBinding as { elementId: string }).elementId;
        }
        if ('endBinding' in el && el.endBinding) {
          base.toId = (el.endBinding as { elementId: string }).elementId;
        }
        if (label) base.label = label;
        break;

      case 'text':
        if ('text' in el) base.text = el.text as string;
        if ('fontSize' in el) base.fontSize = el.fontSize as number;
        break;

      default:
        // Other types: include basic geometry
        base.width = el.width;
        base.height = el.height;
        break;
    }

    results.push(base);
  }

  return results;
}

/**
 * Quick helper: get a color name from a hex value.
 */
export function hexToColorName(hex: string): string {
  return REVERSE_COLOR_MAP[hex] ?? 'black';
}
