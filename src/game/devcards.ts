import type { DevCardKind, GameState, Player } from "./types";

/** Display order for the tray. */
export const DEV_ORDER: DevCardKind[] = ["knight", "roadBuilding", "yearOfPlenty", "monopoly", "victoryPoint"];

export interface DevGroup {
  kind: DevCardKind;
  total: number;      // unplayed cards of this kind
  ready: number;      // bought on an earlier turn, so they could be played
  fresh: number;      // bought this turn, playable from next turn
  blocker: string | null; // why none can be played right now (null = playable)
}

/** Group a player's unplayed development cards and work out what stops each group from being played. */
export function devCardGroups(player: Player, state: GameState, isMyTurn: boolean): DevGroup[] {
  const phaseOk = state.phase === "main" || state.phase === "roll";
  return DEV_ORDER.flatMap((kind) => {
    const cards = player.devCards.filter((c) => c.kind === kind && !c.played);
    if (cards.length === 0) return [];
    const ready = kind === "victoryPoint" ? 0 : cards.filter((c) => c.purchasedTurn < state.turn).length;
    const fresh = kind === "victoryPoint" ? 0 : cards.length - ready;
    let blocker: string | null = null;
    if (kind !== "victoryPoint") {
      if (!isMyTurn) blocker = "Wait for your turn";
      else if (!phaseOk) blocker = "Not right now";
      else if (state.hasPlayedDevCard) blocker = "One card per turn";
      else if (ready === 0) blocker = "Playable next turn";
    }
    return [{ kind, total: cards.length, ready, fresh, blocker }];
  });
}
