export type Resource = "wood" | "brick" | "grain" | "wool" | "ore";
export const RESOURCES: Resource[] = ["wood", "brick", "grain", "wool", "ore"];
export type Terrain = Resource | "desert";

export type DevCardKind = "knight" | "roadBuilding" | "monopoly" | "yearOfPlenty" | "victoryPoint";

export interface Hex {
  id: number;
  q: number;
  r: number;
  terrain: Terrain;
  number?: number; // 2-12, no 7
  cx: number; // pixel center
  cy: number;
  vertexIds: number[]; // 6 corners (in order)
}

export interface Vertex {
  id: number;
  x: number;
  y: number;
  hexIds: number[]; // 1-3 adjacent hexes
  adj: number[]; // adjacent vertex ids
  building?: { playerId: string; kind: "settlement" | "city" };
}

export interface Edge {
  id: number;
  vertexIds: [number, number];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  road?: { playerId: string };
}

export type HarborType = Resource | "any";
export type BoardMode = "beginner" | "random";

/** A coastal harbor: touches two coastal vertices, gives 3:1 ("any") or 2:1 (specific resource). */
export interface Harbor {
  id: number;
  edgeId: number;
  vertexIds: [number, number];
  type: HarborType;
  x: number; // badge position (in the ocean, outside the coast edge)
  y: number;
}

/** Numbers collected during the game for the end-of-game summary. */
export interface GameStats {
  rolls: number[];                                   // how often each dice total came up (index = total, 2..12)
  produced: Record<string, ResourceCounts>;          // cards each player collected from dice rolls
  discarded: Record<string, number>;                 // cards each player lost to a 7
  stolenFrom: Record<string, number>;                // cards taken from each player by the robber
  stolenBy: Record<string, number>;                  // cards each player stole
  playerTrades: Record<string, number>;              // trades with other players
  bankTrades: Record<string, number>;                // trades with the bank
  vpTimeline: { turn: number; vp: number[] }[];      // everyone's VP (in seat order) at the end of each turn
  leader: string | null;                             // current sole VP leader, for spotting lead changes
  turningPoints: { turn: number; playerId?: string; text: string }[];
}

export interface DevCard {
  id: number;
  kind: DevCardKind;
  purchasedTurn: number; // turn it was bought; can't play same turn (except VP)
  played?: boolean;
}

export type ResourceCounts = Record<Resource, number>;

export interface Player {
  id: string;
  name: string;
  color: string; // css var name
  isAI: boolean;
  resources: ResourceCounts;
  devCards: DevCard[];
  playedKnights: number;
  victoryPoints: number; // public VP (settlements, cities, longest road, largest army)
  hiddenVP: number; // from VP dev cards
  settlementsLeft: number; // 5
  citiesLeft: number; // 4
  roadsLeft: number; // 15
}

export type Phase =
  | "setup1"
  | "setup2"
  | "roll"
  | "main"
  | "discard"
  | "moveRobber"
  | "stealing"
  | "gameover";

/** A trade an AI has proposed to the human: `fromPlayerId` gives `offer` and wants `request`. */
export interface PendingTrade {
  fromPlayerId: string;
  toPlayerId: string;
  offer: ResourceCounts;
  request: ResourceCounts;
}

export interface GameState {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  harbors: Harbor[];
  bank: ResourceCounts; // limited supply: 19 of each resource
  stats: GameStats;
  boardMode: BoardMode;
  players: Player[];
  currentPlayerIdx: number;
  phase: Phase;
  dice: [number, number] | null;
  /** The most recent roll; unlike `dice` it survives end of turn so players can always see it. */
  lastRoll?: { values: [number, number]; playerId: string } | null;
  robberHexId: number;
  devDeck: DevCardKind[];
  longestRoad: { playerId: string | null; length: number };
  largestArmy: { playerId: string | null; size: number };
  log: LogEntry[];
  turn: number;
  hasRolled: boolean;
  hasPlayedDevCard: boolean;
  setupPlacements: Record<string, { settlement?: number; road?: number }>; // for setup phase tracking
  pendingDiscards: string[]; // player ids who must discard
  stealCandidates: string[]; // player ids player can steal from
  pendingTrade?: PendingTrade | null;
  winnerId?: string;
}

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  playerId?: string;
  kind?: "roll" | "build" | "trade" | "dev" | "robber" | "achievement" | "info";
}

export const RESOURCE_LABEL: Record<Resource, string> = {
  wood: "Lumber",
  brick: "Clay",
  grain: "Grain",
  wool: "Wool",
  ore: "Ore",
};

export const TERRAIN_OF_RESOURCE: Record<Resource, Terrain> = {
  wood: "wood",
  brick: "brick",
  grain: "grain",
  wool: "wool",
  ore: "ore",
};
