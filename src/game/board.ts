import type { Hex, Vertex, Edge, Terrain, Harbor, HarborType, BoardMode } from "./types";

export const HEX_SIZE = 56; // base radius in px

// Standard 3-4-5-4-3 layout in axial coords
const HEX_COORDS: Array<[number, number]> = [
  [0, -2], [1, -2], [2, -2],
  [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  [-2, 2], [-1, 2], [0, 2],
];

const RESOURCE_BAG: Terrain[] = [
  "wood","wood","wood","wood",
  "brick","brick","brick",
  "grain","grain","grain","grain",
  "wool","wool","wool","wool",
  "ore","ore","ore",
  "desert",
];

// The classic "beginner" map, listed row by row (3-4-5-4-3), left to right.
const BEGINNER_TERRAIN: Terrain[] = [
  "ore", "wool", "wood",
  "grain", "brick", "wool", "brick",
  "grain", "wood", "desert", "wood", "ore",
  "wood", "ore", "grain", "wool",
  "brick", "grain", "wool",
];
const BEGINNER_NUMBERS: (number | undefined)[] = [
  10, 2, 9,
  12, 6, 4, 10,
  9, 11, undefined, 3, 8,
  8, 3, 4, 5,
  5, 6, 11,
];
// Fixed harbor order for the classic map, clockwise starting at the north edge. Confirmed from the
// default layout: wheat on the north edge, two 3:1 harbors on the south edge, brick to the south-west.
// The other slots (wool, ore, wood and the remaining 3:1s) are my best arrangement, not verified.
const BEGINNER_HARBORS: HarborType[] = ["grain", "wool", "any", "ore", "any", "any", "brick", "wood", "any"];
// Coast edge (counted clockwise from the west) where the north harbor sits on the classic map.
const BEGINNER_HARBOR_START = 7;

const NUMBER_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pointy-top hex corner: i=0 is top, then clockwise
function corner(cx: number, cy: number, i: number): [number, number] {
  const angle = ((-90 + 60 * i) * Math.PI) / 180;
  return [cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle)];
}

export function axialToPixel(q: number, r: number): [number, number] {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
  const y = HEX_SIZE * 1.5 * r;
  return [x, y];
}


// ---------- Number placement (no adjacent 6/8, no adjacent equal numbers) ----------

const AXIAL_DIRS: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const HEX_NEIGHBORS: number[][] = HEX_COORDS.map(([q, r]) => {
  const out: number[] = [];
  AXIAL_DIRS.forEach(([dq, dr]) => {
    const j = HEX_COORDS.findIndex(([a, b]) => a === q + dq && b === r + dr);
    if (j >= 0) out.push(j);
  });
  return out;
});

/**
 * Deal the 18 number tokens onto the land hexes like the classic setup rules:
 * red numbers (6 and 8) never touch, and ideally no two equal numbers touch.
 */
function assignNumbers(terrains: Terrain[], rng: () => number): (number | undefined)[] {
  const land = terrains.map((t, i) => (t === "desert" ? -1 : i)).filter((i) => i >= 0);
  const isHot = (n: number) => n === 6 || n === 8;
  let fallback: (number | undefined)[] | null = null;
  let last: (number | undefined)[] = [];
  for (let attempt = 0; attempt < 3000; attempt++) {
    const nums = shuffle(NUMBER_BAG, rng);
    const layout: (number | undefined)[] = new Array(HEX_COORDS.length).fill(undefined);
    land.forEach((hi, k) => (layout[hi] = nums[k]));
    last = layout;
    let hotOk = true;
    let dupOk = true;
    for (const i of land) {
      const n = layout[i]!;
      for (const j of HEX_NEIGHBORS[i]) {
        const m = layout[j];
        if (m === undefined) continue;
        if (isHot(n) && isHot(m)) hotOk = false;
        if (n === m) dupOk = false;
      }
    }
    if (hotOk && dupOk) return layout;
    if (hotOk && !fallback) fallback = layout;
  }
  return fallback ?? last;
}

// ---------- Harbors ----------

// Distance (in coastal edges) between consecutive harbors. 6x3 + 3x4 = 30 = coast length.
// This is the classic pattern: one side with two harbors (3 edges apart), the next with one in the middle.
const HARBOR_SPACING = [3, 4, 3, 3, 4, 3, 3, 4, 3];
const HARBOR_TYPES: HarborType[] = ["any", "any", "any", "any", "wood", "brick", "grain", "wool", "ore"];

/** Centers of the ring of ocean hexes framing the island (for drawing). */
export function oceanHexCenters(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const R = 3;
  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === R) out.push(axialToPixel(q, r));
    }
  }
  return out;
}

