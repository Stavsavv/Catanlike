import type { GameState, Resource } from "./types";

/** Number of ways (out of 36) to roll each total with two dice. A 7 produces nothing, so it is absent. */
export const ROLL_WAYS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};

export interface Income {
  /** Ways out of 36 that a roll gives this player the resource (cities count double). */
  pips: number;
  /** Ways that would have paid out but are blocked because the robber sits on that hex. */
  blocked: number;
}

/** What a player can expect to collect per roll, for each resource. */
export function incomeFor(state: GameState, playerId: string): Record<Resource, Income> {
  const out: Record<Resource, Income> = {
    wood: { pips: 0, blocked: 0 },
    brick: { pips: 0, blocked: 0 },
    grain: { pips: 0, blocked: 0 },
    wool: { pips: 0, blocked: 0 },
    ore: { pips: 0, blocked: 0 },
  };
  state.vertices.forEach((v) => {
    if (v.building?.playerId !== playerId) return;
    const mult = v.building.kind === "city" ? 2 : 1;
    v.hexIds.forEach((hid) => {
      const h = state.hexes[hid];
      if (h.terrain === "desert" || !h.number) return;
      const ways = (ROLL_WAYS[h.number] ?? 0) * mult;
      const res = h.terrain as Resource;
      if (h.id === state.robberHexId) out[res].blocked += ways;
      else out[res].pips += ways;
    });
  });
  return out;
}
