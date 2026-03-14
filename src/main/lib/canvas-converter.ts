/**
 * Pure-data converter: SimpleElement ↔ intermediate excalidraw-like JSON.
 * Runs in main process (no DOM dependencies).
 *
 * The "intermediate" format is close to excalidraw's native JSON but without
 * fields that require the excalidraw library (boundElements, binding coords, etc.).
 * The renderer-side converter handles the final step.
 */

import type {
  SimpleElement,
  SimpleRect,
  SimpleEllipse,
  SimpleDiamond,
  SimpleArrow,
  SimpleText,
  SimpleLine,
  ElementColor
} from '../../shared/types/canvas';
import { COLOR_MAP, REVERSE_COLOR_MAP } from '../../shared/types/canvas';

/** Intermediate element format — close to excalidraw JSON but agent-agnostic. */
export interface IntermediateElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  label?: { text: string; fontSize?: number };
  points?: [number, number][];
  fontSize?: number;
  text?: string;
  /** Arrow binding references (resolved by renderer converter). */
  fromId?: string;
  toId?: string;
}

function colorToHex(color?: ElementColor): string {
  return color ? (COLOR_MAP[color] ?? COLOR_MAP.black) : COLOR_MAP.black;
}

function fillToExcalidraw(fill?: string): { backgroundColor: string; fillStyle: string } {
  if (!fill || fill === 'none') {
    return { backgroundColor: 'transparent', fillStyle: 'solid' };
  }
  return { backgroundColor: '#a5d8ff', fillStyle: fill }; // light blue default fill
}

function shapeToIntermediate(
  el: SimpleRect | SimpleEllipse | SimpleDiamond
): IntermediateElement {
  const { backgroundColor, fillStyle } = fillToExcalidraw(el.fill);
  return {
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.w,
    height: el.h,
    strokeColor: colorToHex(el.color),
    backgroundColor,
    fillStyle,
    ...(el.label ? { label: { text: el.label } } : {})
  };
}

export function toIntermediateElements(simplified: SimpleElement[]): IntermediateElement[] {
  return simplified.map((el): IntermediateElement => {
    switch (el.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
        return shapeToIntermediate(el);

      case 'arrow':
        return {
          id: el.id,
          type: 'arrow',
          x: 0,
          y: 0,
          strokeColor: colorToHex(el.color),
          fromId: el.from,
          toId: el.to,
          ...(el.label ? { label: { text: el.label } } : {})
        };

      case 'text':
        return {
          id: el.id,
          type: 'text',
          x: el.x,
          y: el.y,
          text: el.text,
          fontSize: el.fontSize ?? 20,
          strokeColor: colorToHex(el.color)
        };

      case 'line':
        return {
          id: el.id,
          type: 'line',
          x: el.points[0]?.[0] ?? 0,
          y: el.points[0]?.[1] ?? 0,
          points: el.points.map(([px, py]) => [
            px - (el.points[0]?.[0] ?? 0),
            py - (el.points[0]?.[1] ?? 0)
          ]) as [number, number][],
          strokeColor: colorToHex(el.color)
        };
    }
  });
}

function hexToColor(hex: string): ElementColor {
  return REVERSE_COLOR_MAP[hex] ?? 'black';
}

export function toSimplifiedElements(intermediates: IntermediateElement[]): SimpleElement[] {
  const results: SimpleElement[] = [];

  for (const el of intermediates) {
    const color = hexToColor(el.strokeColor ?? '#1e1e1e');

    switch (el.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        const base = {
          id: el.id,
          type: el.type as 'rectangle' | 'ellipse' | 'diamond',
          x: el.x,
          y: el.y,
          w: el.width ?? 0,
          h: el.height ?? 0,
          color,
          ...(el.label ? { label: el.label.text } : {}),
          ...(el.fillStyle && el.fillStyle !== 'solid'
            ? { fill: el.fillStyle as SimpleRect['fill'] }
            : el.backgroundColor && el.backgroundColor !== 'transparent'
              ? { fill: 'solid' as const }
              : {})
        };
        results.push(base as SimpleElement);
        break;
      }

      case 'arrow':
        results.push({
          id: el.id,
          type: 'arrow',
          from: el.fromId ?? '',
          to: el.toId ?? '',
          color,
          ...(el.label ? { label: el.label.text } : {})
        } as SimpleArrow);
        break;

      case 'text':
        results.push({
          id: el.id,
          type: 'text',
          x: el.x,
          y: el.y,
          text: el.text ?? '',
          fontSize: el.fontSize,
          color
        } as SimpleText);
        break;

      case 'line':
        results.push({
          id: el.id,
          type: 'line',
          points: (el.points ?? []).map(([px, py]) => [px + el.x, py + el.y]) as [
            number,
            number
          ][],
          color
        } as SimpleLine);
        break;
    }
  }

  return results;
}
