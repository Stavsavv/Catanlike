import { Crown } from "lucide-react";
import type { GameState } from "@/game/types";
import { computeVP, currentPlayer } from "@/game/state";
import { nextPlayerIndex } from "@/game/turnorder";
import { colorFromToken } from "@/game/colors";
import { PlayerShape } from "./PlayerShape";

/** Seating order with whose turn it is, who is next, and a race bar toward 10 VP for every player. */
export function TurnStrip({ state, humanId }: { state: GameState; humanId: string }) {
  const over = state.phase === "gameover";
  const cur = currentPlayer(state);
  const nextId = over ? null : state.players[nextPlayerIndex(state)].id;
  // You see your own hidden Royal Seals; rivals show only their public points.
  const scores = state.players.map((p) => ({ p, vp: p.id === humanId ? computeVP(state, p.id) : p.victoryPoints }));
  const top = Math.max(...scores.map((s) => s.vp));

  return (
    <div
      className="flex items-stretch gap-2 overflow-x-auto border-b border-[oklch(1_0_0_/_0.1)] bg-black/15 px-3 py-1.5"
      aria-label="Turn order and victory points"
    >
      <div className="hidden shrink-0 flex-col justify-center pr-2 text-[10px] font-bold uppercase leading-tight tracking-widest opacity-70 lg:flex">
        First to<br />10 VP wins
      </div>
      {scores.map(({ p, vp }, i) => {
        const isCur = !over && p.id === cur.id;
        const isNext = p.id === nextId && !isCur;
        const color = colorFromToken(p.color);
        return (
          <div
            key={p.id}
            title={`Seat ${i + 1}${i === 0 ? " (plays first)" : ""}`}
            className={`min-w-[150px] flex-1 rounded-md px-2.5 py-1 transition-colors ${
              isCur ? "bg-[var(--color-gold)]/25 ring-2 ring-[var(--color-gold)]" : "bg-white/5"
            }`}
            style={{ borderLeft: `4px solid ${color}` }}
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="text-[10px] font-bold tabular-nums opacity-60">{i + 1}</span>
                <PlayerShape index={i} color={color} size={14} className="shrink-0" />
                <span className="truncate font-bold">{p.name}</span>
                {isCur && (
                  <span className="rounded bg-[var(--color-gold)] px-1 text-[9px] font-extrabold uppercase text-[var(--color-ink)]">Playing</span>
                )}
                {isNext && (
                  <span className="rounded bg-white/20 px-1 text-[9px] font-extrabold uppercase">Next</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-extrabold tabular-nums">
                {vp === top && vp > 0 && <Crown size={12} className="text-[var(--color-gold)]" aria-label="Leading" />}
                {vp}
                <span className="text-[10px] font-semibold opacity-60">/10</span>
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40"
              role="progressbar"
              aria-label={`${p.name} victory points`}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={vp}
            >
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(vp, 10) * 10}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
