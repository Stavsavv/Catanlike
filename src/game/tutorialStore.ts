// Which tutorial tips this browser has already seen. Plain functions, no React, so any screen can use them.
const KEY = "isle-of-embers:tutorial";
export const TUTORIAL_RESET_EVENT = "embers-tutorial-reset";

export function loadDone(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveDone(done: ReadonlySet<string>) {
  try { window.localStorage.setItem(KEY, JSON.stringify([...done])); } catch { /* storage unavailable */ }
}

/** Forget what was seen, so the tutorial starts again from the first tip. */
export function resetTutorial() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(TUTORIAL_RESET_EVENT));
}
