import type { GameState, Player } from "./types";
import { computeVP } from "./state";
import { ROLL_WAYS } from "./income";

export interface VPPart {
  key: "settlements" | "cities" | "trail" | "host" | "seals";
  label: string;
  count: number; // how many (for Longest Trail / Largest Host: 1 if held)
  vp: number;
}

/** Where a player's victory points come from. The parts always add up to computeVP. */
export function vpBreakdown(state: GameState, playerId: string): VPPart[] {
  const p = state.players.find((x) => x.id === playerId)!;
  let settlements = 0;
  let cities = 0;
  state.vertices.forEach((v) => {
    if (v.building?.playerId !== playerId) return;
    if (v.building.kind === "city") cities++;
    else settlements++;
  });
  const trail = state.longestRoad.playerId === playerId ? 1 : 0;
  const host = state.largestArmy.playerId === playerId ? 1 : 0;
  return [
    { key: "settlements", label: "Settlements", count: settlements, vp: settlements },
    { key: "cities", label: "Cities", count: cities, vp: cities * 2 },
    { key: "trail", label: "Longest Trail", count: trail, vp: trail * 2 },
    { key: "host", label: "Largest Host", count: host, vp: host * 2 },
    { key: "seals", label: "Royal Seals", count: p.hiddenVP, vp: p.hiddenVP },
  ];
}

/** Final standings: the winner first, then by VP (everyone's hidden Royal Seals are revealed). */
export function rankPlayers(state: GameState): { player: Player; seat: number; vp: number }[] {
  return state.players
    .map((player, seat) => ({ player, seat, vp: computeVP(state, player.id) }))
    .sort((a, b) => {
      if (a.player.id === state.winnerId) return -1;
      if (b.player.id === state.winnerId) return 1;
      return b.vp - a.vp || a.seat - b.seat;
    });
}

/** One entry per dice total (2..12): how often it came up and how often it "should" have. */
export function rollHistogram(rolls: number[]): { total: number; count: number; expected: number }[] {
  const n = rolls.reduce((s, c) => s + c, 0);
  const out: { total: number; count: number; expected: number }[] = [];
  for (let total = 2; total <= 12; total++) {
    const ways = total === 7 ? 6 : ROLL_WAYS[total];
    out.push({ total, count: rolls[total] ?? 0, expected: (n * ways) / 36 });
  }
  return out;
}
