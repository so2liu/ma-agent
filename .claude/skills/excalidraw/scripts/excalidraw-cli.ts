#!/usr/bin/env bun
/**
 * CLI tool for querying Excalidraw canvas state.
 *
 * Usage:
 *   excalidraw-cli read <file.excalidraw>    — Output simplified elements JSON
 */

import { readFileSync } from 'fs';

const COLOR_MAP: Record<string, string> = {
  '#1e1e1e': 'black',
  '#1971c2': 'blue',
  '#e03131': 'red',
  '#2f9e44': 'green',
  '#e8590c': 'orange',
  '#6741d9': 'purple',
  '#c2255c': 'pink',
  '#e09f00': 'yellow',
  '#868e96': 'gray'
};

function hexToColor(hex: string): string {
  return COLOR_MAP[hex] ?? 'black';
}

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  text?: string;
  fontSize?: number;
  points?: [number, number][];
  startBinding?: { elementId: string };
  endBinding?: { elementId: string };
  boundElements?: { type: string; id: string }[];
  isDeleted?: boolean;
}

function toSimplified(elements: ExcalidrawElement[]) {
  // Build set of bound text IDs
  const boundTextIds = new Set<string>();
  const textById = new Map<string, ExcalidrawElement>();

  for (const el of elements) {
    if (el.type === 'text') textById.set(el.id, el);
  }
  for (const el of elements) {
    if (el.boundElements) {
      for (const b of el.boundElements) {
        if (b.type === 'text') boundTextIds.add(b.id);
      }
    }
  }

  const results: Record<string, unknown>[] = [];

  for (const el of elements) {
    if (el.isDeleted) continue;
    if (boundTextIds.has(el.id)) continue;

    // Find label from bound text
    let label: string | undefined;
    if (el.boundElements) {
      const boundText = el.boundElements.find((b) => b.type === 'text');
      if (boundText) {
        const textEl = textById.get(boundText.id);
        if (textEl?.text) label = textEl.text;
      }
    }

    const color = hexToColor(el.strokeColor ?? '#1e1e1e');

    switch (el.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
        results.push({
          id: el.id,
          type: el.type,
          x: el.x,
          y: el.y,
          w: el.width ?? 0,
          h: el.height ?? 0,
          color,
          ...(label ? { label } : {})
        });
        break;

      case 'arrow':
        results.push({
          id: el.id,
          type: 'arrow',
          from: el.startBinding?.elementId ?? '',
          to: el.endBinding?.elementId ?? '',
          color,
          ...(label ? { label } : {})
        });
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
        });
        break;

      case 'line':
        results.push({
          id: el.id,
          type: 'line',
          points: (el.points ?? []).map(([px, py]) => [px + el.x, py + el.y]),
          color
        });
        break;
    }
  }

  return results;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'read') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: excalidraw-cli read <file.excalidraw>');
      process.exit(1);
    }

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const elements = data.elements ?? [];
      const simplified = toSimplified(elements);
      console.log(JSON.stringify(simplified, null, 2));
    } catch (err) {
      console.error(`Error reading file: ${err}`);
      process.exit(1);
    }
  } else {
    console.error('Usage: excalidraw-cli <read> <file.excalidraw>');
    process.exit(1);
  }
}

main();
