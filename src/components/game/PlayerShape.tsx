import { shapePath, shapeName } from "@/game/shapes";
import { useDisplay } from "./DisplaySettings";

/** A player's marker: their color in their own shape (a plain circle if shapes are switched off). */
export function PlayerShape({ index, color, size = 16, className }: { index: number; color: string; size?: number; className?: string }) {
  const { settings } = useDisplay();
  const i = settings.playerShapes ? index : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} role="img" aria-label={`${shapeName(i)} marker`}>
      <path d={shapePath(i, 8, 8, 5.5)} fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth={1.2} />
    </svg>
  );
}
