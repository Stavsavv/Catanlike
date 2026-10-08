import type { GameState } from "./types";
import { currentPlayer } from "./state";

/**
 * Is the game waiting for this player to do something? It is their turn, they owe a discard after a 7,
 * or someone has made them a trade offer. Used to get their attention when they are in another tab.
 */
export function needsMyAction(state: GameState, myId: string): boolean {
  if (state.phase === "gameover") return false;
  if (state.pendingTrade?.toPlayerId === myId) return true;
  if (state.phase === "discard") return state.pendingDiscards.includes(myId);
  return currentPlayer(state).id === myId;
}
