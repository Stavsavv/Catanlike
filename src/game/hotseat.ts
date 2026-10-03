import type { GameState } from "./types";
import { currentPlayer } from "./state";

export type HandoffReason = "turn" | "discard" | "trade";

/**
 * Pass-and-play: which human has to be looking at the screen right now, if any?
 * - someone has a trade offer to answer,
 * - or someone has to discard after a 7,
 * - or it is a human's turn.
 * While an AI is acting and nobody is waiting on an answer, nobody is needed (and hands stay covered).
 */
export function neededHuman(state: GameState): { id: string; reason: HandoffReason } | null {
  if (state.phase === "gameover") return null;
  const isHuman = (id: string) => state.players.some((p) => p.id === id && !p.isAI);

  const t = state.pendingTrade;
  if (t && isHuman(t.toPlayerId)) return { id: t.toPlayerId, reason: "trade" };

  if (state.phase === "discard") {
    const p = state.players.find((pl) => !pl.isAI && state.pendingDiscards.includes(pl.id));
    if (p) return { id: p.id, reason: "discard" };
  }

  const cur = currentPlayer(state);
  return cur.isAI ? null : { id: cur.id, reason: "turn" };
}
