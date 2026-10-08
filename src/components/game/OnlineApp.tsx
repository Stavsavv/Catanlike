import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Crown, Copy, Check, X, Plus, ArrowLeft } from "lucide-react";
import { OnlineClient } from "@/game/onlineClient";
import { GameContext, type GameCtx } from "@/game/gameContext";
import { PLAYER_COLORS } from "@/game/state";
import { colorFromToken } from "@/game/colors";
import type { BoardMode } from "@/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerShape } from "./PlayerShape";
import { GameScreen } from "./GameScreen";
import { RulesButton } from "./RulesPanel";
import { DisplayMenu } from "./DisplaySettings";

const NAME_KEY = "isle-of-embers:name";

function browserStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

/** The game server shares this page's address, so friends only ever need the one link. */
export function gameSocketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/game-ws`;
}

/** A code someone typed or pasted: tolerate spaces, lower case and a whole invite link. */
export function cleanCode(raw: string): string {
  const fromLink = raw.match(/[?&]room=([A-Za-z0-9]+)/)?.[1];
  return (fromLink ?? raw).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5);
}

export function OnlineApp({ onExit, initialCode }: { onExit: () => void; initialCode?: string }) {
  const client = useMemo(() => new OnlineClient({ url: gameSocketUrl(), storage: browserStorage() }), []);
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [name, setName] = useState(() => browserStorage()?.getItem(NAME_KEY) ?? "");
  const [code, setCode] = useState(initialCode ? cleanCode(initialCode) : "");
  const [board, setBoard] = useState<BoardMode>("beginner");
  const [copied, setCopied] = useState(false);

  // Coming back to a room after a refresh: rejoin it, unless an invite for a different room was opened.
  useEffect(() => {
    const stored = OnlineClient.storedSession(browserStorage());
    if (stored && (!initialCode || cleanCode(initialCode) === stored.code)) client.resume();
    return () => client.dispose();
  }, [client, initialCode]);

  const remember = (n: string) => { try { browserStorage()?.setItem(NAME_KEY, n); } catch { /* ignore */ } };
  const myName = () => (name.trim() || "Player").slice(0, 20);
  const leave = () => { client.leave(); onExit(); };

  const room = snap.room;
  const connecting = snap.status === "connecting" || snap.status === "reconnecting";

  // ----- the game itself -----
  if (room?.started && snap.state && snap.you) {
    const ctx: GameCtx = {
      state: snap.state,
      humanId: snap.you,
      restart: () => {},
      act: (a) => client.act(a),
      online: {
        roomCode: room.code,
        isHost: room.you === 0,
        connection: snap.status === "reconnecting" ? "reconnecting" : "connected",
        seats: room.seats.map((s, i) => ({ seat: i, playerId: s.playerId, name: s.name, kind: s.kind, connected: s.connected })),
        leave,
        rematch: () => client.send({ t: "rematch" }),
        takeover: (seat) => client.send({ t: "takeover", seat }),
      },
    };
    return <GameContext.Provider value={ctx}><GameScreen /></GameContext.Provider>;
  }

  const shell = (children: React.ReactNode) => (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        <DisplayMenu />
        <RulesButton />
      </div>
      <div className="parchment relative w-full max-w-md rounded-2xl p-7">{children}</div>
    </div>
  );

  // ----- waiting room -----
  if (room) {
    const isHost = room.you === 0;
    const link = `${window.location.origin}/?room=${room.code}`;
    const copy = async () => {
      try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
    };
    return shell(
      <>
        <button type="button" onClick={leave} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100">
          <ArrowLeft size={14} /> Leave room
        </button>
        <p className="text-xs font-bold uppercase tracking-widest opacity-70">Room code</p>
        <div className="display text-5xl font-black tracking-[0.25em]" aria-label={`Room code ${room.code.split("").join(" ")}`}>{room.code}</div>
        <Button type="button" variant="secondary" size="sm" className="mt-2 gap-1.5" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Link copied" : "Copy invite link"}
        </Button>
        <p className="mt-1 text-[11px] leading-snug opacity-70">
          Friends open the link, or type the code on the same page. They must be able to reach this address.
        </p>
        {snap.status === "reconnecting" && <p className="mt-2 text-sm font-semibold text-amber-800">Connection lost. Reconnecting...</p>}

        <h2 className="display mt-5 text-xs font-bold uppercase tracking-widest opacity-70">Players ({room.seats.length}/4)</h2>
        <ul className="mt-2 space-y-1.5">
          {room.seats.map((s, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-black/10 px-3 py-2" style={{ borderLeft: `5px solid ${colorFromToken(PLAYER_COLORS[i])}` }}>
              <PlayerShape index={i} color={colorFromToken(PLAYER_COLORS[i])} size={18} />
              <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
              {i === 0 && <span title="Host" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase"><Crown size={12} /> Host</span>}
              {i === room.you && <span className="text-[10px] font-bold uppercase opacity-70">You</span>}
              {s.kind === "ai" && <span className="text-[10px] font-bold uppercase opacity-70">AI</span>}
              {s.kind === "human" && !s.connected && <span className="text-[10px] font-bold uppercase text-red-800">Offline</span>}
              {isHost && i > 0 && (
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => client.send({ t: "removeSeat", seat: i })} className="rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100">
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost ? (
          <>
            {room.seats.length < 4 && (
              <Button type="button" variant="secondary" size="sm" className="mt-2 gap-1.5" onClick={() => client.send({ t: "addAI" })}>
                <Plus size={14} /> Add an AI player
              </Button>
            )}
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-widest">Island</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <Button type="button" size="sm" variant={room.board === "beginner" ? "default" : "secondary"} onClick={() => client.send({ t: "board", board: "beginner" })}>Classic</Button>
                <Button type="button" size="sm" variant={room.board === "random" ? "default" : "secondary"} onClick={() => client.send({ t: "board", board: "random" })}>Random</Button>
                <Button type="button" size="sm" variant={room.board === "fog" ? "default" : "secondary"} onClick={() => client.send({ t: "board", board: "fog" })}>Random + fog</Button>
              </div>
              {room.board === "fog" && <p className="mt-1 text-[11px] leading-snug opacity-70">The island stays hidden while everyone places their first two settlements.</p>}
              <button
                type="button"
                role="switch"
                aria-checked={room.randomSeats}
                onClick={() => client.send({ t: "seating", random: !room.randomSeats })}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/10"
              >
                <span><b>Random seating</b> <span className="text-[11px] opacity-70">(shuffle who plays first)</span></span>
                <span aria-hidden className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${room.randomSeats ? "bg-[var(--color-ink)]" : "bg-black/30"}`}>
                  <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${room.randomSeats ? "translate-x-4" : ""}`} />
                </span>
              </button>
            </div>
            <Button className="mt-5 w-full" size="lg" disabled={room.seats.length < 2} onClick={() => client.send({ t: "start" })}>
              {room.seats.length < 2 ? "Waiting for a second player" : "Start the game"}
            </Button>
          </>
        ) : (
          <p className="mt-5 text-center text-sm font-semibold">Waiting for the host to start the game...</p>
        )}
        {snap.error && <p role="alert" className="mt-3 text-sm font-semibold text-red-800">{snap.error}</p>}
      </>,
    );
  }

  // ----- connecting or choosing a room -----
  if (connecting) {
    return shell(
      <div className="text-center">
        <p className="display text-xl font-bold">{snap.status === "reconnecting" ? "Reconnecting..." : "Connecting..."}</p>
        <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={leave}>Cancel</Button>
      </div>,
    );
  }

  const canJoin = cleanCode(code).length === 5;
  return shell(
    <>
      <button type="button" onClick={onExit} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100">
        <ArrowLeft size={14} /> Main menu
      </button>
      <h1 className="display text-2xl font-black">Play online with friends</h1>
      <p className="mt-1 text-sm opacity-80">Make a room and send the link, or join a friend's room with its code. Two to four players; the AI can fill empty seats.</p>

      {snap.closedReason && <p role="alert" className="mt-3 rounded bg-red-900/15 px-3 py-2 text-sm font-semibold text-red-900">{snap.closedReason}</p>}
      {snap.error && !snap.closedReason && <p role="alert" className="mt-3 rounded bg-red-900/15 px-3 py-2 text-sm font-semibold text-red-900">{snap.error}</p>}

      <div className="mt-4">
        <Label htmlFor="online-name" className="text-xs uppercase tracking-widest">Your name</Label>
        <Input id="online-name" value={name} maxLength={20} placeholder="Wanderer" className="mt-1 bg-white/40" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="mt-4">
        <Label className="text-xs uppercase tracking-widest">Island (if you make the room)</Label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <Button type="button" size="sm" variant={board === "beginner" ? "default" : "secondary"} onClick={() => setBoard("beginner")}>Classic</Button>
          <Button type="button" size="sm" variant={board === "random" ? "default" : "secondary"} onClick={() => setBoard("random")}>Random</Button>
          <Button type="button" size="sm" variant={board === "fog" ? "default" : "secondary"} onClick={() => setBoard("fog")}>Random + fog</Button>
        </div>
      </div>

      <Button className="mt-4 w-full" size="lg" onClick={() => { remember(name.trim()); client.create(myName(), board); }}>
        Create a room
      </Button>

      <div className="my-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest opacity-60">
        <span className="h-px flex-1 bg-black/30" /> or <span className="h-px flex-1 bg-black/30" />
      </div>

      <Label htmlFor="online-code" className="text-xs uppercase tracking-widest">Room code</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="online-code"
          value={code}
          placeholder="ABCDE"
          autoCapitalize="characters"
          autoComplete="off"
          className="bg-white/40 text-center font-mono text-lg font-bold uppercase tracking-[0.3em]"
          onChange={(e) => setCode(cleanCode(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter" && canJoin) { remember(name.trim()); client.join(cleanCode(code), myName()); } }}
        />
        <Button type="button" disabled={!canJoin} onClick={() => { remember(name.trim()); client.join(cleanCode(code), myName()); }}>Join</Button>
      </div>
    </>,
  );
}
