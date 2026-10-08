import { useEffect, useMemo, useState, type CSSProperties } from "react";

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
};

const FACE_TRANSFORMS: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(90deg) rotateY(0deg)",
  3: "rotateY(-90deg) rotateX(0deg)",
  4: "rotateY(90deg) rotateX(0deg)",
  5: "rotateX(-90deg) rotateY(0deg)",
  6: "rotateX(180deg) rotateY(0deg)",
};

function Pips({ value }: { value: number }) {
  return (
    <>
      {PIPS[value].map(([x, y], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: "18%",
            height: "18%",
            left: `${x * 100 - 9}%`,
            top: `${y * 100 - 9}%`,
            background: "var(--color-ink)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,.18)",
          }}
        />
      ))}
    </>
  );
}

function Face({ value, className = "", style }: {
  value: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`absolute inset-0 rounded-[14%] border border-black/10 ${className}`}
      style={{
        background: "linear-gradient(145deg, oklch(0.99 0.01 90), oklch(0.83 0.05 72))",
        boxShadow: "inset 0 2px 2px rgba(255,255,255,.8), inset 0 -2px 3px rgba(80,50,20,.12)",
        ...style,
      }}
    >
      <div className="absolute inset-[12%]">
        <Pips value={value} />
      </div>
    </div>
  );
}

function Die({
  value,
  rolling,
  seed,
  size = 46,
}: {
  value: number;
  rolling: boolean;
  seed: number;
  size?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [spin, setSpin] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!rolling) {
      setDisplayValue(value);
      setSpin({ x: 0, y: 0, z: 0 });
      return;
    }

    // Show changing faces while the cube is tumbling so the final value
    // doesn't appear instantly before the animation finishes.
    const values = [1, 2, 3, 4, 5, 6];
    let index = Math.floor(Math.random() * values.length);
    const interval = window.setInterval(() => {
      index = (index + 1 + Math.floor(Math.random() * 2)) % values.length;
      setDisplayValue(values[index]);
    }, 90);

    const turns = 4 + Math.floor(Math.random() * 2);
    setSpin({
      x: 360 * turns + Math.floor(Math.random() * 180),
      y: 360 * turns + Math.floor(Math.random() * 180),
      z: Math.floor(Math.random() * 180) - 90,
    });

    return () => window.clearInterval(interval);
  }, [rolling, value, seed]);

  const finalTransform = FACE_TRANSFORMS[value] ?? FACE_TRANSFORMS[1];
  const animationName = useMemo(() => `dice-tumble-${seed}`, [seed]);

  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
        perspective: 500,
        filter: "drop-shadow(0 5px 5px rgba(0,0,0,.35))",
      }}
    >
      <div
        className={rolling ? "dice-cube dice-cube-rolling" : "dice-cube"}
        style={{
          width: "100%",
          height: "100%",
          ["--dice-size" as string]: `${size}px`,
          transform: rolling
            ? undefined
            : finalTransform,
          ["--dice-x" as string]: `${spin.x}deg`,
          ["--dice-y" as string]: `${spin.y}deg`,
          ["--dice-z" as string]: `${spin.z}deg`,
          ["--dice-animation" as string]: animationName,
        }}
      >
        <Face value={displayValue} className="dice-face dice-front" />
        <Face value={6} className="dice-face dice-back" />
        <Face value={3} className="dice-face dice-right" />
        <Face value={4} className="dice-face dice-left" />
        <Face value={5} className="dice-face dice-top" />
        <Face value={2} className="dice-face dice-bottom" />
      </div>
    </div>
  );
}

export function Dice({
  values,
  animateKey,
}: {
  values: [number, number] | null;
  animateKey?: number;
}) {
  const [rolling, setRolling] = useState(false);
  const [rollSeed, setRollSeed] = useState(0);

  useEffect(() => {
    if (animateKey === undefined) return;

    setRollSeed((s) => s + 1);
    setRolling(true);

    const t = window.setTimeout(() => setRolling(false), 1450);
    return () => window.clearTimeout(t);
  }, [animateKey]);

  const first = values?.[0] ?? 1;
  const second = values?.[1] ?? 1;

  return (
    <div className="flex items-center gap-2 px-1 py-1" aria-label={`Dice: ${first} and ${second}`}>
      <Die value={first} rolling={rolling} seed={rollSeed * 2 + 1} />
      <Die value={second} rolling={rolling} seed={rollSeed * 2 + 2} />
      {values && (
        <span className="display ml-1 min-w-5 text-center text-sm font-bold opacity-80">
          {first + second}
        </span>
      )}
    </div>
  );
}


