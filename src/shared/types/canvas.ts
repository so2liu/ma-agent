/** Simplified element format for agent ↔ canvas communication. */

export type ElementColor =
  | 'black'
  | 'blue'
  | 'red'
  | 'green'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'yellow'
  | 'gray';

export type FillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'none';

interface BaseShape {
  id: string;
  color?: ElementColor;
}

export interface SimpleRect extends BaseShape {
  type: 'rectangle';
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  fill?: FillStyle;
}

export interface SimpleEllipse extends BaseShape {
  type: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  fill?: FillStyle;
}

export interface SimpleDiamond extends BaseShape {
  type: 'diamond';
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  fill?: FillStyle;
}

export interface SimpleArrow extends BaseShape {
  type: 'arrow';
  from: string;
  to: string;
  label?: string;
}

export interface SimpleText extends BaseShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize?: number;
}

export interface SimpleLine extends BaseShape {
  type: 'line';
  points: [number, number][];
}

export type SimpleElement =
  | SimpleRect
  | SimpleEllipse
  | SimpleDiamond
  | SimpleArrow
  | SimpleText
  | SimpleLine;

export const COLOR_MAP: Record<ElementColor, string> = {
  black: '#1e1e1e',
  blue: '#1971c2',
  red: '#e03131',
  green: '#2f9e44',
  orange: '#e8590c',
  purple: '#6741d9',
  pink: '#c2255c',
  yellow: '#e09f00', // excalidraw's yellow (not too bright)
  gray: '#868e96'
};

export const REVERSE_COLOR_MAP: Record<string, ElementColor> = Object.fromEntries(
  Object.entries(COLOR_MAP).map(([k, v]) => [v, k as ElementColor])
) as Record<string, ElementColor>;

/** Operations that the SDK outputs via stdout. */
export type SDKOperation =
  | { op: 'create'; element: SimpleElement }
  | { op: 'update'; id: string; patch: Partial<SimpleElement> }
  | { op: 'delete'; id: string };

export interface SDKOutput {
  filePath: string;
  operations: SDKOperation[];
}

/** Canvas change detected from user edits (for attachment). */
export interface CanvasChange {
  type: 'added' | 'modified' | 'deleted';
  elementId: string;
  elementType: string;
  summary: string;
}
