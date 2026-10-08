export interface Pt { x: number; y: number }

/** Zoom limits, relative to the automatic fit of the board. */
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.4;

export interface PinchStart { dist: number; zoom: number; mid: Pt; pan: Pt }

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Remember the state when a second finger touches down. */
export function startPinch(a: Pt, b: Pt, zoom: number, pan: Pt): PinchStart {
  return { dist: Math.max(dist(a, b), 1), zoom, mid: mid(a, b), pan };
}

/** Spreading the fingers zooms in, pinching zooms out, and moving both fingers together pans. */
export function updatePinch(start: PinchStart, a: Pt, b: Pt): { zoom: number; pan: Pt } {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.zoom * (dist(a, b) / start.dist)));
  const m = mid(a, b);
  return { zoom, pan: { x: start.pan.x + (m.x - start.mid.x), y: start.pan.y + (m.y - start.mid.y) } };
}

/** Two quick taps close together. */
export function isDoubleTap(prev: (Pt & { t: number }) | null, now: Pt & { t: number }, maxMs = 300, maxDist = 30): boolean {
  return !!prev && now.t - prev.t <= maxMs && dist(prev, now) <= maxDist;
}
