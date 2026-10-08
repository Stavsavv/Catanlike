// The browser's side of online play: one WebSocket, automatic reconnecting, and the latest view of the room.
// Plain TypeScript with no React, so it can be tested with ordinary scripts.
import type { GameState, BoardMode } from "./types";
import type { Action, ActionResult } from "./actions";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed";

export interface RoomSnapshot {
  code: string;
  started: boolean;
  board: BoardMode;
  randomSeats: boolean;
  seats: { name: string; kind: "human" | "ai"; connected: boolean; playerId: string | null }[];
  you: number; // your seat number
}

export interface OnlineSnapshot {
  status: ConnectionStatus;
  room: RoomSnapshot | null;
  state: GameState | null;
  you: string | null;        // your player id once the game has started
  error: string | null;      // last problem worth showing
  closedReason: string | null;
}

interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface OnlineClientOptions {
  url: string;
  storage?: StorageLike | null;
  createSocket?: (url: string) => SocketLike;
  /** Waits between reconnect attempts (ms); the last value repeats. */
  backoff?: number[];
}

const SESSION_KEY = "isle-of-embers:online-session";
const OPEN = 1;

export class OnlineClient {
  private snap: OnlineSnapshot = { status: "idle", room: null, state: null, you: null, error: null, closedReason: null };
  private listeners = new Set<() => void>();
  private socket: SocketLike | null = null;
  private session: { code: string; token: string } | null = null;
  private firstMessage: object | null = null;   // sent as soon as the socket opens
  private pending = new Map<number, (r: ActionResult) => void>();
  private nextId = 1;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeq = -1;
  private intentionallyClosed = false;
  private readonly opts: OnlineClientOptions;
  private readonly backoff: number[];

  constructor(opts: OnlineClientOptions) {
    this.opts = opts;
    this.backoff = opts.backoff ?? [500, 1000, 2000, 4000, 8000];
  }

  // ----- React-friendly store -----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  private set(patch: Partial<OnlineSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ----- sessions -----
  static storedSession(storage: StorageLike | null | undefined): { code: string; token: string } | null {
    try {
      const raw = storage?.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return typeof s?.code === "string" && typeof s?.token === "string" ? s : null;
    } catch { return null; }
  }
  private saveSession() {
    try { if (this.session) this.opts.storage?.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch { /* ignore */ }
  }
  private clearSession() {
    this.session = null;
    try { this.opts.storage?.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  // ----- starting -----
  create(name: string, board: BoardMode) { this.begin({ t: "create", name, board }); }
  join(code: string, name: string) { this.begin({ t: "join", code, name }); }
  /** Come back to a room this browser was in before (after a refresh or a lost connection). */
  resume(): boolean {
    const s = OnlineClient.storedSession(this.opts.storage);
    if (!s) return false;
    this.session = s;
    this.begin({ t: "rejoin", code: s.code, token: s.token });
    return true;
  }

  private begin(first: object) {
    this.intentionallyClosed = false;
    this.attempt = 0;
    this.firstMessage = first;
    this.set({ status: "connecting", error: null, closedReason: null });
    this.connect();
  }

  private connect() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    const make = this.opts.createSocket ?? ((u: string) => new WebSocket(u) as unknown as SocketLike);
    let ws: SocketLike;
    try { ws = make(this.opts.url); } catch { this.onDisconnect(); return; }
    this.socket = ws;
    ws.onopen = () => {
      if (this.socket !== ws) return;
      if (this.firstMessage) ws.send(JSON.stringify(this.firstMessage));
    };
    ws.onmessage = (ev) => { if (this.socket === ws) this.onMessage(String(ev.data)); };
    ws.onclose = () => { if (this.socket === ws) this.onDisconnect(); };
    ws.onerror = () => { /* onclose follows */ };
  }

  private onDisconnect() {
    this.socket = null;
    this.pending.forEach((resolve) => resolve({ ok: false, error: "Connection lost" }));
    this.pending.clear();
    if (this.intentionallyClosed || this.snap.status === "closed") return;
    if (!this.session) {
      // never got into a room: just report it
      this.set({ status: "idle", error: this.snap.error ?? "Could not reach the game server" });
      return;
    }
    this.firstMessage = { t: "rejoin", code: this.session.code, token: this.session.token };
    this.set({ status: "reconnecting" });
    const wait = this.backoff[Math.min(this.attempt++, this.backoff.length - 1)];
    this.retryTimer = setTimeout(() => this.connect(), wait);
  }

  private onMessage(raw: string) {
    let m: any;
    try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case "welcome":
        this.session = { code: m.code, token: m.token };
        this.saveSession();
        this.attempt = 0;
        this.set({ status: "connected", error: null });
        break;
      case "room":
        this.set({ room: { code: m.code, started: m.started, board: m.board, randomSeats: !!m.randomSeats, seats: m.seats, you: m.you } });
        if (!m.started) { this.lastSeq = -1; this.set({ state: null }); }
        break;
      case "state":
        if (m.seq < this.lastSeq) break; // an older update that arrived late
        this.lastSeq = m.seq;
        this.set({ state: m.state, you: m.you });
        break;
      case "result": {
        const f = this.pending.get(m.id);
        if (f) { this.pending.delete(m.id); f(m.ok ? { ok: true, reply: m.reply } : { ok: false, error: m.error }); }
        break;
      }
      case "error":
        if (m.fatal) {
          this.clearSession();
          this.set({ status: "closed", closedReason: m.message, room: null, state: null });
          this.shutSocket();
        } else if (!this.session && !this.snap.room) {
          // The room refused us (unknown code, full, already started): back to the form with the reason.
          this.set({ status: "idle", error: m.message });
          this.shutSocket();
        } else {
          this.set({ error: m.message });
        }
        break;
      case "closed":
        this.clearSession();
        this.set({ status: "closed", closedReason: m.reason, room: null, state: null });
        this.shutSocket();
        break;
    }
  }

  // ----- talking to the room -----
  send(msg: object) {
    if (this.socket && this.socket.readyState === OPEN) this.socket.send(JSON.stringify(msg));
  }

  act(action: Action): Promise<ActionResult> {
    if (!this.socket || this.socket.readyState !== OPEN) return Promise.resolve({ ok: false, error: "Not connected" });
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.socket!.send(JSON.stringify({ t: "act", id, action }));
      setTimeout(() => { if (this.pending.delete(id)) resolve({ ok: false, error: "The server did not answer" }); }, 10_000);
    });
  }

  clearError() { if (this.snap.error) this.set({ error: null }); }

  /** Leave on purpose: tells the room, forgets the seat and does not reconnect. */
  leave() {
    this.send({ t: "leave" });
    this.clearSession();
    this.shutSocket();
    this.set({ status: "idle", room: null, state: null, you: null, error: null });
  }

  /** The page is going away: stop quietly but keep the seat so a refresh can rejoin. */
  dispose() {
    this.shutSocket();
    this.listeners.clear();
  }

  private shutSocket() {
    this.intentionallyClosed = true;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    const s = this.socket;
    this.socket = null;
    try { s?.close(); } catch { /* ignore */ }
  }
}
