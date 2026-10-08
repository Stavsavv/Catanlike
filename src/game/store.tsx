import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GameState } from "./types";
import { currentPlayer } from "./state";
import { buildInitial, type NewGameConfig } from "./setup";
import { runAITurn, aiAutoDiscard } from "./ai";
import { applyAction, type Action, type ActionResult } from "./actions";
import { GameContext } from "./gameContext";

export type { NewGameConfig } from "./setup";
export { useGame } from "./gameContext";

/** A game played on this device: solo against AI, or several people passing the screen around. */
export function GameProvider({ children, config }: { children: ReactNode; config: NewGameConfig }) {
  const [seed, setSeed] = useState(0);
  const initial = useRef<{ state: GameState; humanId: string }>(buildInitial(config));
  const [state, setState] = useState<GameState>(initial.current.state);
  const [humanId, setHumanId] = useState<string>(initial.current.humanId);
  // The ref is the source of truth: every change starts from the latest state, so moves made back to back
  // (a person's click, then the AI's reply) can never be based on a stale copy.
  const stateRef = useRef(state);
  const humanRef = useRef(humanId);
  humanRef.current = humanId;

  const commit = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const apply = useCallback((mutator: (s: GameState) => void) => {
    const next = structuredClone(stateRef.current) as GameState;
    mutator(next);
    commit(next);
  }, [commit]);

  const act = useCallback(async (action: Action, as?: string): Promise<ActionResult> => {
    const next = structuredClone(stateRef.current) as GameState;
    const result = applyAction(next, as ?? humanRef.current, action);
    if (result.ok) commit(next);
    return result;
  }, [commit]);

  const restart = useCallback((cfg: NewGameConfig) => {
    const fresh = buildInitial(cfg);
    initial.current = fresh;
    stateRef.current = fresh.state;
    setState(fresh.state);
    setHumanId(fresh.humanId);
    setSeed((s) => s + 1);
  }, []);

  // AI driver — only one async loop at a time
  const aiBusy = useRef(false);
  useEffect(() => {
    const cur = currentPlayer(state);
    if (!cur.isAI) return;
    if (state.phase === "gameover") return;
    if (aiBusy.current) return;
    aiBusy.current = true;
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const proxyState = new Proxy({} as GameState, {
      get(_t, prop) { return (stateRef.current as any)[prop]; },
    });
    (async () => {
      try {
        await runAITurn(proxyState, apply, delay);
      } catch (e) {
        console.error("AI error", e);
      } finally {
        aiBusy.current = false;
      }
    })();
  }, [state.currentPlayerIdx, state.phase, seed, apply, state]);

  // Auto-discard AI players when 7 is rolled (regardless of current player)
  useEffect(() => {
    if (state.phase !== "discard") return;
    const aiNeedsDiscard = state.players.find((p) => p.isAI && state.pendingDiscards.includes(p.id));
    if (!aiNeedsDiscard) return;
    const t = setTimeout(() => apply((s) => aiAutoDiscard(s, aiNeedsDiscard.id)), 350);
    return () => clearTimeout(t);
  }, [state.phase, state.pendingDiscards, state.players, apply]);

  return (
    <GameContext.Provider value={{ state, act, restart, humanId, online: null }}>
      {children}
    </GameContext.Provider>
  );
}
