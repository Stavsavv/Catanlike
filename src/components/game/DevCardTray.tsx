import { useEffect, useState, type ComponentType } from "react";
import { Swords, Crown, Route as RouteIcon, Gift, Coins, ChevronDown, ChevronUp } from "lucide-react";
import type { DevCard, DevCardKind, GameState, Player } from "@/game/types";
import { devCardGroups } from "@/game/devcards";
import { Button } from "@/components/ui/button";

const META: Record<DevCardKind, { name: string; desc: string; Icon: ComponentType<{ size?: number; className?: string }> }> = {
  knight: { name: "Knight", desc: "Move the robbers and steal 1 card. 3 played Knights can win Largest Host.", Icon: Swords },
  roadBuilding: { name: "Surveyors", desc: "Build 2 roads for free.", Icon: RouteIcon },
  yearOfPlenty: { name: "Bounty", desc: "Take any 2 resources from the bank.", Icon: Gift },
  monopoly: { name: "Royal Decree", desc: "Name a resource: every rival hands you all of theirs.", Icon: Coins },
  victoryPoint: { name: "Royal Seal", desc: "Worth 1 VP. Stays hidden and counts automatically.", Icon: Crown },
};

/** Your development cards: grouped, with what each does and exactly why it can or can't be played right now. */
export function DevCardTray({
  me, state, isMyTurn, activeKind, onPlay, onCancel,
}: {
  me: Player;
  state: GameState;
  isMyTurn: boolean;
  activeKind: DevCardKind | null; // the card whose play is in progress on the board
  onPlay: (card: DevCard) => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(true);
  // On a phone the open tray would cover the board, so start folded there.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, []);
  const groups = devCardGroups(me, state, isMyTurn);
  const played = me.devCards.filter((c) => c.played);
  if (groups.length === 0 && played.length === 0) return null;

  const held = groups.reduce((n, g) => n + g.total, 0);
  const playableNow = groups.filter((g) => g.kind !== "victoryPoint" && !g.blocker && g.ready > 0).length;
  const playedSummary = (["knight", "roadBuilding", "yearOfPlenty", "monopoly", "victoryPoint"] as DevCardKind[])
    .map((k) => ({ k, n: played.filter((c) => c.kind === k).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${META[x.k].name}${x.n > 1 ? ` ×${x.n}` : ""}`)
    .join(", ");

  return (
    <div className={`parchment absolute left-3 top-3 z-20 flex max-h-[max(150px,calc(100%-470px))] flex-col rounded-xl shadow-xl ${open ? "w-[258px]" : "w-auto"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="display text-sm font-bold uppercase tracking-wider">
          Dev cards <span className="opacity-60">({held})</span>
        </span>
        <span className="flex items-center gap-1.5">
          {playableNow > 0 && (
            <span className="rounded-full bg-[var(--color-gold)] px-1.5 text-[10px] font-extrabold uppercase text-[var(--color-ink)]">
              {playableNow} ready
            </span>
          )}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          {groups.map((g) => {
            const { name, desc, Icon } = META[g.kind];
            const active = activeKind === g.kind;
            const isVP = g.kind === "victoryPoint";
            const card = me.devCards.find((c) => c.kind === g.kind && !c.played && c.purchasedTurn < state.turn);
            return (
              <div key={g.kind} className={`rounded-md p-2 ${active ? "bg-[var(--color-gold)]/40 ring-1 ring-[var(--color-gold)]" : "bg-black/10"}`}>
                <div className="flex items-start gap-2">
                  <Icon size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="display text-sm font-bold">{name}</span>
                      {g.total > 1 && <span className="rounded bg-black/20 px-1.5 text-[11px] font-bold">×{g.total}</span>}
                    </div>
                    <div className="text-[11px] leading-tight opacity-80">{desc}</div>
                    {!isVP && g.fresh > 0 && (
                      <div className="mt-0.5 text-[10px] font-semibold opacity-70">
                        {g.ready > 0 ? `${g.ready} ready · ` : ""}{g.fresh} bought this turn
                      </div>
                    )}
                  </div>
                  {!isVP && (
                    <div className="shrink-0 self-center">
                      {active ? (
                        <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onCancel}>Cancel</Button>
                      ) : !g.blocker && card ? (
                        <Button size="sm" className="h-7 px-3 text-xs" onClick={() => onPlay(card)}>Play</Button>
                      ) : (
                        <span className="block max-w-[78px] text-right text-[10px] font-semibold leading-tight opacity-70">{g.blocker}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {(playedSummary || me.playedKnights > 0) && (
            <div className="px-1 pt-0.5 text-[10px] leading-tight opacity-70">
              {playedSummary && <>Played: {playedSummary}. </>}
              {me.playedKnights > 0 && <>Knights played: {me.playedKnights}.</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