export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  harbors: Harbor[];
  desertHexId: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export function generateBoard(seed?: number, mode: BoardMode = "random"): Board {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  const beginner = mode === "beginner";
  const terrains = beginner ? BEGINNER_TERRAIN : shuffle(RESOURCE_BAG, rng);
  const numberLayout = beginner ? BEGINNER_NUMBERS : assignNumbers(terrains, rng);

  const hexes: Hex[] = [];
  const vertexMap = new Map<string, Vertex>();
  const edgeMap = new Map<string, Edge>();
  const edgeHexCount = new Map<string, number>();

  let desertHexId = 0;

  HEX_COORDS.forEach(([q, r], i) => {
    const [cx, cy] = axialToPixel(q, r);
    const terrain = terrains[i];
    const number = numberLayout[i];
    const vertexIds: number[] = [];
    // Compute 6 corners and dedupe
    for (let c = 0; c < 6; c++) {
      const [vx, vy] = corner(cx, cy, c);
      // Round to integers of 0.1px; String(-0) === "0", so float noise near 0 can no longer split one corner into two.
      const key = `${Math.round(vx * 10)}|${Math.round(vy * 10)}`;
      let v = vertexMap.get(key);
      if (!v) {
        v = { id: vertexMap.size, x: vx, y: vy, hexIds: [], adj: [] };
        vertexMap.set(key, v);
      }
      v.hexIds.push(i);
      vertexIds.push(v.id);
    }
    if (terrain === "desert") desertHexId = i;
    hexes.push({ id: i, q, r, terrain, number, cx, cy, vertexIds });
  });

  // Build edges from consecutive vertex pairs on each hex
  hexes.forEach((hex) => {
    for (let c = 0; c < 6; c++) {
      const v1 = hex.vertexIds[c];
      const v2 = hex.vertexIds[(c + 1) % 6];
      const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
      edgeHexCount.set(key, (edgeHexCount.get(key) ?? 0) + 1);
      if (!edgeMap.has(key)) {
        const a = [...vertexMap.values()].find((v) => v.id === v1)!;
        const b = [...vertexMap.values()].find((v) => v.id === v2)!;
        edgeMap.set(key, {
          id: edgeMap.size,
          vertexIds: [v1, v2],
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        });
        // record vertex adjacency
        if (!a.adj.includes(v2)) a.adj.push(v2);
        if (!b.adj.includes(v1)) b.adj.push(v1);
      }
    }
  });

  const vertices = [...vertexMap.values()].sort((a, b) => a.id - b.id);
  const edges = [...edgeMap.values()].sort((a, b) => a.id - b.id);


  // ---- Harbors: walk the 30 coastal edges in order around the island ----
  const apothem = (HEX_SIZE * Math.sqrt(3)) / 2;
  const coast = [...edgeMap.entries()]
    .filter(([key]) => edgeHexCount.get(key) === 1)
    .map(([, e]) => e)
    .sort((a, b) => {
      const ang = (e: Edge) => Math.atan2((e.y1 + e.y2) / 2, (e.x1 + e.x2) / 2);
      return ang(a) - ang(b);
    });
  const harborTypes = beginner ? BEGINNER_HARBORS : shuffle(HARBOR_TYPES, rng);
  const harbors: Harbor[] = [];
  let idx = beginner ? BEGINNER_HARBOR_START : Math.floor(rng() * 10); // rotate the pattern (it repeats every 10 edges)
  HARBOR_SPACING.forEach((gap, i) => {
    const e = coast[idx % coast.length];
    const mx = (e.x1 + e.x2) / 2;
    const my = (e.y1 + e.y2) / 2;
    let nx = -(e.y2 - e.y1);
    let ny = e.x2 - e.x1;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } // point away from the island center
    const len = Math.hypot(nx, ny) || 1;
    harbors.push({
      id: i,
      edgeId: e.id,
      vertexIds: [e.vertexIds[0], e.vertexIds[1]],
      type: harborTypes[i],
      x: mx + (nx / len) * apothem * 0.95,
      y: my + (ny / len) * apothem * 0.95,
    });
    idx += gap;
  });

  // Compute viewport
  const allX = vertices.flatMap((v) => [v.x]);
  const allY = vertices.flatMap((v) => [v.y]);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);
  const pad = HEX_SIZE * 1.2;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;
  const offsetX = -minX + pad;
  const offsetY = -minY + pad;

  return { hexes, vertices, edges, harbors, desertHexId, width, height, offsetX, offsetY };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexCornersPath(cx: number, cy: number, size: number = HEX_SIZE): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((-90 + 60 * i) * Math.PI) / 180;
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return "M" + pts.join(" L") + " Z";
}
