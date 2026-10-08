import type { ReactNode } from "react";
import type { GameState, Player } from "@/game/types";
import { totalResources, computeVP } from "@/game/state";
import { longestRoadFor } from "@/game/rules";
import { colorFromToken } from "@/game/colors";
import { PlayerShape } from "./PlayerShape";
import { Castle, Home, Route as RouteIcon, Swords, Crown, Layers, Sparkles } from "lucide-react";

const PARCHMENT_BG = "linear-gradient(135deg, oklch(0.95 0.04 85) 0%, oklch(0.88 0.05 75) 100%)";

function Stat({
  icon, label, value, max, title, highlight,
}: {
  icon?: ReactNode; label?: string; value: number; max?: number; title: string; highlight?: "gold" | "accent";
}) {
  const bg =
    highlight === "gold" ? "bg-[var(--color-gold)] text-[var(--color-ink)]"
    : highlight === "accent" ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
    : "bg-black/10";
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold tabular-nums ${bg}`}>
      {icon}
      {label && <span className="text-[10px] font-bold uppercase tracking-wide opacity-75">{label}</span>}
      {value}
      {max !== undefined && <span className="text-[11px] font-medium opacity-60">/{max}</span>}
    </span>
  );
}

export function PlayerCard({
  player, isCurrent, isHuman, state, compact, tag,
}: {
  player: Player; isCurrent: boolean; isHuman: boolean; state: GameState; compact?: boolean; tag?: string;
}) {
  const vp = computeVP(state, player.id);
  const publicVp = player.victoryPoints;
  const longest = state.longestRoad.playerId === player.id;
  const army = state.largestArmy.playerId === player.id;
  const color = colorFromToken(player.color);
  const trail = longestRoadFor(state, player.id);
  const devHeld = player.devCards.filter((c) => !c.played).length;

  return (
    <div
      className={`parchment rounded-lg p-3 transition-all ${isCurrent ? "gold-rim ring-2 ring-[var(--color-gold)]" : ""}`}
      style={{
        borderLeft: `5px solid ${color}`,
        // Layer the turn highlight on top of the parchment gradient (replacing it would leave the card transparent).
        backgroundImage: isCurrent ? `linear-gradient(90deg, ${color}38, transparent 60%), ${PARCHMENT_BG}` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PlayerShape index={state.players.findIndex((p) => p.id === player.id)} color={color} size={20} className="shrink-0" />
          <div className="display truncate text-lg font-bold leading-tight">{player.name}</div>
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{tag ?? (player.isAI ? "AI" : "You")}</span>
          {isCurrent && (
            <span className="rounded bg-[var(--color-gold)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink)]">
              Turn
            </span>
          )}
        </div>
        <div className="flex flex-col items-end leading-none" title="Victory points (10 to win)">
          <div className="display flex items-center gap-1 text-3xl font-black">
            <Crown size={16} className="opacity-70" />
            {isHuman ? vp : publicVp}
            <span className="text-xs font-bold opacity-60">/10</span>
          </div>
          {isHuman && player.hiddenVP > 0 && (
            <span className="mt-0.5 text-[11px] font-semibold opacity-70">incl. {player.hiddenVP} hidden</span>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Stat icon={<Layers size={13} />} value={totalResources(player)} title="Resource cards in hand" />
          <Stat icon={<Sparkles size={13} />} value={devHeld} title="Development cards held" />
          <Stat icon={<Home size={13} />} value={5 - player.settlementsLeft} max={5} title="Settlements built" />
          <Stat icon={<Castle size={13} />} value={4 - player.citiesLeft} max={4} title="Cities built" />
          <Stat icon={<RouteIcon size={13} />} value={15 - player.roadsLeft} max={15} title="Roads built" />
          <Stat
            icon={<Swords size={13} />}
            value={player.playedKnights}
            title="Knights played (3 or more, and more than anyone else, takes Largest Host)"
            highlight={army ? "accent" : undefined}
          />
          <Stat
            label="Trail"
            value={trail}
            title="Longest continuous road (5 or more, and longer than anyone else, takes Longest Trail)"
            highlight={longest ? "gold" : undefined}
          />
        </div>
      )}
      {(longest || army) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {longest && <span className="rounded bg-[var(--color-gold)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-ink)]">LONGEST TRAIL +2</span>}
          {army && <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-accent-foreground)]">LARGEST HOST +2</span>}
        </div>
      )}
    </div>
  );
}
