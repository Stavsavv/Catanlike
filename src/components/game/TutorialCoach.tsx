import { useEffect, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
import type { GameState } from "@/game/types";
import { tutorialHint, TUTORIAL_ORDER } from "@/game/tutorial";
import { loadDone, saveDone, TUTORIAL_RESET_EVENT } from "@/game/tutorialStore";
import { Button } from "@/components/ui/button";

/** Short tips for a first game, each shown once at the moment it matters. */
export function TutorialCoach({ state, myId, enabled }: { state: GameState; myId: string; enabled: boolean }) {
  const [done, setDone] = useState<Set<string>>(new Set<string>());
  const [ready, setReady] = useState(false); // read storage only after mounting, so server and browser markup match
  const shown = useRef<string | null>(null);

  useEffect(() => {
    setDone(loadDone());
    setReady(true);
    const onReset = () => setDone(new Set<string>());
    window.addEventListener(TUTORIAL_RESET_EVENT, onReset);
    return () => window.removeEventListener(TUTORIAL_RESET_EVENT, onReset);
  }, []);

  const hint = ready && enabled ? tutorialHint(state, myId, done as ReadonlySet<string>) : null;

  const markDone = (ids: string[]) => {
    setDone((prev) => {
      const next = new Set<string>(prev);
      ids.forEach((i) => next.add(i));
      saveDone(next);
      return next;
    });
  };

  // A tip that was shown and then stopped applying (you did what it said) counts as seen.
  useEffect(() => {
    const now = hint?.id ?? null;
    if (shown.current && shown.current !== now) markDone([shown.current]);
    shown.current = now;
  }, [hint?.id]);

  if (!hint) return null;
  const number = TUTORIAL_ORDER.indexOf(hint.id as (typeof TUTORIAL_ORDER)[number]) + 1;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="parchment absolute left-1/2 top-24 z-10 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-xl p-3 shadow-2xl"
      style={{ borderLeft: "6px solid var(--color-gold)" }}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-70">
        <GraduationCap size={14} /> Tip {number} of {TUTORIAL_ORDER.length}
      </div>
      <h3 className="display mt-0.5 text-base font-black leading-tight">{hint.title}</h3>
      <p className="mt-1 text-[13px] leading-snug">{hint.text}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => markDone([...TUTORIAL_ORDER])} className="text-xs font-semibold underline opacity-70 hover:opacity-100">
          Skip the tutorial
        </button>
        <Button size="sm" onClick={() => markDone([hint.id])}>Got it</Button>
      </div>
    </aside>
  );
}
