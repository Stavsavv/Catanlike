import { useState, useMemo, type ComponentType } from "react";
import { Dices, Hammer, ArrowLeftRight, Sparkles, Skull, Trophy, Info } from "lucide-react";
import type { LogEntry, Player } from "@/game/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { colorFromToken } from "@/game/colors";
import { LOG_FILTERS, logCategory, isSevenRoll, type LogCategory, type LogFilter } from "@/game/logfilter";

interface Props {
  log: LogEntry[];
  players: Player[];
}

const CATEGORY_ICON: Record<LogCategory, ComponentType<{ size?: number; className?: string }>> = {
  rolls: Dices,
  builds: Hammer,
  trades: ArrowLeftRight,
  robber: Skull,
  cards: Sparkles,
  awards: Trophy,
  other: Info,
};

const CATEGORY_LABEL: Record<LogCategory, string> = {
  rolls: "Roll or income",
  builds: "Build",
  trades: "Trade",
  robber: "Robber",
  cards: "Development card",
  awards: "Award",
  other: "Event",
};

function colorizeText(text: string, players: Player[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  const sortedNames = [...players].sort((a, b) => b.name.length - a.name.length);

  while (remaining.length > 0) {
    let matchIndex = -1;
    let matchedPlayer: Player | null = null;
    for (const p of sortedNames) {
      const idx = remaining.indexOf(p.name);
      if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
        matchIndex = idx;
        matchedPlayer = p;
      }
    }
    if (matchIndex === -1 || !matchedPlayer) {
      parts.push(remaining);
      break;
    }
    if (matchIndex > 0) {
      parts.push(remaining.slice(0, matchIndex));
    }
    parts.push(
      <span key={parts.length} style={{ color: colorFromToken(matchedPlayer.color), fontWeight: 700 }}>
        {matchedPlayer.name}
      </span>
    );
    remaining = remaining.slice(matchIndex + matchedPlayer.name.length);
  }
  return parts;
}

export function GameLog({ log, players }: Props) {
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<LogFilter>("all");
  const filtering = filter !== "all";

  const filtered = useMemo(
    () => (filtering ? log.filter((e) => logCategory(e) === filter) : log),
    [log, filter, filtering],
  );

  const turnGroups = useMemo(() => {
    const groups = new Map<number, LogEntry[]>();
    for (const entry of [...filtered].reverse()) {
      if (!groups.has(entry.turn)) groups.set(entry.turn, []);
      groups.get(entry.turn)!.push(entry);
    }
    // Reverse each group so newest entries within a turn are at top
    groups.forEach((arr) => arr.reverse());
    return groups;
  }, [filtered]);

  const turnNumbers = useMemo(() => {
    const nums = Array.from(turnGroups.keys()).sort((a, b) => b - a);
    return nums;
  }, [turnGroups]);

  // Auto-expand last 2 turns (every turn while a filter is on, so no match is hidden)
  const lastTwo = useMemo(() => {
    const nums = Array.from(turnGroups.keys()).sort((a, b) => b - a);
    return new Set(nums.slice(0, 2));
  }, [turnGroups]);

  const isExpanded = (turn: number) => filtering || expandedTurns.has(turn) || lastTwo.has(turn);
  const toggleTurn = (turn: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  };

  const entryBorderColor = (entry: LogEntry): string | undefined => {
    if (!entry.playerId) return undefined;
    const p = players.find((pl) => pl.id === entry.playerId);
    return p ? colorFromToken(p.color) : undefined;
  };

  return (
    <div className="parchment rounded-lg p-2 h-full min-h-0 flex flex-col">
      <div className="display text-xs uppercase tracking-widest opacity-70 px-1 pb-1">Chronicle</div>
      <div className="flex flex-wrap gap-1 px-1 pb-1.5" role="group" aria-label="Filter the chronicle">
        {LOG_FILTERS.map((f) => {
          const active = filter === f.id;
          const Icon = f.id === "all" ? null : CATEGORY_ICON[f.id];
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                active ? "bg-[var(--color-ink)] text-white" : "bg-black/10 hover:bg-black/20"
              }`}
            >
              {Icon && <Icon size={11} />}
              {f.label}
            </button>
          );
        })}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="pr-2 text-xs">
          {log.length === 0 && <div className="opacity-50 px-1 py-1">The realm awaits...</div>}
          {log.length > 0 && filtered.length === 0 && <div className="opacity-60 px-1 py-1">Nothing of this kind yet.</div>}
          {turnNumbers.map((turn) => {
            const entries = turnGroups.get(turn) || [];
            const expanded = isExpanded(turn);
            const isAuto = lastTwo.has(turn) && !expandedTurns.has(turn);
            return (
              <div key={turn} className="mb-1">
                <button
                  onClick={() => toggleTurn(turn)}
                  className="w-full text-left flex items-center justify-between px-1 py-0.5 rounded hover:bg-[oklch(1_0_0_/0.05)] transition-colors"
                >
                  <span className="font-bold opacity-80">Turn {turn}</span>
                  <span className="opacity-50 text-[10px]">{expanded ? "▼" : "▶"}</span>
                </button>
                {expanded && (
                  <ul className="space-y-0.5 mt-0.5">
                    {entries.map((entry) => {
                      const borderColor = entryBorderColor(entry);
                      const cat = logCategory(entry);
                      const Icon = CATEGORY_ICON[cat];
                      const seven = isSevenRoll(entry);
                      return (
                        <li
                          key={entry.id}
                          className="flex items-start gap-1.5 leading-snug rounded px-1.5 py-0.5"
                          style={{
                            borderLeft: borderColor ? `3px solid ${borderColor}` : "3px solid transparent",
                            background: borderColor ? `${borderColor}0d` : undefined,
                          }}
                        >
                          <span title={CATEGORY_LABEL[cat]} className="mt-[3px] shrink-0 opacity-60">
                            <Icon size={12} />
                          </span>
                          <span className={seven ? "font-bold text-red-700" : undefined}>{colorizeText(entry.text, players)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!filtering && !expanded && !isAuto && (
                  <button
                    onClick={() => toggleTurn(turn)}
                    className="w-full text-left text-[10px] opacity-60 px-1 py-0.5 hover:opacity-90 transition-opacity"
                  >
                    Show {entries.length} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
