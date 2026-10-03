import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { useGame } from "@/game/store";
import { HexBoard } from "./HexBoard";
import { PlayerCard } from "./PlayerCard";
import { RulesButton } from "./RulesPanel";
import { HandBar } from "./HandBar";
import { DevCardTray } from "./DevCardTray";
import { EventBanner } from "./EventBanner";
import { TurnStrip } from "./TurnStrip";
import { GameSummary } from "./GameSummary";
import { Handoff } from "./Handoff";
import { neededHuman } from "@/game/hotseat";
import { DisplayMenu } from "./DisplaySettings";
import { shortcutAction } from "@/game/shortcuts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { GameLog } from "./GameLog";
import { ResourceChip, RESOURCE_LABEL, RESOURCE_COLOR } from "./ResourceChip";
import { RESOURCES, type Resource, type Vertex, type Edge, type Hex, type DevCard } from "@/game/types";
import {
  canPlaceSettlement, canPlaceRoad, canPlaceCity,
  placeSettlement, placeRoad, placeCity, rollDice, endTurn,
  discardResources, moveRobber, stealFrom, bankTrade, bankRate,
  buyDevCard, playDevCard, giveSetupResources,
} from "@/game/rules";
import { canAfford, COSTS, currentPlayer, totalResources, log as gameLog } from "@/game/state";
import {
  safeTrade, validateTrade, evaluateAITrade, aiCounterOffer, emptyCounts, countCards, describeCounts,
} from "@/game/trade";
import { colorFromToken } from "@/game/colors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Castle, Home, Route as RouteIcon, Dices, Sparkles, ChevronRight, Plus, Minus, Crown, Check, X, Landmark, Users, ScrollText, RotateCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";

type SelectMode =
  | null
  | "placeSetupSettlement"
  | "placeSetupRoad"
  | "placeSettlement"
  | "placeRoad"
  | "placeCity"
  | "moveRobber"
  | "knightRobber"
  | "freeRoad1"
  | "freeRoad2";

