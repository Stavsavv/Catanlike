import type { GameState } from "./types";

/** Canonical player color palette. Keys match Player.color tokens. */
export const PLAYER_COLOR_HEX: Record<string, string> = {
  p1: "#E53935", // red
  p2: "#1E88E5", // blue
  p3: "#43A047", // green
  p4: "#00ACC1", // cyan
};

export const PLAYER_COLOR_LABEL: Record<string, string> = {
  p1: "Red",
  p2: "Blue",
  p3: "Green",
  p4: "Cyan",
};

/** Resolve a player's display color by player id. Falls back to a neutral gold. */
export function getPlayerColor(state: GameState, playerId: string | null | undefined): string {
  if (!playerId) return "#D4AF37";
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return "#D4AF37";
  return PLAYER_COLOR_HEX[p.color] ?? p.color ?? "#D4AF37";
}

/** Resolve a color directly from a color token (e.g. "p1"). */
export function colorFromToken(token: string): string {
  return PLAYER_COLOR_HEX[token] ?? token;
}
