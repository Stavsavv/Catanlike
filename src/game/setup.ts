import type { GameState, Player, BoardMode } from "./types";
import { createInitialState, createPlayer, PLAYER_COLORS } from "./state";

export interface NewGameConfig {
  /** One name per human player (1 to 4); two or more humans means pass-and-play on one screen. */
  humans: string[];
  aiCount: number;
  board?: BoardMode;
}

export function buildInitial(cfg: NewGameConfig): { state: GameState; humanId: string } {
  const aiNames = ["Aldric", "Brunhild", "Caelan", "Dagrun"];
  const used = new Set<string>();
  const unique = (wanted: string) => {
    // Log lines color names, so every name must be different.
    let name = wanted.trim() || "Player";
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${wanted.trim() || "Player"} ${n++}`;
    used.add(name.toLowerCase());
    return name;
  };
  const humanNames = (cfg.humans.length ? cfg.humans : ["You"]).slice(0, 4);
  const players: Player[] = humanNames.map((n, i) =>
    createPlayer(i === 0 ? "you" : `human-${i + 1}`, unique(n || (i === 0 ? "You" : `Player ${i + 1}`)), PLAYER_COLORS[i], false),
  );
  for (let i = 0; i < cfg.aiCount && players.length < 4; i++) {
    players.push(createPlayer(`ai-${i}`, unique(aiNames[i]), PLAYER_COLORS[players.length], true));
  }
  return { state: createInitialState(players, cfg.board ?? "beginner"), humanId: "you" };
}