export function GameScreen() {
  const { state, apply, humanId: storeHumanId, restart } = useGame();

  // Pass-and-play: with two or more humans the screen belongs to whoever is needed right now (their turn,
  // a discard, a trade offer) and a cover screen hides every hand while the device changes hands.
  const humans = state.players.filter((p) => !p.isAI);
  const multi = humans.length > 1;
  const needed = multi ? neededHuman(state) : null;
  const neededId = needed?.id ?? null;
  const lastViewer = useRef(storeHumanId);
  if (neededId) lastViewer.current = neededId;
  const viewerId = multi ? (neededId ?? lastViewer.current) : storeHumanId;
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null);
  useEffect(() => { if (multi && !neededId) setUnlockedFor(null); }, [multi, neededId]);
  const hidePrivate = multi && unlockedFor !== viewerId;
  const showHandoff = multi && needed !== null && unlockedFor !== needed.id;
  const humanId = viewerId; // everything below treats the viewer as "me"
  const me = state.players.find((p) => p.id === humanId)!;
  const newGameConfig = () => ({
    humans: humans.map((p) => p.name),
    aiCount: state.players.length - humans.length,
    board: state.boardMode,
  });
  const cur = currentPlayer(state);
  const lastRoll = state.lastRoll ?? null;
  const roller = lastRoll ? state.players.find((p) => p.id === lastRoll.playerId) : null;
  const lastSum = lastRoll ? lastRoll.values[0] + lastRoll.values[1] : 0;
  const isMyTurn = cur.id === humanId;

  const [mode, setMode] = useState<SelectMode>(null);
  const [justPlacedSetupVertex, setJustPlacedSetupVertex] = useState<number | null>(null);
  const [freeRoad1, setFreeRoad1] = useState<number | null>(null);
  const [pendingVertex, setPendingVertex] = useState<number | null>(null);
  const [pendingEdge, setPendingEdge] = useState<number | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [playerTradeOpen, setPlayerTradeOpen] = useState(false);
  const [countering, setCountering] = useState(false); // answering an AI proposal with a counteroffer
  const [summaryOpen, setSummaryOpen] = useState(true); // end-of-game summary (can be closed to look at the board)
  const gameOver = state.phase === "gameover";
  useEffect(() => { if (gameOver) setSummaryOpen(true); }, [gameOver]);
  const [panelOpen, setPanelOpen] = useState<"players" | "log" | null>(null); // phone/tablet side panel sheet
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (mq.matches) setPanelOpen(null); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [yopOpen, setYopOpen] = useState<DevCard | null>(null);
  const [monopolyOpen, setMonopolyOpen] = useState<DevCard | null>(null);


  // Reset modes when it stops being our turn
  useEffect(() => {
    if (!isMyTurn) {
      setMode(null);
      setJustPlacedSetupVertex(null);
      setFreeRoad1(null);
      setPendingVertex(null);
      setPendingEdge(null);
    }
  }, [isMyTurn]);

  // Auto-enter setup placement mode when it's our setup turn
  useEffect(() => {
    if (!isMyTurn) return;
    if (state.phase === "setup1" || state.phase === "setup2") {
      if (justPlacedSetupVertex === null) setMode("placeSetupSettlement");
      else setMode("placeSetupRoad");
    }
    if (state.phase === "moveRobber") setMode("moveRobber");
  }, [isMyTurn, state.phase, justPlacedSetupVertex]);

  // Determine valid targets based on mode
  const { validVertices, validEdges, validHexes } = useMemo(() => {
    const vv = new Set<number>();
    const ve = new Set<number>();
    const vh = new Set<number>();
    if (!isMyTurn) return { validVertices: vv, validEdges: ve, validHexes: vh };
    if (mode === "placeSetupSettlement" || mode === "placeSettlement") {
      const setup = mode === "placeSetupSettlement";
      state.vertices.forEach((v) => {
        if (canPlaceSettlement(state, v.id, humanId, setup)) vv.add(v.id);
      });
    } else if (mode === "placeSetupRoad") {
      if (justPlacedSetupVertex !== null) {
        state.edges.forEach((e) => {
          if (canPlaceRoad(state, e.id, humanId, justPlacedSetupVertex)) ve.add(e.id);
        });
      }
    } else if (mode === "placeRoad" || mode === "freeRoad1" || mode === "freeRoad2") {
      state.edges.forEach((e) => {
        if (canPlaceRoad(state, e.id, humanId)) ve.add(e.id);
      });
    } else if (mode === "placeCity") {
      state.vertices.forEach((v) => {
        if (canPlaceCity(state, v.id, humanId)) vv.add(v.id);
      });
    } else if (mode === "moveRobber" || mode === "knightRobber") {
      state.hexes.forEach((h) => {
        if (h.id !== state.robberHexId) vh.add(h.id);
      });
    }
    return { validVertices: vv, validEdges: ve, validHexes: vh };
  }, [state, mode, isMyTurn, humanId, justPlacedSetupVertex]);

  // Click on board element -> just stage a pending action; player must confirm.
  const onVertex = (v: Vertex) => {
    if (mode === "placeSetupSettlement" || mode === "placeSettlement" || mode === "placeCity") {
      setPendingVertex(v.id);
    }
  };
  const onEdge = (e: Edge) => {
    if (mode === "placeSetupRoad" || mode === "placeRoad" || mode === "freeRoad1" || mode === "freeRoad2") {
      setPendingEdge(e.id);
    }
  };
  const onHex = (h: Hex) => {
    if (mode === "moveRobber") {
      apply((s) => moveRobber(s, h.id));
      setMode(null);
    } else if (mode === "knightRobber") {
      const card = me.devCards.find((c) => c.kind === "knight" && !c.played && c.purchasedTurn < state.turn);
      if (card) apply((s) => playDevCard(s, card.id, { hexId: h.id }));
      setMode(null);
    }
  };

  const cancelPending = () => {
    setPendingVertex(null);
    setPendingEdge(null);
  };

  const confirmPending = () => {
    if (pendingVertex !== null) {
      const vid = pendingVertex;
      if (mode === "placeSetupSettlement") {
        apply((s) => {
          placeSettlement(s, vid, true);
          if (s.phase === "setup2") giveSetupResources(s, vid);
        });
        setJustPlacedSetupVertex(vid);
        setMode("placeSetupRoad");
      } else if (mode === "placeSettlement") {
        apply((s) => placeSettlement(s, vid, false));
        setMode(null);
      } else if (mode === "placeCity") {
        apply((s) => placeCity(s, vid));
        setMode(null);
      }
      setPendingVertex(null);
      return;
    }
    if (pendingEdge !== null) {
      const eid = pendingEdge;
      if (mode === "placeSetupRoad") {
        apply((s) => {
          placeRoad(s, eid, true);
          endTurn(s);
        });
        setJustPlacedSetupVertex(null);
        setMode(null);
      } else if (mode === "placeRoad") {
        apply((s) => placeRoad(s, eid, false));
        setMode(null);
      } else if (mode === "freeRoad1") {
        setFreeRoad1(eid);
        setMode("freeRoad2");
      } else if (mode === "freeRoad2") {
        const e1 = freeRoad1!;
        const card = me.devCards.find((c) => c.kind === "roadBuilding" && !c.played && c.purchasedTurn < state.turn);
        if (card) apply((s) => playDevCard(s, card.id, { edge1: e1, edge2: eid }));
        setFreeRoad1(null);
        setMode(null);
      }
      setPendingEdge(null);
    }
  };

  const pendingKind: "settlement" | "city" | null =
    pendingVertex === null ? null : mode === "placeCity" ? "city" : "settlement";
  const meColor = colorFromToken(me.color);
  const previewBuilding = pendingVertex !== null && pendingKind
    ? { vertexId: pendingVertex, color: meColor, kind: pendingKind }
    : null;
  const previewRoad = pendingEdge !== null
    ? { edgeId: pendingEdge, color: meColor }
    : null;

  const handleRoll = () => {
    apply((s) => rollDice(s));
  };

  const handleEndTurn = () => apply((s) => endTurn(s));

  // Can each purchase be made right now? Shared by the buttons and the keyboard shortcuts.
  const canBuild = {
    settlement: canAfford(me, COSTS.settlement) && me.settlementsLeft > 0,
    city: canAfford(me, COSTS.city) && me.citiesLeft > 0,
    road: canAfford(me, COSTS.road) && me.roadsLeft > 0,
    dev: canAfford(me, COSTS.devCard) && state.devDeck.length > 0,
  };

  // Keyboard shortcuts: R roll, E end turn, 1-4 build, B bank, T players, Enter confirm, Esc cancel.
  // The handler is re-assigned every render so it always sees the latest state.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return; // dialogs own the keyboard
    if (e.key === "Escape" && (document.getElementById("rules-panel") || document.querySelector('[aria-haspopup="true"][aria-expanded="true"]'))) {
      return; // the Rules panel and Display menu close themselves on Esc
    }
    const action = shortcutAction({
      key: e.key,
      phase: state.phase,
      isMyTurn,
      mode,
      staging: pendingVertex !== null || pendingEdge !== null,
      canBuild,
      focusOnButton: !!el?.closest("button"),
    });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "roll": handleRoll(); break;
      case "endTurn": handleEndTurn(); break;
      case "toggleSettlement": setMode(mode === "placeSettlement" ? null : "placeSettlement"); break;
      case "toggleCity": setMode(mode === "placeCity" ? null : "placeCity"); break;
      case "toggleRoad": setMode(mode === "placeRoad" ? null : "placeRoad"); break;
      case "buyDev": apply((s) => buyDevCard(s)); break;
      case "bank": setTradeOpen(true); break;
      case "players": setPlayerTradeOpen(true); break;
      case "confirm": confirmPending(); break;
      case "cancel":
        // First Esc drops a selected spot (like the Cancel button); the next one leaves the mode itself.
        if (pendingVertex !== null || pendingEdge !== null) cancelPending();
        else { setMode(null); setFreeRoad1(null); }
        break;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Stealing prompt
  const showStealing = isMyTurn && state.phase === "stealing" && !hidePrivate;
  // Discard prompt
  const showDiscard = state.phase === "discard" && state.pendingDiscards.includes(humanId) && !hidePrivate;

  const playerCards = state.players.map((p) => (
    <PlayerCard key={p.id} player={p} isCurrent={p.id === cur.id} isHuman={p.id === humanId && !hidePrivate} tag={p.isAI ? "AI" : multi ? "Human" : "You"} state={state} />
  ));

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 px-2 py-2 border-b border-[oklch(1_0_0_/_0.1)] sm:gap-3 sm:px-3">
        <Link to="/" className="display text-base font-bold tracking-wider" aria-label="Isle of Embers">⚔<span className="hidden sm:inline"> ISLE OF EMBERS</span></Link>
        <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
          <span className="hidden opacity-70 sm:inline">Turn {state.turn}</span>
          <span className="hidden opacity-70 sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: colorFromToken(cur.color) }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/40" style={{ backgroundColor: colorFromToken(cur.color) }} />
            {cur.name}'s turn
          </span>
          <span className="opacity-70 hidden sm:inline">· {phaseLabel(state.phase)}</span>
          {lastRoll && (
            <span
              className="inline-flex items-center gap-1.5 rounded-md bg-black/25 px-2 py-0.5 font-semibold"
              title={`${roller?.name ?? "Someone"} rolled ${lastRoll.values[0]} + ${lastRoll.values[1]}`}
            >
              <Dices size={15} />
              <span className="tabular-nums">{lastRoll.values[0]} + {lastRoll.values[1]} =</span>
              <span className={`rounded px-1.5 text-base font-extrabold tabular-nums ${lastSum === 7 ? "bg-red-600 text-white" : "bg-[var(--color-gold)] text-[var(--color-ink)]"}`}>
                {lastSum}
              </span>
            </span>
          )}
        </div>
        <div className="hidden md:flex items-center gap-1.5" title="Bank supply (19 of each resource to start)">
          <span className="text-[10px] uppercase tracking-widest opacity-60">Bank</span>
          {RESOURCES.map((r) => (
            <span
              key={r}
              className={`rounded-md ${state.bank[r] <= 3 ? "ring-2 ring-red-400" : ""}`}
              title={`${RESOURCE_LABEL[r]}: ${state.bank[r]} left in the bank`}
            >
              <ResourceChip kind={r} count={state.bank[r]} size={24} />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <DisplayMenu />
          <RulesButton />
          <Button
            variant="secondary"
            size="sm"
            aria-label="New game"
            onClick={() => restart(newGameConfig())}
          >
            <RotateCcw size={14} className="sm:hidden" aria-hidden />
            <span className="hidden sm:inline">New Game</span>
          </Button>
        </div>
      </header>

      <TurnStrip state={state} humanId={hidePrivate ? "" : humanId} />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
        {/* Board area */}
        <div className="relative min-h-0">
          <HexBoard
            state={state}
            validVertices={validVertices}
            validEdges={validEdges}
            validHexes={validHexes}
            onVertex={onVertex}
            onEdge={onEdge}
            onHex={onHex}
            hideTerrain={false}
            viewerId={humanId}
            previewBuilding={previewBuilding}
            previewRoad={previewRoad}
            indicatorColor={colorFromToken(cur.color)}
          />

          {/* Confirm bar (Build Action Rule) */}
          {(pendingVertex !== null || pendingEdge !== null) && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 parchment gold-rim rounded-lg px-3 py-2 flex items-center gap-2 shadow-xl">
              <span className="text-sm font-semibold">
                {pendingVertex !== null
                  ? (mode === "placeCity" ? "Upgrade to City here?" : "Place settlement here?")
                  : (mode?.startsWith("freeRoad") ? "Place this free road?" : "Build road here?")}
              </span>
              <Button size="sm" onClick={confirmPending} className="gap-1">
                <Check size={14}/> Confirm
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelPending} className="gap-1">
                <X size={14}/> Cancel
              </Button>
            </div>
          )}

          {/* Left column: build and trade buttons stacked above your hand */}
          <div className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
            {isMyTurn && state.phase === "main" && !hidePrivate && (
              <div className="flex w-12 flex-col gap-1.5 md:w-[256px]">
                <div className="ink-shadow hidden px-1 text-[10px] font-bold uppercase tracking-widest opacity-80 md:block">Build</div>
                <ActionButton
                  icon={<Home size={16} />} label="Settlement" cost={COSTS.settlement} have={me.resources}
                  active={mode === "placeSettlement"}
                  disabled={!canBuild.settlement}
                  hotkey="1"
                  onClick={() => setMode(mode === "placeSettlement" ? null : "placeSettlement")}
                />
                <ActionButton
                  icon={<Castle size={16} />} label="City" cost={COSTS.city} have={me.resources}
                  active={mode === "placeCity"}
                  disabled={!canBuild.city}
                  hotkey="2"
                  onClick={() => setMode(mode === "placeCity" ? null : "placeCity")}
                />
                <ActionButton
                  icon={<RouteIcon size={16} />} label="Road" cost={COSTS.road} have={me.resources}
                  active={mode === "placeRoad"}
                  disabled={!canBuild.road}
                  hotkey="3"
                  onClick={() => setMode(mode === "placeRoad" ? null : "placeRoad")}
                />
                <ActionButton
                  icon={<Sparkles size={16} />} label="Dev Card" cost={COSTS.devCard} have={me.resources}
                  disabled={!canBuild.dev}
                  hotkey="4"
                  onClick={() => apply((s) => buyDevCard(s))}
                />
                <div className="ink-shadow mt-1 hidden px-1 text-[10px] font-bold uppercase tracking-widest opacity-80 md:block">Trade</div>
                <ActionButton icon={<Landmark size={16} />} label="Bank" hotkey="B" onClick={() => setTradeOpen(true)} />
                <ActionButton icon={<Users size={16} />} label="Players" hotkey="T" onClick={() => setPlayerTradeOpen(true)} />
              </div>
            )}
            <HandBar key={me.id} player={me} state={state} hidden={hidePrivate} />
          </div>

          {/* Bottom right: roll, end turn and what-to-do prompts */}
          <div className="absolute bottom-36 right-16 flex max-w-[calc(100%-5rem)] flex-wrap items-center justify-end gap-2 md:bottom-3 md:max-w-[calc(100%-560px)]">
            {isMyTurn && state.phase === "roll" && (
              <Button onClick={handleRoll} size="lg" className="gap-2" title="Roll the dice (key R)"><Dices size={18}/> Roll Dice <kbd className="hidden rounded bg-black/25 px-1.5 text-[11px] md:inline">R</kbd></Button>
            )}

            {isMyTurn && (mode === "placeSetupSettlement" || mode === "placeSetupRoad") && (
              <div className="parchment rounded-lg px-3 py-2 text-sm">
                {mode === "placeSetupSettlement" ? "Place your starting settlement" : "Now place a connecting road"}
                {state.phase === "setup2" && mode === "placeSetupSettlement" && (
                  <span className="ml-1 opacity-70">(yields starting resources)</span>
                )}
              </div>
            )}

            {isMyTurn && (mode === "moveRobber" || mode === "knightRobber") && (
              <div className="parchment rounded-lg px-3 py-2 text-sm">
                Click a hex to move the robbers
              </div>
            )}
            {isMyTurn && (mode === "freeRoad1" || mode === "freeRoad2") && (
              <div className="parchment rounded-lg px-3 py-2 text-sm">
                Surveyors: place {mode === "freeRoad1" ? "first" : "second"} free road
              </div>
            )}

            {isMyTurn && state.phase === "main" && (
              <Button onClick={handleEndTurn} size="lg" className="gap-1">
                End Turn <ChevronRight size={16}/> <kbd className="hidden rounded bg-black/25 px-1.5 text-[11px] md:inline">E</kbd>
              </Button>
            )}
          </div>

          {/* Phone and tablet: players and the log live in a bottom sheet */}
          <div className="absolute right-3 top-3 z-10 flex gap-2 lg:hidden">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setPanelOpen("players")}>
              <Users size={14} /> Players
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setPanelOpen("log")}>
              <ScrollText size={14} /> Log
            </Button>
          </div>

          {gameOver && !summaryOpen && (
            <Button className="absolute left-1/2 top-3 z-30 -translate-x-1/2 gap-1.5 shadow-xl" onClick={() => setSummaryOpen(true)}>
              <Crown size={14} /> Game summary
            </Button>
          )}

          {/* Banners for big moments */}
          <EventBanner log={state.log} players={state.players} humanId={hidePrivate ? "" : humanId} />

          {/* Your development cards */}
          {!hidePrivate && <DevCardTray
            key={me.id}
            me={me}
            state={state}
            isMyTurn={isMyTurn}
            activeKind={mode === "knightRobber" ? "knight" : mode === "freeRoad1" || mode === "freeRoad2" ? "roadBuilding" : null}
            onPlay={(c) => {
              if (c.kind === "knight") setMode("knightRobber");
              else if (c.kind === "yearOfPlenty") setYopOpen(c);
              else if (c.kind === "monopoly") setMonopolyOpen(c);
              else if (c.kind === "roadBuilding") setMode("freeRoad1");
            }}
            onCancel={() => { setMode(null); setFreeRoad1(null); setPendingEdge(null); setPendingVertex(null); }}
          />}
        </div>

        {/* Side panel */}
        <aside className="hidden flex-col gap-2 p-2 min-h-0 border-l border-[oklch(1_0_0_/_0.1)] overflow-y-auto lg:flex">
          {playerCards}
          <div className="flex-1 min-h-[200px]">
            <GameLog log={state.log} players={state.players} />
          </div>
        </aside>
      </div>

      {/* Discard modal */}
      <DiscardDialog open={showDiscard} state={state} humanId={humanId} apply={apply} />

      {/* Stealing modal */}
      <Dialog open={showStealing}>
        <DialogContent className="parchment">
          <DialogHeader>
            <DialogTitle>Choose a target</DialogTitle>
            <DialogDescription>Steal one random resource from a player adjacent to the robbers.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {state.stealCandidates.map((id) => {
              const t = state.players.find((p) => p.id === id)!;
              return (
                <Button key={id} variant="secondary" onClick={() => apply((s) => stealFrom(s, id))}
                  style={{ borderLeft: `4px solid ${colorFromToken(t.color)}` }}>
                  {t.name} ({totalResources(t)} cards)
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bank trade modal */}
      <BankTradeDialog open={tradeOpen} onClose={() => setTradeOpen(false)} me={me} state={state} apply={apply} />

      {/* Phone and tablet side panel */}
      <Sheet open={panelOpen !== null} onOpenChange={(o) => { if (!o) setPanelOpen(null); }}>
        <SheetContent side="bottom" className="flex h-[75vh] flex-col gap-3 p-3 lg:hidden">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle>{panelOpen === "log" ? "Chronicle" : "Players"}</SheetTitle>
            <SheetDescription className="sr-only">Every player's cards and the game log</SheetDescription>
          </SheetHeader>
          <div className="flex gap-2" role="tablist" aria-label="Side panel">
            <Button role="tab" aria-selected={panelOpen === "players"} size="sm" variant={panelOpen === "players" ? "default" : "secondary"} onClick={() => setPanelOpen("players")}>Players</Button>
            <Button role="tab" aria-selected={panelOpen === "log"} size="sm" variant={panelOpen === "log" ? "default" : "secondary"} onClick={() => setPanelOpen("log")}>Chronicle</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panelOpen === "log" ? (
              <div className="h-full min-h-[240px]">
                <GameLog log={state.log} players={state.players} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">{playerCards}</div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Player trade (you propose) and incoming offers (AI proposes) */}
      <PlayerTradeDialog
        open={playerTradeOpen || countering}
        counterMode={countering}
        initial={countering && state.pendingTrade && state.pendingTrade.toPlayerId === me.id
          ? { target: state.pendingTrade.fromPlayerId, give: state.pendingTrade.request, get: state.pendingTrade.offer }
          : undefined}
        onClose={() => {
          if (countering) {
            apply((s: any) => {
              if (!s.pendingTrade) return;
              const f = s.players.find((p: any) => p.id === s.pendingTrade.fromPlayerId);
              gameLog(s, { kind: "trade", playerId: me.id, text: `${me.name} declined ${f?.name}'s offer` });
              s.pendingTrade = null;
            });
            setCountering(false);
          }
          setPlayerTradeOpen(false);
        }}
        onTraded={() => { setCountering(false); setPlayerTradeOpen(false); }}
        me={me} state={state} apply={apply}
      />
      <IncomingTradeDialog me={me} state={state} apply={apply} hidden={countering || hidePrivate} onCounter={() => setCountering(true)} />

      {/* Year of Plenty */}
      <YearOfPlentyDialog
        open={!!yopOpen}
        onClose={() => setYopOpen(null)}
        onPick={(a, b) => { if (yopOpen) apply((s) => playDevCard(s, yopOpen.id, { resources: [a, b] })); setYopOpen(null); }}
      />

      {/* Monopoly */}
      <MonopolyDialog
        open={!!monopolyOpen}
        onClose={() => setMonopolyOpen(null)}
        onPick={(r) => { if (monopolyOpen) apply((s) => playDevCard(s, monopolyOpen.id, { monopoly: r })); setMonopolyOpen(null); }}
      />

      {/* Pass-and-play cover screen */}
      {showHandoff && needed && (
        <Handoff
          player={state.players.find((p) => p.id === needed.id)!}
          seat={state.players.findIndex((p) => p.id === needed.id)}
          reason={needed.reason}
          fromName={state.pendingTrade ? state.players.find((p) => p.id === state.pendingTrade!.fromPlayerId)?.name : undefined}
          onReady={() => setUnlockedFor(needed.id)}
        />
      )}

      {/* Game over */}
      {gameOver && summaryOpen && (
        <GameSummary
          state={state}
          humanId={multi ? "" : humanId}
          onClose={() => setSummaryOpen(false)}
          onPlayAgain={() => restart(newGameConfig())}
        />
      )}
    </div>
  );
}

function phaseLabel(p: string): string {
  switch (p) {
    case "setup1": return "Setup (first round)";
    case "setup2": return "Setup (second round)";
    case "roll": return "Roll the dice";
    case "main": return "Build phase";
    case "discard": return "Discard phase";
    case "moveRobber": return "Move the robbers";
    case "stealing": return "Stealing";
    case "gameover": return "Game over";
    default: return p;
  }
}

function DiscardDialog({ open, state, humanId, apply }: { open: boolean; state: any; humanId: string; apply: (m: (s: any) => void) => void }) {
  const me = state.players.find((p: any) => p.id === humanId);
  const need = Math.floor(totalResources(me) / 2);
  const [picks, setPicks] = useState<Record<Resource, number>>({ wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 });
  useEffect(() => { if (open) setPicks({ wood: 0, brick: 0, grain: 0, wool: 0, ore: 0 }); }, [open]);
  const total = RESOURCES.reduce((s, r) => s + picks[r], 0);
  return (
    <Dialog open={open}>
      <DialogContent className="parchment">
        <DialogHeader>
          <DialogTitle>Robbers raid your stores</DialogTitle>
          <DialogDescription>Discard {need} cards (you have {totalResources(me)}).</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {RESOURCES.map((r) => (
            <div key={r} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ResourceChip kind={r} />
                <span className="text-sm">{RESOURCE_LABEL[r]} ({me.resources[r]})</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="secondary" disabled={picks[r] === 0}
                  onClick={() => setPicks((p) => ({ ...p, [r]: p[r] - 1 }))}><Minus size={14}/></Button>
                <span className="w-6 text-center font-bold">{picks[r]}</span>
                <Button size="icon" variant="secondary" disabled={picks[r] >= me.resources[r] || total >= need}
                  onClick={() => setPicks((p) => ({ ...p, [r]: p[r] + 1 }))}><Plus size={14}/></Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={total !== need} onClick={() => apply((s: any) => discardResources(s, humanId, picks))}>
            Discard {total}/{need}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankTradeDialog({ open, onClose, me, state, apply }: { open: boolean; onClose: () => void; me: any; state: any; apply: (m: (s: any) => void) => void }) {
  const [give, setGive] = useState<Resource>("wood");
  const [get, setGet] = useState<Resource>("ore");
  const rateOf = (r: Resource) => bankRate(state, me.id, r);
  const rate = rateOf(give);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="parchment">
        <DialogHeader>
          <DialogTitle>Trade with the Bank</DialogTitle>
          <DialogDescription>Trade at 4:1, or 3:1 / 2:1 if you own a settlement on a harbor.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase opacity-70 mb-1">Give {rate}</div>
            <div className="flex flex-col gap-1">
              {RESOURCES.map((r) => (
                <Button key={r} size="sm" variant={give === r ? "default" : "secondary"} disabled={me.resources[r] < rateOf(r)}
                  onClick={() => setGive(r)} className="justify-start gap-2">
                  <ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]} ({me.resources[r]}) · {rateOf(r)}:1
                </Button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70 mb-1">Receive 1</div>
            <div className="flex flex-col gap-1">
              {RESOURCES.map((r) => (
                <Button key={r} size="sm" variant={get === r ? "default" : "secondary"} disabled={r === give || state.bank[r] < 1}
                  onClick={() => setGet(r)} className="justify-start gap-2">
                  <ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]} <span className="opacity-60">(bank {state.bank[r]})</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={me.resources[give] < rate || give === get || state.bank[get] < 1}
            onClick={() => { apply((s: any) => bankTrade(s, give, get)); onClose(); }}>
            Confirm Trade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function YearOfPlentyDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (a: Resource, b: Resource) => void }) {
  const [a, setA] = useState<Resource>("wood");
  const [b, setB] = useState<Resource>("wood");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="parchment">
        <DialogHeader>
          <DialogTitle>Bounty</DialogTitle>
          <DialogDescription>Choose any 2 resources from the bank.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs uppercase opacity-70 mb-1">First</div>
            {RESOURCES.map((r) => (
              <Button key={r} size="sm" variant={a === r ? "default" : "secondary"} onClick={() => setA(r)} className="w-full mb-1 justify-start gap-2">
                <ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]}
              </Button>
            ))}
          </div>
          <div>
            <div className="text-xs uppercase opacity-70 mb-1">Second</div>
            {RESOURCES.map((r) => (
              <Button key={r} size="sm" variant={b === r ? "default" : "secondary"} onClick={() => setB(r)} className="w-full mb-1 justify-start gap-2">
                <ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onPick(a, b)}>Take</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MonopolyDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: Resource) => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="parchment">
        <DialogHeader>
          <DialogTitle>Royal Decree</DialogTitle>
          <DialogDescription>Name a resource — every player surrenders theirs to you.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {RESOURCES.map((r) => (
            <Button key={r} onClick={() => onPick(r)} className="gap-2"><ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]}</Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CountStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="secondary" className="h-6 w-6" disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus size={12}/></Button>
      <span className="w-5 text-center text-sm font-bold">{value}</span>
      <Button size="icon" variant="secondary" className="h-6 w-6" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={12}/></Button>
    </div>
  );
}

interface TradeCounter { aiId: string; aiName: string; give: Record<Resource, number>; get: Record<Resource, number>; note: string }
interface TradeResult { text: string; counter?: TradeCounter }

function PlayerTradeDialog({ open, onClose, me, state, apply, counterMode, initial, onTraded }: {
  open: boolean; onClose: () => void; me: any; state: any; apply: (m: (s: any) => void) => void;
  counterMode?: boolean;
  initial?: { target: string; give: Record<Resource, number>; get: Record<Resource, number> };
  onTraded?: () => void;
}) {
  const rivals = state.players.filter((p: any) => p.id !== me.id);
  const aiRivals = rivals.filter((p: any) => p.isAI);
  const hasHumanRivals = rivals.some((p: any) => !p.isAI);
  const [target, setTarget] = useState<string>("any");
  const [give, setGive] = useState<Record<Resource, number>>(emptyCounts());
  const [get, setGet] = useState<Record<Resource, number>>(emptyCounts());
  const [results, setResults] = useState<TradeResult[]>([]);

  useEffect(() => {
    if (!open) return;
    setTarget(initial?.target ?? (aiRivals.length > 0 ? "any" : rivals[0]?.id ?? "any"));
    setGive(initial?.give ?? emptyCounts());
    setGet(initial?.get ?? emptyCounts());
    setResults([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finishTrade = (aiName: string) => {
    setGive(emptyCounts()); setGet(emptyCounts());
    if (counterMode) { onTraded?.(); return; }
    setResults([{ text: `${aiName} accepted!` }]);
  };

  const acceptCounter = (c: TradeCounter) => {
    apply((s: any) => {
      if (safeTrade(s, me.id, c.aiId, c.give, c.get) && counterMode) s.pendingTrade = null;
    });
    finishTrade(c.aiName);
  };

  const close = () => { setGive(emptyCounts()); setGet(emptyCounts()); setResults([]); onClose(); };
  const setGiveOf = (r: Resource, n: number) => { setGive((g) => ({ ...g, [r]: n })); if (n > 0) setGet((g) => ({ ...g, [r]: 0 })); };
  const setGetOf = (r: Resource, n: number) => { setGet((g) => ({ ...g, [r]: n })); if (n > 0) setGive((g) => ({ ...g, [r]: 0 })); };
  const ready = countCards(give) > 0 && countCards(get) > 0;

  const propose = () => {
    const candidates = target === "any" ? aiRivals : rivals.filter((p: any) => p.id === target);
    const msgs: TradeResult[] = [];
    for (const c of candidates) {
      const err = validateTrade(state, me.id, c.id, give, get);
      if (err) { msgs.push({ text: `${c.name}: ${err}` }); continue; }
      if (!c.isAI) {
        // Another person on this screen: send them the offer. They answer after the device is passed over.
        apply((s: any) => {
          if (validateTrade(s, me.id, c.id, give, get) !== null) return;
          s.pendingTrade = { fromPlayerId: me.id, toPlayerId: c.id, offer: { ...give }, request: { ...get } };
          gameLog(s, { kind: "trade", playerId: me.id, text: `${me.name} offered ${c.name} a trade` });
        });
        setGive(emptyCounts()); setGet(emptyCounts());
        onTraded?.();
        onClose();
        return;
      }
      const verdict = evaluateAITrade(state, c.id, me.id, give, get);
      if (verdict.accept) {
        apply((s: any) => {
          if (safeTrade(s, me.id, c.id, give, get) && counterMode) s.pendingTrade = null;
        });
        finishTrade(c.name);
        return;
      }
      const counter = aiCounterOffer(state, c.id, me.id, give, get);
      msgs.push({
        text: `${c.name} declined: ${verdict.reason}.`,
        counter: counter ? { aiId: c.id, aiName: c.name, give: counter.receives, get: counter.gives, note: counter.note } : undefined,
      });
    }
    setResults(msgs);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="parchment">
        <DialogHeader>
          <DialogTitle>{counterMode ? "Make a counteroffer" : "Trade with Players"}</DialogTitle>
          <DialogDescription>
            {counterMode
              ? "Change the deal and send it back. Closing this window declines their offer."
              : "Offer cards to a rival lord. They accept only deals that suit them, and may counter."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          {aiRivals.length > 0 && (
            <Button size="sm" variant={target === "any" ? "default" : "secondary"} onClick={() => setTarget("any")}>{hasHumanRivals ? "Any AI" : "Anyone"}</Button>
          )}
          {rivals.map((p: any) => (
            <Button key={p.id} size="sm" variant={target === p.id ? "default" : "secondary"} onClick={() => setTarget(p.id)}
              style={{ borderLeft: `4px solid ${colorFromToken(p.color)}` }}>{p.name}</Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase opacity-70 mb-1">You give</div>
            <div className="flex flex-col gap-1">
              {RESOURCES.map((r) => (
                <div key={r} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-sm"><ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]} <span className="opacity-60">({me.resources[r]})</span></span>
                  <CountStepper value={give[r]} max={me.resources[r]} onChange={(n) => setGiveOf(r, n)} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase opacity-70 mb-1">You want</div>
            <div className="flex flex-col gap-1">
              {RESOURCES.map((r) => (
                <div key={r} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-sm"><ResourceChip kind={r} size={22}/> {RESOURCE_LABEL[r]}</span>
                  <CountStepper value={get[r]} max={9} onChange={(n) => setGetOf(r, n)} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {results.length > 0 && (
          <div className="rounded-md bg-black/10 px-3 py-2 text-sm space-y-2">
            {results.map((m, i) => (
              <div key={i}>
                <div>{m.text}</div>
                {m.counter && (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded bg-black/10 px-2 py-1">
                    <span>
                      <b>{m.counter.aiName}</b> counters ({m.counter.note}): you give <b>{describeCounts(m.counter.give)}</b>, you get <b>{describeCounts(m.counter.get)}</b>
                    </span>
                    <Button size="sm" onClick={() => acceptCounter(m.counter!)}>Accept</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={close}>Close</Button>
          <Button disabled={!ready} onClick={propose}>Propose Trade</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncomingTradeDialog({ me, state, apply, hidden, onCounter }: { me: any; state: any; apply: (m: (s: any) => void) => void; hidden?: boolean; onCounter?: () => void }) {
  const t = state.pendingTrade;
  const open = !!t && t.toPlayerId === me.id && state.phase !== "gameover" && !hidden;
  const from = t ? state.players.find((p: any) => p.id === t.fromPlayerId) : null;
  const canAccept = t ? validateTrade(state, t.fromPlayerId, me.id, t.offer, t.request) === null : false;

  const decline = () => apply((s: any) => {
    if (!s.pendingTrade) return;
    const f = s.players.find((p: any) => p.id === s.pendingTrade.fromPlayerId);
    gameLog(s, { kind: "trade", playerId: me.id, text: `${me.name} declined ${f?.name}'s offer` });
    s.pendingTrade = null;
  });
  const accept = () => apply((s: any) => {
    const pt = s.pendingTrade;
    if (!pt) return;
    safeTrade(s, pt.fromPlayerId, pt.toPlayerId, pt.offer, pt.request);
    s.pendingTrade = null;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && decline()}>
      <DialogContent className="parchment">
        <DialogHeader>
          <DialogTitle>{from?.name} proposes a trade</DialogTitle>
          <DialogDescription>
            {t && <>They give <b>{describeCounts(t.offer)}</b> and want <b>{describeCounts(t.request)}</b> from you.</>}
          </DialogDescription>
        </DialogHeader>
        {!canAccept && t && <div className="text-sm opacity-75">You don't have the cards they're asking for.</div>}
        <DialogFooter>
          <Button variant="secondary" onClick={decline}>Decline</Button>
          <Button variant="secondary" onClick={() => onCounter?.()}>Counter</Button>
          <Button disabled={!canAccept} onClick={accept}>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Colored dots showing what a purchase costs. A card you are still missing gets a red ring and red number. */
function CostDots({ cost, have }: { cost: Partial<Record<Resource, number>>; have: Record<Resource, number> }) {
  return (
    <span className="inline-flex items-center gap-2">
      {RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => {
        const ok = have[r] >= (cost[r] ?? 0);
        return (
          <span
            key={r}
            className={`inline-flex items-center gap-1 text-xs font-extrabold tabular-nums ${ok ? "" : "text-red-300"}`}
            title={`${cost[r]} ${RESOURCE_LABEL[r]}${ok ? "" : " (you need more)"}`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full ${ok ? "ring-1 ring-black/50" : "ring-2 ring-red-500"}`}
              style={{ background: RESOURCE_COLOR[r] }}
            />
            {cost[r]}
          </span>
        );
      })}
    </span>
  );
}

/** One row of the left-hand action column. On small screens only the icon shows. */
function ActionButton({
  icon, label, cost, have, active, disabled, hotkey, onClick,
}: {
  icon: ReactNode; label: string; cost?: Partial<Record<Resource, number>>; have?: Record<Resource, number>;
  active?: boolean; disabled?: boolean; hotkey?: string; onClick: () => void;
}) {
  // The tooltip lives on a wrapper: disabled buttons ignore the mouse, so a title on the button itself never shows.
  return (
    <span title={`${cost && have ? costTitle(label, cost, have) : label}${hotkey ? ` (key ${hotkey})` : ""}`} className="block">
      <Button
        type="button"
        variant={active ? "default" : "secondary"}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="h-10 w-full justify-start gap-2 px-2.5 disabled:opacity-80 disabled:saturate-50"
      >
        {hotkey && (
          <kbd className="hidden h-5 w-5 shrink-0 items-center justify-center rounded bg-black/25 text-[11px] font-bold md:inline-flex">{hotkey}</kbd>
        )}
        {icon}
        <span className="hidden font-semibold md:inline">{label}</span>
        {cost && have && (
          <span className="ml-auto hidden md:inline-flex">
            <CostDots cost={cost} have={have} />
          </span>
        )}
      </Button>
    </span>
  );
}

function costTitle(label: string, cost: Partial<Record<Resource, number>>, have: Record<Resource, number>): string {
  const missing = RESOURCES.filter((r) => (cost[r] ?? 0) > have[r]).map((r) => `${(cost[r] ?? 0) - have[r]} more ${RESOURCE_LABEL[r]}`);
  const price = RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => `${cost[r]} ${RESOURCE_LABEL[r]}`).join(" + ");
  return missing.length ? `${label}: ${price}. You need ${missing.join(", ")}.` : `${label}: ${price}`;
}
