import type { GameState, Player, BoardMode } from "./types";
import { createInitialState, createPlayer, PLAYER_COLORS } from "./state";

export interface NewGameConfig {
  /** One name per human player (1 to 4); two or more humans means pass-and-play on one screen. */
  humans: string[];
  aiCount: number;
  board?: BoardMode;
  /** Shuffle who plays first (otherwise people go first, in the order given, then the AI players). */
  randomSeats?: boolean;
}

/** A shuffled copy (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Log lines color names, so every name at the table must be different. */
export function uniqueNamer() {
  const used = new Set<string>();
  return (wanted: string) => {
    const base = wanted.trim() || "Player";
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${base} ${n++}`;
    used.add(name.toLowerCase());
    return name;
  };
}

export function buildInitial(cfg: NewGameConfig): { state: GameState; humanId: string } {
  const aiNames = ["Aldric", "Brunhild", "Caelan", "Dagrun"];
  const unique = uniqueNamer();
  const humanNames = (cfg.humans.length ? cfg.humans : ["You"]).slice(0, 4);
  const specs: { id: string; name: string; isAI: boolean }[] = humanNames.map((n, i) => ({
    id: i === 0 ? "you" : `human-${i + 1}`,
    name: unique(n || (i === 0 ? "You" : `Player ${i + 1}`)),
    isAI: false,
  }));
  for (let i = 0; i < cfg.aiCount && specs.length < 4; i++) specs.push({ id: `ai-${i}`, name: unique(aiNames[i]), isAI: true });
  // Colors follow the final turn order, so shuffling the seats keeps every color different.
  const order = cfg.randomSeats ? shuffled(specs) : specs;
  const players: Player[] = order.map((p, i) => createPlayer(p.id, p.name, PLAYER_COLORS[i], p.isAI));
  return { state: createInitialState(players, cfg.board ?? "beginner", !!cfg.randomSeats), humanId: "you" };
}

