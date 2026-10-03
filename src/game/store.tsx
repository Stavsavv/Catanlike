import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { GameState } from "./types";
import { currentPlayer } from "./state";
import { buildInitial, type NewGameConfig } from "./setup";
import { runAITurn } from "./ai";
import { discardResources } from "./rules";


interface GameCtx {
  state: GameState;
  apply: (mutator: (s: GameState) => void) => void;
  restart: (config: NewGameConfig) => void;
  humanId: string;
}

const Ctx = createContext<GameCtx | null>(null);

export type { NewGameConfig } from "./setup";

export function GameProvider({ children, config }: { children: ReactNode; config: NewGameConfig }) {
  const [seed, setSeed] = useState(0);
  const initial = useRef<{ state: GameState; humanId: string }>(buildInitial(config));
  const [state, setState] = useState<GameState>(initial.current.state);
  const [humanId, setHumanId] = useState<string>(initial.current.humanId);
  const stateRef = useRef(state);
  stateRef.current = state;

  const apply = useCallback((mutator: (s: GameState) => void) => {
    setState((prev) => {
      const next = structuredClone(prev) as GameState;
      mutator(next);
      stateRef.current = next;
      return next;
    });
  }, []);

  const restart = useCallback((cfg: NewGameConfig) => {
    const fresh = buildInitial(cfg);
    initial.current = fresh;
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
    const aiNeedsDiscard = state.players.find(
      (p) => p.isAI && state.pendingDiscards.includes(p.id),
    );
    if (!aiNeedsDiscard) return;
    const t = setTimeout(() => {
      apply((s) => {
        const p = s.players.find((x) => x.id === aiNeedsDiscard.id);
        if (!p) return;
        let total = 0;
        (["wood", "brick", "grain", "wool", "ore"] as const).forEach((r) => (total += p.resources[r]));
        const need = Math.floor(total / 2);
        const order = ["wool", "wood", "brick", "grain", "ore"] as const;
        const picks: Partial<Record<typeof order[number], number>> = {};
        let remaining = need;
        for (const r of order) {
          const take = Math.min(p.resources[r], remaining);
          if (take > 0) { picks[r] = take; remaining -= take; }
          if (!remaining) break;
        }
        const sum = order.reduce((acc, r) => acc + (picks[r] ?? 0), 0);
        if (sum === need) discardResources(s, p.id, picks); // the real rule: stats, log and the next phase stay right
      });
    }, 350);
    return () => clearTimeout(t);
  }, [state.phase, state.pendingDiscards, state.players, apply]);



  return <Ctx.Provider value={{ state, apply, restart, humanId }}>{children}</Ctx.Provider>;
}

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGame outside provider");
  return v;
}
