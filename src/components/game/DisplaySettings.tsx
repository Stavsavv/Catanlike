import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DisplaySettings {
  highContrast: boolean;  // stronger text, outlines and number tokens
  terrainLabels: boolean; // write the resource name on every hex
  playerShapes: boolean;  // mark each player's pieces with a shape as well as a color
}

const DEFAULTS: DisplaySettings = { highContrast: false, terrainLabels: false, playerShapes: true };
const STORAGE_KEY = "isle-of-embers:display";

interface Ctx { settings: DisplaySettings; update: (patch: Partial<DisplaySettings>) => void }
const DisplayContext = createContext<Ctx>({ settings: DEFAULTS, update: () => {} });

export function useDisplay(): Ctx {
  return useContext(DisplayContext);
}

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULTS);
  const ref = useRef<DisplaySettings>(DEFAULTS);

  // Read saved choices after mounting (not while rendering) so server and browser markup match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = { ...DEFAULTS, ...JSON.parse(raw) } as DisplaySettings;
        ref.current = saved;
        setSettings(saved);
      }
    } catch {
      /* storage unavailable or corrupted: keep the defaults */
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
  }, [settings.highContrast]);

  const update = useCallback((patch: Partial<DisplaySettings>) => {
    const next = { ...ref.current, ...patch };
    ref.current = next;
    setSettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  return <DisplayContext.Provider value={{ settings, update }}>{children}</DisplayContext.Provider>;
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-black/10"
    >
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-[12px] leading-snug opacity-75">{hint}</span>
      </span>
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? "bg-[var(--color-ink)]" : "bg-black/30"}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

/** "Display" button with a small panel of accessibility switches. Click outside, press Esc or click again to close. */
export function DisplayMenu() {
  const { settings, update } = useDisplay();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant={open ? "default" : "secondary"}
        size="sm"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Display options"
        onClick={() => setOpen((o) => !o)}
        className="gap-1.5"
      >
        <Eye size={14} />
        <span className="hidden sm:inline">Display</span>
      </Button>
      {open && (
        <div className="parchment absolute right-0 top-full z-50 mt-2 w-[min(19rem,calc(100vw-1.5rem))] rounded-xl p-2 shadow-2xl">
          <div className="display px-2 pb-1 pt-0.5 text-xs font-bold uppercase tracking-widest opacity-70">Display options</div>
          <ToggleRow
            label="High contrast"
            hint="Stronger text and outlines, bolder number tokens."
            checked={settings.highContrast}
            onChange={(v) => update({ highContrast: v })}
          />
          <ToggleRow
            label="Terrain labels"
            hint="Write the resource name (Lumber, Clay...) on every hex."
            checked={settings.terrainLabels}
            onChange={(v) => update({ terrainLabels: v })}
          />
          <ToggleRow
            label="Player symbols"
            hint="Mark each player's pieces with a shape (circle, square, triangle, diamond) as well as a color."
            checked={settings.playerShapes}
            onChange={(v) => update({ playerShapes: v })}
          />
        </div>
      )}
    </div>
  );
}
