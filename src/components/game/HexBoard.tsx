import { useRef, useState, useEffect } from "react";
import type { GameState, Vertex, Edge, Hex, Terrain, Resource } from "@/game/types";
import { hexCornersPath, HEX_SIZE, oceanHexCenters } from "@/game/board";
import { RESOURCE_COLOR, RESOURCE_LABEL } from "./ResourceChip";
import { getPlayerColor } from "@/game/colors";
import { BoardDice } from "./Dice";
import { useDisplay } from "./DisplaySettings";
import { shapePath } from "@/game/shapes";
import { startPinch, updatePinch, isDoubleTap, type PinchStart, type Pt } from "@/game/gestures";
import forestImg from "@/assets/hex-forest.jpg";
import clayImg from "@/assets/hex-clay.jpg";
import fieldsImg from "@/assets/hex-fields.jpg";
import pastureImg from "@/assets/hex-pasture.jpg";
import mountainImg from "@/assets/hex-mountain.jpg";
import desertImg from "@/assets/hex-desert.jpg";
import oceanImg from "@/assets/hex-ocean.jpg";

const TERRAIN_IMG: Record<Terrain, string> = {
  wood: forestImg,
  brick: clayImg,
  grain: fieldsImg,
  wool: pastureImg,
  ore: mountainImg,
  desert: desertImg,
};

const TERRAIN_LABEL: Record<Terrain, string> = {
  wood: "Forest",
  brick: "Hills",
  grain: "Fields",
  wool: "Pasture",
  ore: "Mountains",
  desert: "Desert",
};

const TERRAIN_RESOURCE: Record<Terrain, string> = {
  wood: "Wood",
  brick: "Brick",
  grain: "Grain",
  wool: "Wool",
  ore: "Ore",
  desert: "No resource produced",
};

const RESOURCE_SHORT: Record<Resource, string> = {
  wood: "wood",
  brick: "brick",
  grain: "grain",
  wool: "wool",
  ore: "ore",
};

const PIPS_FOR: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

interface PreviewBuilding {
  vertexId: number;
  color: string;
  kind: "settlement" | "city";
}
interface PreviewRoad {
  edgeId: number;
  color: string;
}

interface Props {
  state: GameState;
  validVertices: Set<number>;
  validEdges: Set<number>;
  validHexes: Set<number>;
  onVertex?: (v: Vertex) => void;
  onEdge?: (e: Edge) => void;
  onHex?: (h: Hex) => void;
  highlightVertex?: number | null;
  hideTerrain?: boolean;
  viewerId?: string;
  previewBuilding?: PreviewBuilding | null;
  previewRoad?: PreviewRoad | null;
  /** Color used to draw valid placement indicators (active player color). */
  indicatorColor?: string;
}

interface FloatingGain {
  id: number;
  vertexId: number;
  resource: Resource;
  amount: number;
  color: string;
}

