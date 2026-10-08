import type { Player } from "@/game/types";
import type { HandoffReason } from "@/game/hotseat";
import { colorFromToken } from "@/game/colors";
import { Button } from "@/components/ui/button";
import { PlayerShape } from "./PlayerShape";

const REASON_TEXT: Record<HandoffReason, (from?: string) => string> = {
  turn: () => "It's your turn.",
  discard: () => "A 7 was rolled and you must discard half your cards.",
  trade: (from) => `${from ?? "Another player"} has a trade offer for you.`,
};

/** Covers the whole screen between players so nobody sees someone else's cards. */
export function Handoff({
  player, seat, reason, fromName, onReady,
}: { player: Player; seat: number; reason: HandoffReason; fromName?: string; onReady: () => void }) {
  const color = colorFromToken(player.color);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
    >
      <div className="parchment w-full max-w-md rounded-2xl p-7 text-center shadow-2xl" style={{ borderTop: `8px solid ${color}` }}>
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-black/10">
          <PlayerShape index={seat} color={color} size={44} />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest opacity-70">Pass the device to</p>
        <h2 id="handoff-title" className="display mt-1 text-3xl font-black leading-tight">{player.name}</h2>
        <p className="mt-2 text-sm">{REASON_TEXT[reason](fromName)}</p>
        <p className="mt-1 text-xs opacity-70">Everyone else, look away: your cards are on the next screen.</p>
        <Button autoFocus size="lg" className="mt-5 w-full" onClick={onReady}>
          I'm {player.name}, show my screen
        </Button>
      </div>
    </div>
  );
}
