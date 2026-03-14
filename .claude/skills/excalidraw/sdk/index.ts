/**
 * Excalidraw SDK for AI agent.
 *
 * Usage:
 *   import { ExcalidrawSDK } from './sdk';
 *   const canvas = await ExcalidrawSDK.load('diagram.excalidraw');
 *   const box1 = canvas.createRectangle({ x: 100, y: 100, w: 200, h: 80, label: '服务A' });
 *   const box2 = canvas.createRectangle({ x: 400, y: 100, w: 200, h: 80, label: '服务B' });
 *   canvas.createArrow({ from: box1, to: box2, label: '调用' });
 *   await canvas.commit();
 */

import { readFileSync } from 'fs';

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

interface RectOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: ElementColor;
  fill?: FillStyle;
}

interface EllipseOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: ElementColor;
  fill?: FillStyle;
}

interface DiamondOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  color?: ElementColor;
  fill?: FillStyle;
}

interface ArrowOpts {
  from: ElementRef | string;
  to: ElementRef | string;
  label?: string;
  color?: ElementColor;
}

interface TextOpts {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  color?: ElementColor;
}

interface LineOpts {
  points: [number, number][];
  color?: ElementColor;
}

type SDKOperation =
  | { op: 'create'; element: Record<string, unknown> }
  | { op: 'update'; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; id: string };

let idCounter = 0;
function genId(): string {
  return `sdk_${Date.now()}_${++idCounter}`;
}

export class ElementRef {
  readonly id: string;
  private sdk: ExcalidrawSDK;

  constructor(id: string, sdk: ExcalidrawSDK) {
    this.id = id;
    this.sdk = sdk;
  }

  update(patch: Record<string, unknown>): void {
    this.sdk._addOp({ op: 'update', id: this.id, patch });
  }

  delete(): void {
    this.sdk._addOp({ op: 'delete', id: this.id });
  }

  toString(): string {
    return this.id;
  }
}

export class ExcalidrawSDK {
  private filePath: string;
  private operations: SDKOperation[] = [];

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async load(filePath: string): Promise<ExcalidrawSDK> {
    // Verify file exists (will throw if not)
    try {
      readFileSync(filePath, 'utf-8');
    } catch {
      // File may not exist yet — that's ok for new canvases
    }
    return new ExcalidrawSDK(filePath);
  }

  /** @internal */
  _addOp(op: SDKOperation): void {
    this.operations.push(op);
  }

  createRectangle(opts: RectOpts): ElementRef {
    const id = genId();
    this._addOp({
      op: 'create',
      element: { id, type: 'rectangle', ...opts }
    });
    return new ElementRef(id, this);
  }

  createEllipse(opts: EllipseOpts): ElementRef {
    const id = genId();
    this._addOp({
      op: 'create',
      element: { id, type: 'ellipse', ...opts }
    });
    return new ElementRef(id, this);
  }

  createDiamond(opts: DiamondOpts): ElementRef {
    const id = genId();
    this._addOp({
      op: 'create',
      element: { id, type: 'diamond', ...opts }
    });
    return new ElementRef(id, this);
  }

  createArrow(opts: ArrowOpts): ElementRef {
    const id = genId();
    const from = opts.from instanceof ElementRef ? opts.from.id : opts.from;
    const to = opts.to instanceof ElementRef ? opts.to.id : opts.to;
    this._addOp({
      op: 'create',
      element: { id, type: 'arrow', from, to, label: opts.label, color: opts.color }
    });
    return new ElementRef(id, this);
  }

  createText(opts: TextOpts): ElementRef {
    const id = genId();
    this._addOp({
      op: 'create',
      element: { id, type: 'text', ...opts }
    });
    return new ElementRef(id, this);
  }

  createLine(opts: LineOpts): ElementRef {
    const id = genId();
    this._addOp({
      op: 'create',
      element: { id, type: 'line', ...opts }
    });
    return new ElementRef(id, this);
  }

  async commit(): Promise<void> {
    const output = {
      filePath: this.filePath,
      operations: this.operations
    };
    // Output JSON to stdout for main process to consume
    console.log(JSON.stringify(output));
  }
}
