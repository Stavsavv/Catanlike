import { useEffect, useRef, useState } from "react";
import { Skull, Castle, Crown, Swords, Gift, Coins, Route as RouteIcon, AlertTriangle } from "lucide-react";
import type { LogEntry, Player } from "@/game/types";
import { classifyEvent, type EventIcon, type GameEvent } from "@/game/events";
import { colorFromToken } from "@/game/colors";

const ICONS: Record<EventIcon, typeof Skull> = {
  skull: Skull, castle: Castle, crown: Crown, swords: Swords, gift: Gift, coins: Coins, route: RouteIcon, alert: AlertTriangle,
};

const TONE_CLASS: Record<GameEvent["tone"], string> = {
  danger: "text-white",
  gold: "text-[var(--color-ink)]",
  info: "text-[var(--color-ink)]",
};
const TONE_BG: Record<GameEvent["tone"], string> = {
  danger: "linear-gradient(135deg, oklch(0.5 0.19 27), oklch(0.36 0.14 25))",
  gold: "linear-gradient(135deg, oklch(0.9 0.12 90), oklch(0.78 0.14 75))",
  info: "linear-gradient(135deg, oklch(0.95 0.04 85), oklch(0.88 0.05 75))",
};

/** Shows a short banner for big moments (a 7, a city, Longest Trail...). One at a time, newest events queue up. */
export function EventBanner({ log, players, humanId }: { log: LogEntry[]; players: Player[]; humanId: string }) {
  const seen = useRef<number | null>(null);
  const [queue, setQueue] = useState<GameEvent[]>([]);
  const [current, setCurrent] = useState<GameEvent | null>(null);

  // Pick up new log entries (the log is newest-first and ids only ever grow).
  useEffect(() => {
    const maxId = log.reduce((m, e) => Math.max(m, e.id), 0);
    if (seen.current === null) { seen.current = maxId; return; }
    const fresh = log.filter((e) => e.id > seen.current!).sort((a, b) => a.id - b.id);
    seen.current = Math.max(seen.current, maxId);
    const events = fresh
      .map((e) => classifyEvent(e, players, humanId))
      .filter((e): e is GameEvent => e !== null);
    if (events.length) setQueue((q) => [...q, ...events].slice(-4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  // Show the next queued event once the current one is gone.
  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setQueue(queue.slice(1));
  }, [queue, current]);

  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setCurrent(null), 3200);
    return () => window.clearTimeout(t);
  }, [current]);

  const player = current?.playerId ? players.find((p) => p.id === current.playerId) : undefined;
  const Icon = current ? ICONS[current.icon] : null;

  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 z-20">
      {current && Icon && (
        <div
          key={current.id}
          className={`event-banner absolute left-1/2 flex w-[min(30rem,calc(100%-1.5rem))] items-center gap-3 rounded-xl px-4 py-3 shadow-2xl ${TONE_CLASS[current.tone]}`}
          style={{
            background: TONE_BG[current.tone],
            borderLeft: `6px solid ${player ? colorFromToken(player.color) : "transparent"}`,
          }}
        >
          <Icon size={28} className="shrink-0" />
          <div className="min-w-0">
            <div className="display text-lg font-extrabold leading-tight">{current.title}</div>
            <div className="text-[13px] leading-snug opacity-90">{current.subtitle}</div>
          </div>
        </div>
      )}
    </div>
  );
}
