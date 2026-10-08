import { RESOURCES, type GameState } from "./types";
import { currentPlayer } from "./state";
import { setupStep } from "./actions";

export interface TutorialHint {
  id: string;
  title: string;
  text: string;
}

/** The order the tips are offered in. Each one appears once, the first time it applies. */
export const TUTORIAL_ORDER = [
  "setup-settlement", "setup-road", "setup-bonus", "roll", "hand", "build", "trade", "end-turn", "seven", "win",
] as const;

const TEXT: Record<string, { title: string; text: string }> = {
  "setup-settlement": {
    title: "Place your first settlement",
    text: "Click a glowing corner. Corners that touch several different resources and numbers with many dots (6 and 8 have the most) earn the most. You can't build next to another settlement.",
  },
  "setup-road": {
    title: "Now a road",
    text: "Place a road that touches the settlement you just built. Roads grow your territory and open new spots for settlements.",
  },
  "setup-bonus": {
    title: "Your second settlement pays at once",
    text: "It gives you one card from every hex it touches, right away. Try to pick a spot that brings the resources your first one lacks.",
  },
  roll: {
    title: "Roll the dice",
    text: "Press Roll Dice (or the R key). Every settlement next to a hex with the number rolled collects a card, and a city collects two.",
  },
  hand: {
    title: "Your hand",
    text: "Your cards are at the bottom left. The dots under each resource show how often your buildings collect it, and green or red numbers flash when your hand changes.",
  },
  build: {
    title: "Spend your cards",
    text: "Use the Build buttons on the left (keys 1 to 4). A red number on a button is a card you are still missing. Settlements and cities give points; roads reach new spots.",
  },
  trade: {
    title: "Spare cards? Trade",
    text: "With four or more of one resource you can trade with the bank (B) four for one. A settlement on a harbor makes the rate 3:1 or 2:1. You can also offer trades to other players.",
  },
  "end-turn": {
    title: "Finish your turn",
    text: "When there is nothing more to do, press End Turn (or E). The others play, and you will be called when it is your turn again.",
  },
  seven: {
    title: "A 7 was rolled",
    text: "Nobody collects cards. Anyone holding more than 7 cards discards half, then the player who rolled moves the robber onto a hex (blocking it) and steals a card.",
  },
  win: {
    title: "Race to 10 points",
    text: "Settlements are worth 1, cities 2, Longest Trail 2, Largest Host 2 and Royal Seals 1 each. Watch the bars at the top to see who is close.",
  },
};

/**
 * The tip to show right now, or null. `done` holds the tips already dismissed.
 * Pure: it only looks at the game, so it can be tested without a screen.
 */
export function tutorialHint(state: GameState, myId: string, done: ReadonlySet<string>): TutorialHint | null {
  if (state.phase === "gameover") return null;
  const me = state.players.find((p) => p.id === myId);
  if (!me) return null;

  const mine = currentPlayer(state).id === myId;
  const step = mine ? setupStep(state, myId) : null;
  const mainTurn = mine && state.phase === "main" && state.hasRolled;
  const lastSum = state.lastRoll ? state.lastRoll.values[0] + state.lastRoll.values[1] : 0;

  const applies: Record<string, boolean> = {
    "setup-settlement": step?.step === "settlement" && state.phase === "setup1",
    "setup-road": step?.step === "road",
    "setup-bonus": state.phase === "setup2" && step?.step === "settlement",
    roll: mine && state.phase === "roll",
    hand: mainTurn,
    build: mainTurn,
    trade: mainTurn && RESOURCES.some((r) => me.resources[r] >= 4),
    "end-turn": mainTurn && done.has("build"),
    seven: lastSum === 7 && (state.phase === "discard" || state.phase === "moveRobber" || state.phase === "stealing"),
    win: mainTurn && state.turn >= 3 && done.has("end-turn"),
  };

  for (const id of TUTORIAL_ORDER) {
    if (done.has(id) || !applies[id]) continue;
    const t = TEXT[id];
    const fog = id === "setup-settlement" && state.boardMode === "fog";
    return { id, title: t.title, text: fog ? `The island is hidden while everyone places their first settlements, so you are choosing blind. ${t.text}` : t.text };
  }
  return null;
}
