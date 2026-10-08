import type { GameState } from "./types";
import { totalResources } from "./state";

/**
 * What one player is allowed to see. Other players' hands become a card count (kept in the first slot so
 * "how many cards" still works), their unplayed development cards lose their identity, hidden points and the
 * contents of the deck are hidden. After the game everything is revealed.
 */
export function viewFor(state: GameState, viewerId: string): GameState {
  const copy = structuredClone(state);
  if (copy.phase === "gameover") return copy;
  for (const p of copy.players) {
    if (p.id === viewerId) continue;
    const total = totalResources(p);
    p.resources = { wood: total, brick: 0, grain: 0, wool: 0, ore: 0 };
    p.hiddenVP = 0;
    p.devCards = p.devCards.map((c) => (c.played ? c : { ...c, kind: "knight" as const }));
  }
  copy.devDeck = copy.devDeck.map(() => "knight" as const);
  // Fog: while the first settlements are placed the island is hidden, so the terrain, the numbers and the
  // robber's start are not sent at all (a browser could otherwise read them).
  if (copy.boardMode === "fog" && (copy.phase === "setup1" || copy.phase === "setup2")) {
    copy.hexes = copy.hexes.map((h) => ({ ...h, terrain: "desert" as const, number: undefined }));
    copy.robberHexId = -1;
  }
  return copy;
}
