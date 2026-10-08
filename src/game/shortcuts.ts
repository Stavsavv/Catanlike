import type { GameState } from "./types";

export type ShortcutAction =
  | "roll" | "endTurn" | "toggleSettlement" | "toggleCity" | "toggleRoad" | "buyDev"
  | "bank" | "players" | "confirm" | "cancel";

/** Modes you can back out of without losing anything (nothing is spent until the move is finished). */
export const CANCELLABLE_MODES = ["placeSettlement", "placeCity", "placeRoad", "knightRobber", "freeRoad1", "freeRoad2"];

export interface ShortcutContext {
  key: string;                       // KeyboardEvent.key
  phase: GameState["phase"];
  isMyTurn: boolean;
  mode: string | null;               // what the player is currently doing on the board
  staging: boolean;                  // a spot is selected and waiting for Confirm
  canBuild: { settlement: boolean; city: boolean; road: boolean; dev: boolean };
  focusOnButton?: boolean;           // Enter on a focused button already clicks it
}

/** Which action (if any) a key press means right now. Pure, so it can be tested without a browser. */
export function shortcutAction(c: ShortcutContext): ShortcutAction | null {
  if (c.phase === "gameover") return null;
  const k = c.key.length === 1 ? c.key.toLowerCase() : c.key;

  if (k === "Escape") return c.staging || (c.mode !== null && CANCELLABLE_MODES.includes(c.mode)) ? "cancel" : null;
  if (k === "Enter") return c.staging && !c.focusOnButton ? "confirm" : null;

  if (!c.isMyTurn) return null;
  if (k === "r") return c.phase === "roll" ? "roll" : null;
  if (c.phase !== "main") return null;

  switch (k) {
    case "e": return c.mode === "freeRoad1" || c.mode === "freeRoad2" ? null : "endTurn";
    case "1": return c.canBuild.settlement ? "toggleSettlement" : null;
    case "2": return c.canBuild.city ? "toggleCity" : null;
    case "3": return c.canBuild.road ? "toggleRoad" : null;
    case "4": return c.canBuild.dev ? "buyDev" : null;
    case "b": return "bank";
    case "t": return "players";
    default: return null;
  }
}