/**
 * Dice thrown onto the board. The outer wrapper handles the physical flight
 * (arc + bounces), while the existing 3D cube handles the tumbling.
 */
export function BoardDice({
  values,
  animateKey,
  width,
  height,
}: {
  values: [number, number] | null;
  animateKey: number;
  width: number;
  height: number;
}) {
  const [rolling, setRolling] = useState(false);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [rollSeed, setRollSeed] = useState(0);
  const [targets, setTargets] = useState<[number, number][]>([]);

  useEffect(() => {
    if (animateKey <= 0 || !values) return;

    const padX = Math.max(52, width * 0.13);
    const padY = Math.max(52, height * 0.13);
    const centerX = width * 0.5;
    const centerY = height * 0.52;
    const spreadX = Math.max(55, width * 0.16);
    const spreadY = Math.max(40, height * 0.13);

    // Keep the landing points on the playable board, but make each throw
    // slightly different so it feels like two physical dice were tossed.
    const t1: [number, number] = [
      Math.min(width - padX, Math.max(padX, centerX - spreadX * 0.45 + (Math.random() - 0.5) * spreadX)),
      Math.min(height - padY, Math.max(padY, centerY + (Math.random() - 0.5) * spreadY)),
    ];
    const t2: [number, number] = [
      Math.min(width - padX, Math.max(padX, centerX + spreadX * 0.45 + (Math.random() - 0.5) * spreadX)),
      Math.min(height - padY, Math.max(padY, centerY + (Math.random() - 0.5) * spreadY)),
    ];

    setTargets([t1, t2]);
    setRollSeed((s) => s + 1);
    setRolling(true);
    setVisible(true);
    setFading(false);
    // After landing, leave the dice on the board for a moment, then fade them out so they
    // stop covering the number tokens (the roll stays visible in the top bar).
    const timers = [
      window.setTimeout(() => setRolling(false), 1450),
      window.setTimeout(() => setFading(true), 1450 + 2300),
      window.setTimeout(() => { setVisible(false); setFading(false); }, 1450 + 2300 + 600),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
    // `values` is deliberately not a dependency: every game update clones the state, which makes a new
    // array with the same numbers, and that used to replay the throw after any move. animateKey changes
    // exactly once per roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateKey, width, height]);

  if (!visible || !values || targets.length !== 2) return null;

  const startX = width * 0.5;
  const startY = height + 24;
  const size = Math.max(40, Math.min(66, width * 0.073));

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30"
      aria-label={`Dice: ${values[0]} and ${values[1]}`}
      style={{ left: 0, top: 0, width, height, opacity: fading ? 0 : 1, transition: "opacity 600ms ease" }}
    >
      {[values[0], values[1]].map((value, index) => {
        const [tx, ty] = targets[index];
        const dx = tx - startX + (index === 0 ? -size * 0.65 : size * 0.65);
        const dy = ty - startY;
        const arc = Math.max(110, Math.min(220, height * 0.28));
        const cubeSeed = rollSeed * 2 + index + 1;

        return (
          <div
            key={`${rollSeed}-${index}`}
            className={rolling ? "board-die-throw" : "board-die-landed"}
            style={{
              position: "absolute",
              left: startX - size / 2,
              top: startY - size / 2,
              width: size,
              height: size,
              ["--throw-dx" as string]: `${dx}px`,
              ["--throw-dy" as string]: `${dy}px`,
              ["--throw-arc" as string]: `${arc}px`,
              ["--land-x" as string]: `${dx}px`,
              ["--land-y" as string]: `${dy}px`,
              zIndex: 31 + index,
            } as CSSProperties}
          >
            <Die value={value} rolling={rolling} seed={cubeSeed} size={size} />
            {!rolling && (
              <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/35 blur-[3px]"
                style={{ width: size * 0.72, height: size * 0.18 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
