import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { RESOURCES, type GameState } from "@/game/types";
import { colorFromToken } from "@/game/colors";
import { shapePath } from "@/game/shapes";
import { vpBreakdown, rankPlayers, rollHistogram } from "@/game/summary";
import { Button } from "@/components/ui/button";
import { PlayerShape } from "./PlayerShape";
import { RESOURCE_COLOR, RESOURCE_LABEL } from "./ResourceChip";

const DASHES = ["", "7 4", "2 4", "9 3 2 3"]; // line styles so players are told apart without color

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="display mb-2 text-xs font-bold uppercase tracking-widest opacity-70">{children}</h3>;
}

function VpChart({ state }: { state: GameState }) {
  const pts = state.stats.vpTimeline;
  if (pts.length < 2) return <p className="text-sm opacity-70">The game ended too quickly to chart.</p>;
  const W = 420, H = 170, L = 28, R = 14, T = 12, B = 24;
  const maxVp = Math.max(10, ...pts.flatMap((p) => p.vp));
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v: number) => H - B - (v / maxVp) * (H - T - B);
  const grid = [0, 5, 10].filter((v) => v <= maxVp);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Victory points of every player over the game">
        {grid.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(0,0,0,0.2)" strokeDasharray={v === 10 ? "5 3" : undefined} strokeWidth={v === 10 ? 1.5 : 1} />
            <text x={L - 5} y={y(v)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="currentColor" opacity={0.7}>{v}</text>
          </g>
        ))}
        <text x={L} y={H - 6} fontSize={10} fill="currentColor" opacity={0.7}>Turn {pts[0].turn}</text>
        <text x={W - R} y={H - 6} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.7}>Turn {pts[pts.length - 1].turn}</text>
        {state.players.map((p, seat) => (
          <polyline
            key={p.id}
            points={pts.map((pt, i) => `${x(i)},${y(pt.vp[seat])}`).join(" ")}
            fill="none"
            stroke={colorFromToken(p.color)}
            strokeWidth={2.5}
            strokeDasharray={DASHES[seat % 4] || undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {state.players.map((p, seat) => (
          <path
            key={`end-${p.id}`}
            d={shapePath(seat, x(pts.length - 1), y(pts[pts.length - 1].vp[seat]), 4.5)}
            fill={colorFromToken(p.color)} stroke="rgba(0,0,0,0.7)" strokeWidth={1.2}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        {state.players.map((p, seat) => (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <svg width={26} height={8} aria-hidden>
              <line x1={1} x2={25} y1={4} y2={4} stroke={colorFromToken(p.color)} strokeWidth={3} strokeDasharray={DASHES[seat % 4] || undefined} strokeLinecap="round" />
            </svg>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function RollChart({ rolls }: { rolls: number[] }) {
  const hist = rollHistogram(rolls);
  const n = rolls.reduce((s, c) => s + c, 0);
  if (n === 0) return <p className="text-sm opacity-70">No dice were rolled.</p>;
  const W = 420, H = 160, L = 8, T = 18, B = 22;
  const step = (W - L * 2) / hist.length;
  const bw = step - 8;
  const maxV = Math.max(1, ...hist.map((h) => Math.max(h.count, h.expected)));
  const y = (v: number) => H - B - (v / maxV) * (H - T - B);
  const sevens = hist.find((h) => h.total === 7)!;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="How often each dice total came up">
        {hist.map((h, i) => {
          const bx = L + i * step + 4;
          return (
            <g key={h.total}>
              <rect x={bx} y={y(h.count)} width={bw} height={Math.max(0, H - B - y(h.count))} rx={3}
                fill={h.total === 7 ? "oklch(0.52 0.2 27)" : "oklch(0.42 0.09 225)"} />
              <text x={bx + bw / 2} y={y(h.count) - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor">{h.count}</text>
              <line x1={bx - 1} x2={bx + bw + 1} y1={y(h.expected)} y2={y(h.expected)} stroke="oklch(0.2 0.03 50)" strokeWidth={2.2} />
              <text x={bx + bw / 2} y={H - 7} textAnchor="middle" fontSize={11} fontWeight={h.total === 7 ? 800 : 600} fill="currentColor">{h.total}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs opacity-80">
        {n} rolls. The dark line on each bar is how often that total is expected. 7s came up {sevens.count} times (expected about {sevens.expected.toFixed(1)}).
      </p>
    </div>
  );
}

/** The end-of-game screen: who won and why, how the game went, and the moments that decided it. */
export function GameSummary({
  state, humanId, onPlayAgain, onClose,
}: { state: GameState; humanId: string; onPlayAgain: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ranked = rankPlayers(state);
  const winner = ranked[0];
  const S = state.stats;
  const mostCollected = Math.max(...state.players.map((p) => RESOURCES.reduce((s, r) => s + S.produced[p.id][r], 0)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="summary-title">
      <div className="parchment my-auto w-full max-w-3xl rounded-2xl p-4 shadow-2xl sm:p-6">
        <div className="flex items-center gap-3">
          <Crown size={34} className="shrink-0 text-[var(--color-gold)]" />
          <div>
            <h2 id="summary-title" className="display text-2xl font-black leading-tight">
              {winner.player.id === humanId ? "Victory is yours!" : `${winner.player.name} wins!`}
            </h2>
            <p className="text-sm opacity-80">
              {winner.player.name} reached {winner.vp} victory points on turn {state.turn}.
            </p>
          </div>
        </div>

        <section className="mt-5">
          <SectionTitle>Final standings</SectionTitle>
          <ol className="space-y-1.5">
            {ranked.map(({ player, seat, vp }, i) => {
              const parts = vpBreakdown(state, player.id).filter((x) => x.vp > 0);
              return (
                <li key={player.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-black/10 px-3 py-2" style={{ borderLeft: `5px solid ${colorFromToken(player.color)}` }}>
                  <span className="w-4 text-sm font-black tabular-nums opacity-70">{i + 1}</span>
                  <PlayerShape index={seat} color={colorFromToken(player.color)} size={18} />
                  <span className="min-w-0 flex-1 truncate font-bold">{player.name}{player.id === humanId ? " (you)" : ""}</span>
                  <span className="display text-xl font-black tabular-nums">{vp}<span className="text-xs font-semibold opacity-60"> VP</span></span>
                  <div className="flex basis-full flex-wrap gap-1.5 pl-7 text-[11px] font-semibold">
                    {parts.map((x) => (
                      <span key={x.key} className="rounded bg-black/10 px-1.5 py-0.5">
                        {x.key === "settlements" && `${x.count} ${x.count === 1 ? "settlement" : "settlements"}`}
                        {x.key === "cities" && `${x.count} ${x.count === 1 ? "city" : "cities"} (+${x.vp})`}
                        {x.key === "trail" && "Longest Trail +2"}
                        {x.key === "host" && "Largest Host +2"}
                        {x.key === "seals" && `${x.count} Royal ${x.count === 1 ? "Seal" : "Seals"} (hidden until now)`}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section>
            <SectionTitle>Victory points over time</SectionTitle>
            <VpChart state={state} />
          </section>
          <section>
            <SectionTitle>Dice rolls</SectionTitle>
            <RollChart rolls={S.rolls} />
          </section>
        </div>

        <section className="mt-5">
          <SectionTitle>Cards collected from the dice</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide opacity-70">
                  <th className="py-1 pr-2 font-bold">Player</th>
                  {RESOURCES.map((r) => (
                    <th key={r} className="px-1 py-1 text-center font-bold">
                      <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle ring-1 ring-black/40" style={{ background: RESOURCE_COLOR[r] }} />
                      {RESOURCE_LABEL[r]}
                    </th>
                  ))}
                  <th className="px-1 py-1 text-center font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((p, seat) => {
                  const total = RESOURCES.reduce((s, r) => s + S.produced[p.id][r], 0);
                  return (
                    <tr key={p.id} className="border-t border-black/15">
                      <td className="py-1.5 pr-2 font-semibold">
                        <span className="inline-flex items-center gap-1.5"><PlayerShape index={seat} color={colorFromToken(p.color)} size={14} />{p.name}</span>
                      </td>
                      {RESOURCES.map((r) => <td key={r} className="px-1 py-1.5 text-center tabular-nums">{S.produced[p.id][r]}</td>)}
                      <td className="px-1 py-1.5 text-center font-extrabold tabular-nums">
                        {total}{total === mostCollected && total > 0 && <Crown size={11} className="ml-1 inline text-[var(--color-gold)]" aria-label="Collected the most" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle>The rest of the story</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide opacity-70">
                  <th className="py-1 pr-2 font-bold">Player</th>
                  <th className="px-1 py-1 text-center font-bold">Knights</th>
                  <th className="px-1 py-1 text-center font-bold">Stole</th>
                  <th className="px-1 py-1 text-center font-bold">Robbed</th>
                  <th className="px-1 py-1 text-center font-bold">Lost to 7s</th>
                  <th className="px-1 py-1 text-center font-bold">Player trades</th>
                  <th className="px-1 py-1 text-center font-bold">Bank trades</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((p, seat) => (
                  <tr key={p.id} className="border-t border-black/15">
                    <td className="py-1.5 pr-2 font-semibold">
                      <span className="inline-flex items-center gap-1.5"><PlayerShape index={seat} color={colorFromToken(p.color)} size={14} />{p.name}</span>
                    </td>
                    <td className="px-1 py-1.5 text-center tabular-nums">{p.playedKnights}</td>
                    <td className="px-1 py-1.5 text-center tabular-nums">{S.stolenBy[p.id]}</td>
                    <td className="px-1 py-1.5 text-center tabular-nums">{S.stolenFrom[p.id]}</td>
                    <td className="px-1 py-1.5 text-center tabular-nums">{S.discarded[p.id]}</td>
                    <td className="px-1 py-1.5 text-center tabular-nums">{S.playerTrades[p.id]}</td>
                    <td className="px-1 py-1.5 text-center tabular-nums">{S.bankTrades[p.id]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle>Turning points</SectionTitle>
          {S.turningPoints.length === 0 ? (
            <p className="text-sm opacity-70">A quiet game: nothing changed hands.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {S.turningPoints.map((t, i) => {
                const who = state.players.find((p) => p.id === t.playerId);
                return (
                  <li key={i} className="flex gap-2 rounded px-2 py-1" style={{ borderLeft: `4px solid ${who ? colorFromToken(who.color) : "transparent"}`, background: "rgba(0,0,0,0.06)" }}>
                    <span className="w-14 shrink-0 text-xs font-bold tabular-nums opacity-70">Turn {t.turn}</span>
                    <span>{t.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button asChild variant="secondary"><Link to="/">Main menu</Link></Button>
          <Button variant="secondary" onClick={onClose}>View board</Button>
          <Button onClick={onPlayAgain}>Play Again</Button>
        </div>
      </div>
    </div>
  );
}
