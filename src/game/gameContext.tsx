import { createContext, useContext } from "react";
import type { GameState } from "./types";
import type { Action, ActionResult } from "./actions";
import type { NewGameConfig } from "./setup";

/** Extra things the screen needs to know when the game is played online. */
export interface OnlineInfo {
  roomCode: string;
  isHost: boolean;
  connection: "connected" | "reconnecting";
  /** Who is at the table and whether they are still connected. */
  seats: { seat: number; playerId: string | null; name: string; kind: "human" | "ai"; connected: boolean }[];
  leave: () => void;
  rematch: () => void;
  /** Host only: let the AI play for someone who has left. */
  takeover: (seat: number) => void;
}

export interface GameCtx {
  state: GameState;
  /**
   * Ask for a move. On one screen `as` says which person is playing (the device is shared);
   * online the server already knows who you are and ignores it.
   */
  act: (action: Action, as?: string) => Promise<ActionResult>;
  restart: (config: NewGameConfig) => void;
  humanId: string;
  online: OnlineInfo | null;
}

export const GameContext = createContext<GameCtx | null>(null);

export function useGame(): GameCtx {
  const v = useContext(GameContext);
  if (!v) throw new Error("useGame outside provider");
  return v;
}
