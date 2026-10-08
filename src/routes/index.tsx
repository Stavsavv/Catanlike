import { RulesButton } from "@/components/game/RulesPanel";
import { DisplayMenu } from "@/components/game/DisplaySettings";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GameProvider } from "@/game/store";
import { GameScreen } from "@/components/game/GameScreen";
import { OnlineApp, cleanCode } from "@/components/game/OnlineApp";
import { OnlineClient } from "@/game/onlineClient";
import type { BoardMode } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Swords, Crown, Sparkles, Globe } from "lucide-react";

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

interface Setup { humans: string[]; aiCount: number; board: BoardMode; randomSeats: boolean; }

function Page() {
  const [setup, setSetup] = useState<Setup | null>(null);
  // Online play: null = not online, otherwise the room code from an invite link (if any).
  const [online, setOnline] = useState<{ code?: string } | null>(null);
  const [rejoinable, setRejoinable] = useState<string | null>(null);

  // An invite link (?room=CODE) goes straight to the online page; a remembered seat offers a way back in.
  useEffect(() => {
    const invited = new URLSearchParams(window.location.search).get("room");
    if (invited) { setOnline({ code: cleanCode(invited) }); return; }
    try { setRejoinable(OnlineClient.storedSession(window.localStorage)?.code ?? null); } catch { /* ignore */ }
  }, []);

  const leaveOnline = () => {
    setOnline(null);
    setRejoinable(null);
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  };

  if (online) return <OnlineApp onExit={leaveOnline} initialCode={online.code} />;
  if (setup) {
    return (
      <GameProvider config={{ humans: setup.humans, aiCount: setup.aiCount, board: setup.board, randomSeats: setup.randomSeats }}>
        <GameScreen />
      </GameProvider>
    );
  }
  return <Lobby onStart={(s) => setSetup(s)} onOnline={() => setOnline({ code: rejoinable ?? undefined })} rejoinCode={rejoinable} />;
}

function Lobby({ onStart, onOnline, rejoinCode }: { onStart: (s: Setup) => void; onOnline: () => void; rejoinCode: string | null }) {
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
  const [board, setBoard] = useState<BoardMode>("beginner");
  const [randomSeats, setRandomSeats] = useState(false);
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
            <div className="mt-1 grid grid-cols-3 gap-2">
              <Button type="button" size="sm" variant={board === "beginner" ? "default" : "secondary"} onClick={() => setBoard("beginner")}>Classic</Button>
              <Button type="button" size="sm" variant={board === "random" ? "default" : "secondary"} onClick={() => setBoard("random")}>Random</Button>
              <Button type="button" size="sm" variant={board === "fog" ? "default" : "secondary"} onClick={() => setBoard("fog")}>Random + fog</Button>
            </div>
            <p className="mt-1 text-[11px] leading-snug opacity-70">
              {board === "beginner" && "The classic island, the same every time."}
              {board === "random" && "A shuffled island."}
              {board === "fog" && "A shuffled island that stays hidden while everyone places their first two settlements."}
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={randomSeats}
              onClick={() => setRandomSeats((v) => !v)}
              className="mt-2 flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/10"
            >
              <span><b>Random seating</b> <span className="text-[11px] opacity-70">(shuffle who plays first)</span></span>
              <span aria-hidden className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${randomSeats ? "bg-[var(--color-ink)]" : "bg-black/30"}`}>
                <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${randomSeats ? "translate-x-4" : ""}`} />
              </span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="rounded p-2 bg-[oklch(0.85_0.05_70/_0.5)]"><Swords className="mx-auto mb-1" size={16}/>Trade & raid</div>
            <div className="rounded p-2 bg-[oklch(0.85_0.05_70/_0.5)]"><Crown className="mx-auto mb-1" size={16}/>Race to 10 VP</div>
            <div className="rounded p-2 bg-[oklch(0.85_0.05_70/_0.5)]"><Sparkles className="mx-auto mb-1" size={16}/>Dev cards</div>
          </div>

          <Button className="w-full" size="lg" onClick={() => onStart({ humans: names.slice(0, humanCount).map((n, i) => n.trim() || (i === 0 ? "Wanderer" : `Player ${i + 1}`)), aiCount: aiShown, board, randomSeats })}>
            Begin the Game
          </Button>

          <Button className="w-full gap-2" size="lg" variant="secondary" onClick={onOnline}>
            <Globe size={16} /> {rejoinCode ? `Rejoin online room ${rejoinCode}` : "Play online with friends"}
          </Button>
        </div>

        <div className="mt-5 text-[10px] text-center opacity-60 leading-relaxed">
          An original game inspired by classic hex-tile strategy. No affiliation with any published board game.
        </div>
      </div>
    </div>
  );
}
