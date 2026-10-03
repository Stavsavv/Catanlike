import type {
  GameState, Player, Resource, DevCardKind, LogEntry, Hex, Vertex, Edge, ResourceCounts, BoardMode, GameStats,
} from "./types";
import { RESOURCES } from "./types";
import { generateBoard } from "./board";

let nextLogId = 1;
let nextDevCardId = 1;

/** Unique, collision-free id for a development card (Date.now()+random can collide within one millisecond). */
export function newDevCardId(): number {
  return nextDevCardId++;
}

export function emptyResources(): Record<Resource, number> {
  return { wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 };
}

export const BANK_SIZE = 19;

export function fullBank(): ResourceCounts {
  return { wood: BANK_SIZE, brick: BANK_SIZE, grain: BANK_SIZE, wool: BANK_SIZE, ore: BANK_SIZE };
}

export const PLAYER_COLORS = ["p1", "p2", "p3", "p4"];

export const COSTS = {
  road: { wood: 1, brick: 1 } as Partial<Record<Resource, number>>,
  settlement: { wood: 1, brick: 1, grain: 1, wool: 1 } as Partial<Record<Resource, number>>,
  city: { ore: 3, grain: 2 } as Partial<Record<Resource, number>>,
  devCard: { ore: 1, grain: 1, wool: 1 } as Partial<Record<Resource, number>>,
};

export function createPlayer(id: string, name: string, color: string, isAI: boolean): Player {
  return {
    id, name, color, isAI,
    resources: emptyResources(),
    devCards: [],
    playedKnights: 0,
    victoryPoints: 0,
    hiddenVP: 0,
    settlementsLeft: 5,
    citiesLeft: 4,
    roadsLeft: 15,
  };
}

function buildDevDeck(): DevCardKind[] {
  const deck: DevCardKind[] = [];
  for (let i = 0; i < 14; i++) deck.push("knight");
  for (let i = 0; i < 5; i++) deck.push("victoryPoint");
  for (let i = 0; i < 2; i++) deck.push("roadBuilding");
  for (let i = 0; i < 2; i++) deck.push("monopoly");
  for (let i = 0; i < 2; i++) deck.push("yearOfPlenty");
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function createInitialState(players: Player[], boardMode: BoardMode = "random"): GameState {
  const board = generateBoard(undefined, boardMode);
  const placements: Record<string, { settlement?: number; road?: number }> = {};
  players.forEach((p) => (placements[p.id] = {}));
  return {
    hexes: board.hexes,
    vertices: board.vertices,
    edges: board.edges,
    harbors: board.harbors,
    bank: fullBank(),
    stats: emptyStats(players),
    boardMode,
    players,
    currentPlayerIdx: 0,
    phase: "setup1",
    dice: null,
    robberHexId: board.desertHexId,
    devDeck: buildDevDeck(),
    longestRoad: { playerId: null, length: 0 },
    largestArmy: { playerId: null, size: 0 },
    log: [],
    turn: 1,
    hasRolled: false,
    hasPlayedDevCard: false,
    setupPlacements: placements,
    pendingDiscards: [],
    stealCandidates: [],
  };
}

export function emptyStats(players: Player[]): GameStats {
  const per = <T>(make: () => T) => Object.fromEntries(players.map((p) => [p.id, make()])) as Record<string, T>;
  return {
    rolls: new Array(13).fill(0),
    produced: per(() => ({ wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 })),
    discarded: per(() => 0),
    stolenFrom: per(() => 0),
    stolenBy: per(() => 0),
    playerTrades: per(() => 0),
    bankTrades: per(() => 0),
    vpTimeline: [],
    leader: null,
    turningPoints: [],
  };
}

/** Snapshot everyone's VP at the end of a turn and note when somebody takes the lead. */
export function recordTurnEnd(state: GameState) {
  const vp = state.players.map((p) => computeVP(state, p.id));
  state.stats.vpTimeline.push({ turn: state.turn, vp });
  const top = Math.max(...vp);
  const leaders = state.players.filter((_, i) => vp[i] === top);
  if (top >= 3 && leaders.length === 1 && leaders[0].id !== state.stats.leader) {
    state.stats.leader = leaders[0].id;
    state.stats.turningPoints.push({ turn: state.turn, playerId: leaders[0].id, text: `${leaders[0].name} takes the lead with ${top} VP` });
  }
}

export function log(state: GameState, entry: Omit<LogEntry, "id" | "turn">) {
  // Awards changing hands are turning points worth remembering for the summary.
  if (state.stats && (entry.kind === "achievement" && !entry.text.includes("won the realm"))) {
    state.stats.turningPoints.push({ turn: state.turn, playerId: entry.playerId, text: entry.text });
  } else if (state.stats && entry.kind === "info" && entry.text.includes("lost the Longest Trail")) {
    state.stats.turningPoints.push({ turn: state.turn, playerId: entry.playerId, text: entry.text });
  }
  state.log.unshift({ id: nextLogId++, turn: state.turn, ...entry });
  if (state.log.length > 300) state.log.pop(); // long enough for the log filters to be useful
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIdx];
}

export function totalResources(p: Player): number {
  return RESOURCES.reduce((s, r) => s + p.resources[r], 0);
}

export function canAfford(p: Player, cost: Partial<Record<Resource, number>>): boolean {
  return RESOURCES.every((r) => (p.resources[r] ?? 0) >= (cost[r] ?? 0));
}

export function payCost(p: Player, cost: Partial<Record<Resource, number>>) {
  RESOURCES.forEach((r) => { p.resources[r] -= cost[r] ?? 0; });
}

/** Pay a cost to the bank (cards go back into the limited supply). */
export function payToBank(state: GameState, p: Player, cost: Partial<Record<Resource, number>>) {
  RESOURCES.forEach((r) => {
    p.resources[r] -= cost[r] ?? 0;
    state.bank[r] += cost[r] ?? 0;
  });
}

export function gainCost(p: Player, gain: Partial<Record<Resource, number>>) {
  RESOURCES.forEach((r) => { p.resources[r] += gain[r] ?? 0; });
}

export function computeVP(state: GameState, playerId: string): number {
  const p = state.players.find((x) => x.id === playerId)!;
  let vp = p.hiddenVP;
  state.vertices.forEach((v) => {
    if (v.building?.playerId === playerId) {
      vp += v.building.kind === "city" ? 2 : 1;
    }
  });
  if (state.longestRoad.playerId === playerId) vp += 2;
  if (state.largestArmy.playerId === playerId) vp += 2;
  return vp;
}

export function refreshVP(state: GameState) {
  state.players.forEach((p) => {
    // public VP only here
    let vp = 0;
    state.vertices.forEach((v) => {
      if (v.building?.playerId === p.id) vp += v.building.kind === "city" ? 2 : 1;
    });
    if (state.longestRoad.playerId === p.id) vp += 2;
    if (state.largestArmy.playerId === p.id) vp += 2;
    p.victoryPoints = vp;
  });
}

export function checkWinner(state: GameState): string | null {
  for (const p of state.players) {
    if (computeVP(state, p.id) >= 10) return p.id;
  }
  return null;
}

export type { Hex, Vertex, Edge };
