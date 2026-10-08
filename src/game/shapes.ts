/** Shapes that tell players apart without relying on color: circle, square, triangle, diamond (by seat). */
export const SHAPE_NAMES = ["circle", "square", "triangle", "diamond"] as const;

export function shapeName(index: number): string {
  return SHAPE_NAMES[((index % 4) + 4) % 4];
}

/** SVG path of a shape centered on (cx, cy) with "radius" r. */
export function shapePath(index: number, cx: number, cy: number, r: number): string {
  switch (((index % 4) + 4) % 4) {
    case 0:
      return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;
    case 1:
      return `M${cx - r},${cy - r} H${cx + r} V${cy + r} H${cx - r} Z`;
    case 2:
      return `M${cx},${cy - r * 1.15} L${cx + r * 1.1},${cy + r * 0.85} L${cx - r * 1.1},${cy + r * 0.85} Z`;
    default:
      return `M${cx},${cy - r * 1.25} L${cx + r * 1.25},${cy} L${cx},${cy + r * 1.25} L${cx - r * 1.25},${cy} Z`;
  }
}
