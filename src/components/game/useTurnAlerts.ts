import { useEffect } from "react";

/** A short two-note chime made with the browser's own audio, so there is no sound file to load. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [[660, 0], [880, 0.14]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.32);
    });
    setTimeout(() => { void ctx.close(); }, 800);
  } catch {
    /* no audio available: the title flash still works */
  }
}

/**
 * When the game starts waiting for you while you are in another tab: chime once and flash the tab title
 * until you come back. Nothing happens if you are already looking at the game.
 */
export function useTurnAlerts(active: boolean, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !active) return;
    if (!document.hidden) return; // you are looking at it: no alert needed
    chime();
    const original = document.title;
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      document.title = on ? "🔔 Your turn! " + original : original;
    }, 1000);
    const stop = () => {
      if (document.hidden) return;
      clearInterval(flash);
      document.title = original;
      document.removeEventListener("visibilitychange", stop);
    };
    document.addEventListener("visibilitychange", stop);
    return () => {
      clearInterval(flash);
      document.title = original;
      document.removeEventListener("visibilitychange", stop);
    };
  }, [active, enabled]);
}
