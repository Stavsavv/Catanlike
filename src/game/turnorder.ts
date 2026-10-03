import type { GameState } from "./types";

/**
 * Index of the player who takes the next turn, mirroring endTurn in rules.ts:
 * setup goes forward then backward (the last player places twice in a row),
 * and the first player rolls first once setup ends.
 */
export function nextPlayerIndex(state: GameState): number {
  const n = state.players.length;
  const i = state.currentPlayerIdx;
  if (state.phase === "setup1") return i === n - 1 ? i : i + 1;
  if (state.phase === "setup2") return i === 0 ? 0 : i - 1;
  return (i + 1) % n;
}