export function HexBoard({
  state, validVertices, validEdges, validHexes, onVertex, onEdge, onHex, highlightVertex,
  hideTerrain, viewerId, previewBuilding, previewRoad, indicatorColor,
}: Props) {
  const xs = state.vertices.map((v) => v.x);
  const ys = state.vertices.map((v) => v.y);
  const minX = Math.min(...xs) - HEX_SIZE * 1.8;
  const maxX = Math.max(...xs) + HEX_SIZE * 1.8;
  const minY = Math.min(...ys) - HEX_SIZE * 1.8;
  const maxY = Math.max(...ys) + HEX_SIZE * 1.8;
  const w = maxX - minX;
  const h = maxY - minY;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1); // user zoom on top of the automatic fit below
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Scale the island so land + harbors fill the free space (leaving room for the hand and action bars below).
  const BOTTOM_UI = 150;
  const LEFT_UI = box.w >= 768 ? 276 : 56; // the build/trade button column on the left
  const focusW = w - HEX_SIZE * 1.6;
  const focusH = h - HEX_SIZE * 2.0;
  const fit = box.w > 0
    ? Math.min(1.9, Math.max(0.45, Math.min((box.w - LEFT_UI) / focusW, (box.h - BOTTOM_UI) / focusH) * 0.97))
    : 1;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  // Tooltip state (screen coords relative to container)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; hex: Hex } | null>(null);

  // Roll FX: detect dice changes, glow matching hexes and float resource gains
  const [glowRoll, setGlowRoll] = useState<number | null>(null);
  const [floatGains, setFloatGains] = useState<FloatingGain[]>([]);
  const lastDiceRef = useRef<string>("");
  // Total rolls so far: goes up by exactly one per roll and survives the state being cloned on every move.
  const rollCount = state.stats.rolls.reduce((sum, c) => sum + c, 0);
  useEffect(() => {
    if (!state.dice) return;
    const key = String(rollCount); // not the phase: playing a Knight later in the turn must not replay the glow
    if (key === lastDiceRef.current) return;
    lastDiceRef.current = key;
    if (hideTerrain) return;
    const sum = state.dice[0] + state.dice[1];
    if (sum === 7) return;
    setGlowRoll(sum);
    // Compute per-vertex gains
    const gains: FloatingGain[] = [];
    let idCounter = Date.now();
    state.hexes.forEach((hex) => {
      if (hex.number !== sum) return;
      if (hex.id === state.robberHexId) return;
      if (hex.terrain === "desert") return;
      const res = hex.terrain as Resource;
      hex.vertexIds.forEach((vid) => {
        const v = state.vertices[vid];
        if (!v.building) return;
        const amt = v.building.kind === "city" ? 2 : 1;
        gains.push({
          id: idCounter++,
          vertexId: vid,
          resource: res,
          amount: amt,
          color: getPlayerColor(state, v.building.playerId),
        });
      });
    });
    setFloatGains(gains);
    const t1 = setTimeout(() => setGlowRoll(null), 1500);
    const t2 = setTimeout(() => setFloatGains([]), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [rollCount, hideTerrain]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(2.4, Math.max(0.6, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Touch: one finger pans, two fingers pinch to zoom (and pan), a double tap resets the view.
  const pointers = useRef(new Map<number, Pt>());
  const pointerList = (): Pt[] => {
    const list: Pt[] = [];
    pointers.current.forEach((p) => list.push(p));
    return list;
  };
  const pinchRef = useRef<PinchStart | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const firstTwo = (): [Pt, Pt] | null => {
    const list = pointerList();
    return list.length >= 2 ? [list[0], list[1]] : null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const two = firstTwo();
    if (two) {
      // A second finger arrived: switch from panning to pinching.
      dragRef.current = null;
      pinchRef.current = startPinch(two[0], two[1], zoom, pan);
      return;
    }
    if ((e.target as Element).closest("[data-interactive='true']")) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const two = firstTwo();
    if (pinchRef.current && two) {
      const next = updatePinch(pinchRef.current, two[0], two[1]);
      setZoom(next.zoom);
      setPan(next.pan);
      return;
    }
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
    setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasDrag = dragRef.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 1) {
      // One finger is left after a pinch: carry on panning from where it is, without a jump.
      const rest = pointerList()[0];
      dragRef.current = { x: rest.x, y: rest.y, px: pan.x, py: pan.y, moved: true };
      return;
    }
    dragRef.current = null;
    // Double tap on empty board (touch only) resets zoom and position.
    if (e.pointerType === "touch" && wasDrag && !wasDrag.moved && !(e.target as Element).closest("[data-interactive='true']")) {
      const now = { t: Date.now(), x: e.clientX, y: e.clientY };
      if (isDoubleTap(lastTapRef.current, now)) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        lastTapRef.current = null;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const showHexTooltip = (e: React.MouseEvent, hex: Hex) => {
    if (hideTerrain) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, hex });
  };

  const { settings: display } = useDisplay();
  const hc = display.highContrast;
  const seatOf = (playerId: string) => state.players.findIndex((p) => p.id === playerId);

  const settlementPath = (x: number, y: number) =>
    `M${x - 8},${y + 6} L${x - 8},${y - 2} L${x},${y - 10} L${x + 8},${y - 2} L${x + 8},${y + 6} Z`;
  const cityPath = (x: number, y: number) =>
    `M${x - 11},${y + 7} L${x - 11},${y - 3} L${x - 4},${y - 9} L${x + 3},${y - 3} L${x + 3},${y - 7} L${x + 11},${y - 7} L${x + 11},${y + 7} Z`;

  const idc = indicatorColor || "#F4D35E";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        backgroundImage: `url(${oceanImg})`,
        backgroundSize: "400px 400px",
        backgroundColor: "oklch(0.34 0.07 220)",
      }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(calc(-50% + ${pan.x + LEFT_UI / 2}px), calc(-50% + ${pan.y - BOTTOM_UI / 2}px)) scale(${fit * zoom})`, transformOrigin: "center" }}
      >
        <svg
          width={w}
          height={h}
          viewBox={`${minX} ${minY} ${w} ${h}`}
          style={{ display: "block", filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.5))" }}
        >
          <defs>
            <clipPath id="hexClip" clipPathUnits="userSpaceOnUse">
              <path d={hexCornersPath(0, 0, HEX_SIZE)} />
            </clipPath>
            <filter id="hexShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.5" />
            </filter>
            <pattern id="fogPattern" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(30)">
              <rect width="12" height="12" fill="oklch(0.78 0.04 70)" />
              <path d="M0 0 L12 12 M-3 9 L3 15 M9 -3 L15 3" stroke="oklch(0.62 0.05 60)" strokeWidth="1" opacity="0.45" />
            </pattern>
          </defs>

          {/* Ocean frame: one ring of sea hexes around the island */}
          {oceanHexCenters().map(([ox, oy], i) => (
            <g key={`ocean-${i}`} className="pointer-events-none">
              <g transform={`translate(${ox}, ${oy})`} clipPath="url(#hexClip)">
                <image
                  href={oceanImg}
                  x={-HEX_SIZE} y={-HEX_SIZE}
                  width={HEX_SIZE * 2} height={HEX_SIZE * 2}
                  preserveAspectRatio="xMidYMid slice"
                />
              </g>
              <path
                d={hexCornersPath(ox, oy, HEX_SIZE)}
                fill="oklch(0.42 0.09 225 / 0.35)"
                stroke="oklch(0.78 0.06 215 / 0.35)"
                strokeWidth={1.5}
              />
            </g>
          ))}

          {/* Hex tiles */}
          {state.hexes.map((hex) => {
            const isValid = validHexes.has(hex.id);
            const isGlowing = !hideTerrain && glowRoll !== null && hex.number === glowRoll && hex.id !== state.robberHexId && hex.terrain !== "desert";
            return (
              <g key={hex.id}>
                <g transform={`translate(${hex.cx}, ${hex.cy})`} clipPath="url(#hexClip)">
                  {hideTerrain ? (
                    <rect x={-HEX_SIZE} y={-HEX_SIZE} width={HEX_SIZE * 2} height={HEX_SIZE * 2} fill="url(#fogPattern)" />
                  ) : (
                    <image
                      href={TERRAIN_IMG[hex.terrain]}
                      x={-HEX_SIZE} y={-HEX_SIZE}
                      width={HEX_SIZE * 2} height={HEX_SIZE * 2}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  )}
                </g>
                <path
                  d={hexCornersPath(hex.cx, hex.cy, HEX_SIZE)}
                  fill="transparent"
                  stroke={hc ? "#000" : "oklch(0.20 0.04 220 / 0.6)"}
                  strokeWidth={hc ? 2.5 : 1.5}
                  data-interactive={isValid || !hideTerrain ? "true" : undefined}
                  onClick={() => isValid && onHex?.(hex)}
                  onMouseEnter={(e) => showHexTooltip(e, hex)}
                  onMouseMove={(e) => showHexTooltip(e, hex)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: isValid ? "crosshair" : "default" }}
                />

                {isGlowing && (
                  <path
                    d={hexCornersPath(hex.cx, hex.cy, HEX_SIZE - 2)}
                    fill="none"
                    stroke="#FFE082"
                    strokeWidth={5}
                    className="pointer-events-none hex-glow"
                    style={{ filter: "drop-shadow(0 0 12px #FFE082)" }}
                  />
                )}
                {isValid && (
                  <path
                    d={hexCornersPath(hex.cx, hex.cy, HEX_SIZE - 3)}
                    fill="none"
                    stroke={idc}
                    strokeWidth={3}
                    className="pointer-events-none"
                    style={{ filter: `drop-shadow(0 0 6px ${idc})` }}
                  />
                )}
                {!hideTerrain && hex.number && (
                  <g className="pointer-events-none">
                    <circle cx={hex.cx} cy={hex.cy} r={hc ? 20 : 18} fill={hc ? "#fff" : "oklch(0.96 0.03 80)"} stroke={hc ? "#000" : "oklch(0.25 0.04 50)"} strokeWidth={hc ? 2.5 : 1.5} />
                    <text
                      x={hex.cx} y={hex.cy + 1}
                      textAnchor="middle" dominantBaseline="central"
                      fontWeight={hc ? "800" : "700"}
                      fontSize={(hex.number === 6 || hex.number === 8 ? 18 : 16) + (hc ? 2 : 0)}
                      fill={hex.number === 6 || hex.number === 8 ? (hc ? "#b00020" : "oklch(0.45 0.20 25)") : (hc ? "#000" : "oklch(0.22 0.04 50)")}
                      fontFamily="var(--font-display)"
                    >{hex.number}</text>
                    <g>
                      {Array.from({ length: PIPS_FOR[hex.number] || 0 }).map((_, i, arr) => (
                        <circle
                          key={i}
                          cx={hex.cx - ((arr.length - 1) * (hc ? 4 : 3.5)) / 2 + i * (hc ? 4 : 3.5)}
                          cy={hex.cy + (hc ? 13.5 : 12)}
                          r={hc ? 1.9 : 1.5}
                          fill={hc ? "#000" : "oklch(0.12 0.03 50)"}
                        />
                      ))}
                    </g>
                  </g>
                )}
                {!hideTerrain && display.terrainLabels && (
                  <text
                    x={hex.cx} y={hex.cy + (hex.number ? 34 : 0)}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={9.5} fontWeight={800} letterSpacing={0.6}
                    fill="#fff" stroke="oklch(0.15 0.03 50)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
                    className="pointer-events-none"
                    style={{ textTransform: "uppercase" }}
                  >
                    {hex.terrain === "desert" ? "Desert" : RESOURCE_LABEL[hex.terrain as Resource]}
                  </text>
                )}
                {!hideTerrain && hex.id === state.robberHexId && (
                  <g className="pointer-events-none">
                    <circle cx={hex.cx + 24} cy={hex.cy - 24} r={11} fill="oklch(0.15 0 0)" stroke="oklch(0.96 0.03 80)" strokeWidth={1.5} />
                    <text x={hex.cx + 24} y={hex.cy - 23} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="oklch(0.96 0.03 80)">☠</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Harbors: piers from the two coastal corners to a badge in the sea */}
          {state.harbors.map((hb) => {
            const a = state.vertices[hb.vertexIds[0]];
            const b = state.vertices[hb.vertexIds[1]];
            const ring = hb.type === "any" ? "oklch(0.70 0.05 80)" : RESOURCE_COLOR[hb.type];
            return (
              <g key={`harbor-${hb.id}`} className="pointer-events-none">
                {[a, b].map((v, i) => (
                  <g key={i}>
                    <line x1={v.x} y1={v.y} x2={hb.x} y2={hb.y} stroke="oklch(0.22 0.04 50)" strokeWidth={6} strokeLinecap="round" />
                    <line x1={v.x} y1={v.y} x2={hb.x} y2={hb.y} stroke="oklch(0.62 0.09 65)" strokeWidth={3.5} strokeLinecap="round" />
                    <circle cx={v.x} cy={v.y} r={4.5} fill={ring} stroke="oklch(0.22 0.04 50)" strokeWidth={1.5} />
                  </g>
                ))}
                <circle cx={hb.x} cy={hb.y} r={20} fill="oklch(0.95 0.03 85)" stroke={ring} strokeWidth={4.5} />
                <circle cx={hb.x} cy={hb.y} r={20} fill="none" stroke="oklch(0.22 0.04 50)" strokeWidth={1} />
                <text x={hb.x} y={hb.y - 3} textAnchor="middle" dominantBaseline="central"
                  fontSize={12} fontWeight={800} fill="oklch(0.22 0.04 50)" fontFamily="var(--font-display)">
                  {hb.type === "any" ? "3:1" : "2:1"}
                </text>
                <text x={hb.x} y={hb.y + 9} textAnchor="middle" dominantBaseline="central"
                  fontSize={7.5} fontWeight={700} fill="oklch(0.30 0.05 50)">
                  {hb.type === "any" ? "Any" : RESOURCE_LABEL[hb.type]}
                </text>
              </g>
            );
          })}

          {/* Edges (roads) */}
          {state.edges.map((e) => {
            const isValid = validEdges.has(e.id);
            const road = e.road;
            const showRoad = road && (!hideTerrain || (viewerId && road.playerId === viewerId));
            if (!showRoad && !isValid) return null;
            const stroke = showRoad
              ? getPlayerColor(state, road!.playerId)
              : idc;
            return (
              <g key={e.id}>
                {isValid && !showRoad && (
                  <line
                    x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                    stroke={idc} strokeWidth={10} strokeLinecap="round"
                    className="pointer-events-none edge-glow"
                    style={{ filter: `drop-shadow(0 0 6px ${idc})`, opacity: 0.5 }}
                  />
                )}
                {showRoad && hc && (
                  <line
                    x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                    stroke="#000" strokeWidth={15} strokeLinecap="round"
                    className="pointer-events-none"
                  />
                )}
                {/* White outline behind road */}
                <line
                  x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="#fff"
                  strokeWidth={showRoad ? 11 : 7}
                  strokeLinecap="round"
                  className="pointer-events-none"
                  opacity={0.9}
                />
                <line
                  x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke={stroke}
                  strokeWidth={showRoad ? 8 : 4}
                  strokeLinecap="round"
                  data-interactive={isValid ? "true" : undefined}
                  onClick={() => isValid && onEdge?.(e)}
                  style={{ cursor: isValid ? "pointer" : "default", filter: showRoad ? "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" : undefined }}
                />
                {showRoad && display.playerShapes && (
                  <path
                    d={shapePath(seatOf(road!.playerId), (e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, 3.4)}
                    fill="#fff" stroke="oklch(0.2 0.03 50)" strokeWidth={1}
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          })}
          {state.edges.map((e) => {
            if (!validEdges.has(e.id)) return null;
            return (
              <line key={`hit-${e.id}`}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke="transparent" strokeWidth={16}
                data-interactive="true"
                onClick={() => onEdge?.(e)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* Preview road */}
          {previewRoad && (() => {
            const e = state.edges[previewRoad.edgeId];
            if (!e) return null;
            return (
              <g className="pointer-events-none">
                <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke={previewRoad.color} strokeWidth={9} strokeLinecap="round"
                  opacity={0.7} strokeDasharray="6 4">
                  <animate attributeName="stroke-dashoffset" from="0" to="10" dur="0.8s" repeatCount="indefinite" />
                </line>
              </g>
            );
          })()}

          {/* Vertices */}
          {state.vertices.map((v) => {
            const isValid = validVertices.has(v.id);
            const b = v.building;
            const highlighted = highlightVertex === v.id;
            const showBuilding = b && (!hideTerrain || (viewerId && b.playerId === viewerId));
            if (!showBuilding && !isValid && !highlighted) return null;
            const color = showBuilding ? getPlayerColor(state, b!.playerId) : idc;
            return (
              <g key={v.id}>
                {isValid && (
                  <>
                    <circle cx={v.x} cy={v.y} r={14}
                      fill={idc} opacity={0.25}
                      className="pointer-events-none valid-pulse" />
                    <circle cx={v.x} cy={v.y} r={8}
                      fill={idc}
                      stroke="oklch(1 0 0 / 0.85)"
                      strokeWidth={2}
                      data-interactive="true"
                      onClick={() => onVertex?.(v)}
                      style={{ cursor: "pointer", filter: `drop-shadow(0 0 6px ${idc})` }}
                    />
                  </>
                )}
                {showBuilding && (
                  <>
                    {hc && (
                      <path
                        d={b!.kind === "settlement" ? settlementPath(v.x, v.y) : cityPath(v.x, v.y)}
                        fill="#fff" stroke="#fff" strokeWidth={5} strokeLinejoin="round"
                        className="pointer-events-none"
                      />
                    )}
                    <path
                      d={b!.kind === "settlement" ? settlementPath(v.x, v.y) : cityPath(v.x, v.y)}
                      fill={color}
                      stroke={hc ? "#000" : "#fff"}
                      strokeWidth={hc ? 2 : 1.5}
                      className="pointer-events-none"
                      style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))" }}
                    />
                    {display.playerShapes && (
                      <path
                        d={shapePath(seatOf(b!.playerId), b!.kind === "city" ? v.x - 3.5 : v.x, v.y + 2.5, 3.2)}
                        fill="#fff" stroke="oklch(0.2 0.03 50)" strokeWidth={1}
                        className="pointer-events-none"
                      />
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Preview building */}
          {previewBuilding && (() => {
            const v = state.vertices[previewBuilding.vertexId];
            if (!v) return null;
            const d = previewBuilding.kind === "city" ? cityPath(v.x, v.y) : settlementPath(v.x, v.y);
            return (
              <g className="pointer-events-none">
                <circle cx={v.x} cy={v.y} r={16} fill={previewBuilding.color} opacity={0.18}>
                  <animate attributeName="r" values="14;18;14" dur="1.2s" repeatCount="indefinite" />
                </circle>
                <path d={d} fill={previewBuilding.color} opacity={0.75}
                  stroke="#fff" strokeWidth={1.5} strokeDasharray="3 2" />
              </g>
            );
          })()}
        </svg>

        <BoardDice
          values={state.dice}
          animateKey={rollCount}
          width={w}
          height={h}
        />

        {/* Floating resource gains (positioned in SVG-coordinate overlay) */}
        {floatGains.length > 0 && (
          <svg
            width={w} height={h} viewBox={`${minX} ${minY} ${w} ${h}`}
            className="absolute inset-0 pointer-events-none"
            style={{ display: "block" }}
          >
            {floatGains.map((g) => {
              const v = state.vertices[g.vertexId];
              if (!v) return null;
              return (
                <g key={g.id} className="float-gain">
                  <rect
                    x={v.x - 22} y={v.y - 26} width={44} height={16} rx={8}
                    fill="rgba(0,0,0,0.75)" stroke={g.color} strokeWidth={1.5}
                  />
                  <text
                    x={v.x} y={v.y - 14}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={10} fontWeight={700} fill="#fff"
                  >
                    +{g.amount} {RESOURCE_SHORT[g.resource]}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Hex tooltip */}
      {tooltip && !hideTerrain && (
        <div
          className="pointer-events-none absolute z-20 rounded-md px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            background: "rgba(15, 18, 22, 0.92)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.12)",
            minWidth: 120,
          }}
        >
          <div className="font-semibold">{TERRAIN_LABEL[tooltip.hex.terrain]}</div>
          <div className="opacity-80">
            {tooltip.hex.terrain === "desert"
              ? "No resource produced"
              : <>Produces <span style={{ color: "#FFD27A" }}>{TERRAIN_RESOURCE[tooltip.hex.terrain]}</span></>}
          </div>
          <div className="opacity-70">
            {tooltip.hex.number ? `Roll: ${tooltip.hex.number}` : "Roll: —"}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button onClick={() => setZoom((z) => Math.min(2.4, z * 1.15))} aria-label="Zoom in" className="parchment hidden h-8 w-8 rounded text-lg font-bold sm:block">+</button>
        <button onClick={() => setZoom((z) => Math.max(0.6, z * 0.87))} aria-label="Zoom out" className="parchment hidden h-8 w-8 rounded text-xs sm:block">−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset view" title="Reset view (double-tap the board on a touch screen)" className="parchment h-8 w-8 rounded text-xs">⊙</button>
      </div>

      {hideTerrain && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 parchment rounded-full px-3 py-1 text-xs uppercase tracking-widest font-bold flex items-center gap-2">
          <span>🌫</span> The lands are shrouded — choose blindly
        </div>
      )}
    </div>
  );
}
