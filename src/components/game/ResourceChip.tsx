import { type Resource } from "@/game/types";
import { TreePine, Mountain, Wheat, Cloud, Square } from "lucide-react";

export const RESOURCE_COLOR: Record<Resource, string> = {
  wood: "oklch(0.45 0.12 145)",
  brick: "oklch(0.55 0.18 35)",
  grain: "oklch(0.78 0.15 85)",
  wool: "oklch(0.85 0.06 130)",
  ore: "oklch(0.55 0.03 240)",
};

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: "Lumber",
  brick: "Clay",
  grain: "Grain",
  wool: "Wool",
  ore: "Ore",
};

export function ResourceChip({ kind, count, size = 32 }: { kind: Resource; count?: number; size?: number }) {
  const Icon = { wood: TreePine, brick: Square, grain: Wheat, wool: Cloud, ore: Mountain }[kind];
  const iconSize = Math.max(18, Math.round(size * 0.55));
  return (
    <div
      className="inline-flex items-center justify-center rounded-md gap-1 px-1.5"
      style={{
        background: `linear-gradient(180deg, ${RESOURCE_COLOR[kind]}, color-mix(in oklab, ${RESOURCE_COLOR[kind]} 70%, black))`,
        color: "oklch(0.98 0.01 80)",
        minWidth: size,
        height: size,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.3)",
      }}
      title={RESOURCE_LABEL[kind]}
    >
      <Icon size={iconSize} strokeWidth={2.5} />
      {count !== undefined && <span className="font-bold text-sm tabular-nums">{count}</span>}
    </div>
  );
}
