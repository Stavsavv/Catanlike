import { useEffect, useRef, useState } from "react";
import { TreePine, Mountain, Wheat, Cloud, Square } from "lucide-react";
import { RESOURCES, type GameState, type Player, type Resource } from "@/game/types";
import { totalResources } from "@/game/state";
import { incomeFor, type Income } from "@/game/income";
import { RESOURCE_COLOR, RESOURCE_LABEL } from "./ResourceChip";

const ICONS = { wood: TreePine, brick: Square, grain: Wheat, wool: Cloud, ore: Mountain } as const;
// Grain and wool have light backgrounds, so they get dark text for contrast.
const DARK_TEXT: Record<Resource, boolean> = { wood: false, brick: false, grain: true, wool: true, ore: false };

/** Dots = how many of the 36 dice outcomes pay you this resource each roll (a hollow dot means the robber blocks some). */
function IncomeDots({ income, label }: { income: Income; label: string }) {
  const { pips, blocked } = income;
  const none = pips === 0 && blocked === 0;
  const title = none
    ? `No ${label} income yet`
    : `${label}: ${pips} of 36 rolls pay you (about ${(pips / 36).toFixed(2)} cards per roll)` +
      (blocked ? `. ${blocked} more are blocked by the robber.` : "");
  return (
    <span title={title} className="mt-1 flex h-2 items-center justify-center gap-[2px]">
      {none ? (
        <span className="text-[9px] font-bold leading-none opacity-60">no income</span>
      ) : (
        <>
          {Array.from({ length: Math.min(pips, 8) }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-current" />
          ))}
          {pips > 8 && <span className="text-[9px] font-bold leading-none">+{pips - 8}</span>}
          {blocked > 0 && <span className="h-1.5 w-1.5 rounded-full border border-current opacity-80" />}
        </>
      )}
    </span>
  );
}

/** Big, always-visible view of the human player's resource cards, with income per roll and a +/- flash on changes. */
export function HandBar({ player, state, hidden = false }: { player: Player; state: GameState; hidden?: boolean }) {
  const total = totalResources(player);
  const income = incomeFor(state, player.id);
  const expectedPerRoll = RESOURCES.reduce((sum, r) => sum + income[r].pips, 0) / 36;
  const prev = useRef<Record<Resource, number> | null>(null);
  const [deltas, setDeltas] = useState<Partial<Record<Resource, number>>>({});
  const signature = RESOURCES.map((r) => player.resources[r]).join(",");

  useEffect(() => {
    const before = prev.current;
    prev.current = { ...player.resources };
    if (!before) return;
    const changes: Partial<Record<Resource, number>> = {};
    RESOURCES.forEach((r) => {
      const d = player.resources[r] - before[r];
      if (d !== 0) changes[r] = d;
    });
    if (Object.keys(changes).length === 0) return;
    setDeltas(changes);
    const t = window.setTimeout(() => setDeltas({}), 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (hidden) {
    // Pass-and-play: while nobody is "unlocked", show only card backs.
    return (
      <div className="parchment rounded-xl px-2.5 py-2 flex items-center gap-2 shadow-xl" aria-label="Hand hidden">
        {RESOURCES.map((r) => (
          <div key={r} className="flex h-[58px] w-[44px] items-center justify-center rounded-lg bg-black/25 text-xl font-black opacity-70 sm:w-[52px]">?</div>
        ))}
        <span className="ml-1 hidden text-xs font-semibold opacity-75 sm:block">Hand hidden</span>
      </div>
    );
  }

  return (
    <div className="parchment rounded-xl px-2.5 py-2 flex items-stretch gap-1.5 shadow-xl sm:gap-2" aria-label="Your resources">
      <div className="hidden sm:flex flex-col justify-center pr-2.5 border-r border-black/15">
        <div className="text-[10px] uppercase tracking-widest opacity-70">Your hand</div>
        <div className="display text-xl font-bold leading-none mt-0.5">
          {total}
          <span className="text-[11px] font-semibold opacity-60"> {total === 1 ? "card" : "cards"}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold leading-tight opacity-75" title="Average number of cards your buildings collect per dice roll">
          ≈ {expectedPerRoll.toFixed(2)} cards
          <br />per roll
        </div>
      </div>
      {RESOURCES.map((r) => {
        const Icon = ICONS[r];
        const count = player.resources[r];
        const delta = deltas[r];
        const ink = DARK_TEXT[r] ? "oklch(0.22 0.04 50)" : "oklch(0.98 0.01 80)";
        return (
          <div
            key={r}
            title={`${RESOURCE_LABEL[r]}: ${count}`}
            className="relative flex w-[50px] flex-col items-center justify-center rounded-lg py-1.5 transition-opacity min-[400px]:w-[58px] sm:w-[70px]"
            style={{
              background: `linear-gradient(180deg, ${RESOURCE_COLOR[r]}, color-mix(in oklab, ${RESOURCE_COLOR[r]} 72%, black))`,
              color: ink,
              opacity: count === 0 ? 0.5 : 1,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(0,0,0,0.35)",
            }}
          >
            <Icon size={18} strokeWidth={2.5} />
            <span className="text-2xl font-extrabold leading-none tabular-nums mt-0.5">{count}</span>
            <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5">{RESOURCE_LABEL[r]}</span>
            <IncomeDots income={income[r]} label={RESOURCE_LABEL[r]} />
            {delta !== undefined && (
              <span
                key={`${r}-${signature}`}
                className={`hand-delta absolute -top-2.5 -right-1 rounded-full px-1.5 text-xs font-extrabold text-white shadow ${delta > 0 ? "bg-emerald-600" : "bg-red-600"}`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
