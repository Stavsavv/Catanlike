import { RulesButton } from "@/components/game/RulesPanel";
import { DisplayMenu } from "@/components/game/DisplaySettings";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GameProvider } from "@/game/store";
import { GameScreen } from "@/components/game/GameScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Swords, Crown, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Isle of Embers — A solo strategy tile game" },
      { name: "description", content: "Settle a painterly island of forests, fields and mountains. Outsmart cunning AI rivals to claim ten Victory Points." },
      { property: "og:title", content: "Isle of Embers" },
      { property: "og:description", content: "A painterly solo strategy game of trade, expansion and dev cards." },
    ],
  }),
  component: Page,
});

interface Setup { humans: string[]; aiCount: number; board: "beginner" | "random"; }

function Page() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (setup) {
    return (
      <GameProvider config={{ humans: setup.humans, aiCount: setup.aiCount, board: setup.board }}>
        <GameScreen />
      </GameProvider>
    );
  }
  return <Lobby onStart={(s) => setSetup(s)} />;
}

function Lobby({ onStart }: { onStart: (s: Setup) => void }) {
  const [names, setNames] = useState(["Wanderer", "Player 2", "Player 3", "Player 4"]);
  const [humanCount, setHumanCount] = useState(1);
  const [ai, setAi] = useState(2);
  // 2 to 4 players in total: one human needs at least one AI rival, and the table holds four.
  const minAi = humanCount === 1 ? 1 : 0;
  const maxAi = 4 - humanCount;
  const aiShown = Math.min(maxAi, Math.max(minAi, ai));
  const pickHumans = (n: number) => {
    setHumanCount(n);
    setAi((a) => Math.min(4 - n, Math.max(n === 1 ? 1 : 0, a)));
  };
  const [board, setBoard] = useState<"beginner" | "random">("beginner");
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        <DisplayMenu />
        <RulesButton />
      </div>
      <div className="parchment rounded-2xl max-w-md w-full p-7 relative">
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[var(--color-ink)] text-[var(--color-parchment)] text-[10px] uppercase tracking-[0.3em]">
          A solo strategy game
        </div>
        <h1 className="display text-4xl text-center font-bold ink-shadow mt-2">
          Isle of Embers
        </h1>
        <p className="text-center text-sm mt-2 opacity-75 italic">
          Build settlements, lay trails, broker resources, and outwit the rival lords vying for the realm.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-widest">People playing</Label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Button key={n} type="button" size="sm" variant={humanCount === n ? "default" : "secondary"} onClick={() => pickHumans(n)}>{n}</Button>
              ))}
            </div>
            {humanCount > 1 && (
              <p className="mt-1 text-[11px] leading-snug opacity-70">
                Pass and play: everyone shares this screen. It is covered between turns so nobody sees another player's cards.
              </p>
            )}
            <div className="mt-2 space-y-2">
              {Array.from({ length: humanCount }).map((_, i) => (
                <div key={i}>
                  <Label htmlFor={`name-${i}`} className="text-[10px] uppercase tracking-widest opacity-70">{humanCount === 1 ? "Your name" : `Player ${i + 1}`}</Label>
                  <Input
                    id={`name-${i}`}
                    value={names[i]}
                    onChange={(e) => setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
                    className="mt-0.5 bg-white/40"
                    maxLength={20}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest">{humanCount === 1 ? "Rival lords (AI)" : "AI players"}</Label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={aiShown === n ? "default" : "secondary"}
                  disabled={n < minAi || n > maxAi}
                  onClick={() => setAi(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <p className="mt-1 text-[11px] opacity-70">{humanCount + aiShown} players in total</p>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest">Island</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Button type="button" size="sm" variant={board === "beginner" ? "default" : "secondary"} onClick={() => setBoard("beginner")}>Classic map</Button>
              <Button type="button" size="sm" variant={board === "random" ? "default" : "secondary"} onClick={() => setBoard("random")}>Random map</Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="rounded p-2 bg-[oklch(0.85_0.05_70/_0.5)]"><Swords className="mx-auto mb-1" size={16}/>Trade & raid</div>
            <div className="rounded p-2 bg-[oklch(0.85_0.05_70/_0.5)]"><Crown className="mx-auto mb-1" size={16}/>Race to 10 VP</div>
            <div className="rounded p-2 bg-[oklch(0.85_0.05_70/_0.5)]"><Sparkles className="mx-auto mb-1" size={16}/>Dev cards</div>
          </div>

          <Button className="w-full" size="lg" onClick={() => onStart({ humans: names.slice(0, humanCount).map((n, i) => n.trim() || (i === 0 ? "Wanderer" : `Player ${i + 1}`)), aiCount: aiShown, board })}>
            Begin the Game
          </Button>
        </div>

        <div className="mt-5 text-[10px] text-center opacity-60 leading-relaxed">
          An original game inspired by classic hex-tile strategy. No affiliation with any published board game.
        </div>
      </div>
    </div>
  );
}
