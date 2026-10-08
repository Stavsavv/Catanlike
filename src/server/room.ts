// Game rooms for online play. Plain TypeScript with no Node-only imports, so the same code can run behind
// the Vite dev/preview server today and inside something like a Cloudflare Durable Object later.
import { isBoardMode, type GameState, type BoardMode } from "../game/types";
import { createInitialState, createPlayer, PLAYER_COLORS, currentPlayer } from "../game/state";
import { uniqueNamer, shuffled } from "../game/setup";
import { applyAction, type Action } from "../game/actions";
import { runAITurn, aiAutoDiscard } from "../game/ai";
import { viewFor } from "../game/view";

export interface Conn {
  send(data: string): void;
  close?(): void;
}

interface Seat {
  kind: "human" | "ai";
  name: string;
  token: string | null; // secret that lets a human come back to this seat
}

export interface RoomOptions {
  /** Pause used by the AI between moves. Tests replace it with an instant one. */
  delay?: (ms: number) => Promise<void>;
  log?: (msg: string, err?: unknown) => void;
}

const MAX_SEATS = 4;
const AI_NAMES = ["Aldric", "Brunhild", "Caelan", "Dagrun"];
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 20) : "";
  return s || fallback;
}

export class Room {
  readonly code: string;
  private seats: Seat[] = [];
  private board: BoardMode = "beginner";
  private randomSeats = false;
  private state: GameState | null = null;
  private playerIds: string[] = [];
  private conns = new Map<Conn, number>(); // connection -> seat index
  private version = 0;
  private pumping = false;
  private closed = false;
  lastActive = Date.now();
  /** Set by the manager so a closed room disappears from its list straight away. */
  onClosed: (() => void) | null = null;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly logger: (msg: string, err?: unknown) => void;
  private readonly proxy: GameState;

  constructor(code: string, opts: RoomOptions = {}) {
    this.code = code;
    this.delay = opts.delay ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.logger = opts.log ?? ((m, e) => console.error(m, e ?? ""));
    // The AI reads the game through this, so it always sees the latest state even though moves replace it.
    this.proxy = new Proxy({} as GameState, { get: (_t, prop) => (this.state as any)?.[prop] });
  }

  get started() { return this.state !== null; }
  get connectionCount() { return this.conns.size; }
  get isClosed() { return this.closed; }
  /** Test and debugging access to the real state. */
  peekState() { return this.state; }

  // ---------- joining ----------

  join(conn: Conn, rawName: unknown): { ok: true; token: string; seat: number } | { ok: false; error: string } {
    if (this.started) return { ok: false, error: "That game has already started" };
    if (this.seats.length >= MAX_SEATS) return { ok: false, error: "The room is full" };
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    let name = cleanName(rawName, `Player ${this.seats.length + 1}`);
    const base = name;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    const token = crypto.randomUUID();
    this.seats.push({ kind: "human", name, token });
    const seat = this.seats.length - 1;
    this.conns.set(conn, seat);
    this.touch();
    this.broadcast();
    return { ok: true, token, seat };
  }

  rejoin(conn: Conn, token: unknown): { ok: true; seat: number } | { ok: false; error: string } {
    const seat = this.seats.findIndex((s) => s.kind === "human" && s.token !== null && s.token === token);
    if (seat < 0) return { ok: false, error: "That seat is no longer yours" };
    this.conns.set(conn, seat);
    this.touch();
    this.broadcast();
    return { ok: true, seat };
  }

  disconnect(conn: Conn) {
    if (!this.conns.delete(conn)) return;
    this.touch();
    if (!this.closed) this.broadcast();
  }

  // ---------- messages from people in the room ----------

  handle(conn: Conn, msg: any) {
    const seat = this.conns.get(conn);
    if (seat === undefined) return;
    this.touch();
    const host = seat === 0;
    const err = (message: string) => conn.send(JSON.stringify({ t: "error", message }));

    switch (msg.t) {
      case "act": return this.act(conn, seat, msg);
      case "board":
        if (!host || this.started) return err("Only the host can change the island before the game");
        if (isBoardMode(msg.board)) { this.board = msg.board; this.broadcast(); }
        return;
      case "seating":
        if (!host || this.started) return err("Only the host can change the seating before the game");
        this.randomSeats = msg.random === true;
        this.broadcast();
        return;
      case "addAI": {
        if (!host || this.started) return err("Only the host can add AI players in the lobby");
        if (this.seats.length >= MAX_SEATS) return err("The room is full");
        const used = new Set(this.seats.map((s) => s.name.toLowerCase()));
        const name = AI_NAMES.find((n) => !used.has(n.toLowerCase())) ?? `AI ${this.seats.length}`;
        this.seats.push({ kind: "ai", name, token: null });
        this.broadcast();
        return;
      }
      case "removeSeat": {
        if (!host || this.started) return err("Only the host can remove players in the lobby");
        const i = msg.seat;
        if (!Number.isInteger(i) || i <= 0 || i >= this.seats.length) return err("Pick another seat");
        const gone = [...this.conns].filter(([, s]) => s === i).map(([c]) => c);
        this.seats.splice(i, 1);
        // seat numbers after the removed one shift down by one
        for (const [c, s] of [...this.conns]) {
          if (s === i) this.conns.delete(c);
          else if (s > i) this.conns.set(c, s - 1);
        }
        gone.forEach((c) => { c.send(JSON.stringify({ t: "closed", reason: "The host removed you from the room" })); c.close?.(); });
        this.broadcast();
        return;
      }
      case "start": {
        if (!host || this.started) return err("Only the host can start the game");
        if (this.seats.length < 2) return err("You need at least two players");
        this.startGame();
        return;
      }
      case "rematch": {
        if (!host || !this.state || this.state.phase !== "gameover") return err("A rematch is only possible after the game");
        this.state = null;
        this.playerIds = [];
        this.version++;
        this.broadcast();
        return;
      }
      case "takeover": {
        if (!host || !this.state) return err("Only the host can do that during a game");
        const i = msg.seat;
        const s = Number.isInteger(i) ? this.seats[i] : undefined;
        if (!s || s.kind !== "human" || i === 0) return err("Pick a player who has left");
        if ([...this.conns.values()].includes(i)) return err("That player is still connected");
        s.kind = "ai";
        s.token = null;
        const p = this.state.players.find((x) => x.id === this.playerIds[i]);
        if (p) p.isAI = true;
        this.version++;
        this.broadcast();
        void this.pump();
        return;
      }
      case "leave": {
        if (!this.started && host) { this.close("The host closed the room"); return; }
        if (!this.started) {
          this.conns.delete(conn);
          this.seats.splice(seat, 1);
          for (const [c, s] of [...this.conns]) if (s > seat) this.conns.set(c, s - 1);
          conn.send(JSON.stringify({ t: "closed", reason: "You left the room" }));
          this.broadcast();
          return;
        }
        this.conns.delete(conn); // in a running game, leaving just disconnects: the seat stays reserved
        conn.send(JSON.stringify({ t: "closed", reason: "You left the game" }));
        this.broadcast();
        return;
      }
      default:
        return err("Unknown message");
    }
  }

  private act(conn: Conn, seat: number, msg: any) {
    const id = msg.id;
    const reply = (body: object) => conn.send(JSON.stringify({ t: "result", id, ...body }));
    if (!this.state) return reply({ ok: false, error: "The game has not started" });
    const playerId = this.playerIds[seat];
    const next = structuredClone(this.state);
    const result = applyAction(next, playerId, msg.action as Action);
    if (!result.ok) return reply(result);
    this.state = next;
    this.version++;
    reply(result);
    this.broadcast();
    void this.pump();
  }

  // ---------- starting and running the game ----------

  private startGame() {
    const unique = uniqueNamer();
    this.playerIds = this.seats.map((s, i) => (s.kind === "human" ? `p${i}` : `ai-${i}`));
    // Turn order: the lobby order, or shuffled. Colors follow the turn order.
    const order = this.seats.map((_, i) => i);
    const turnOrder = this.randomSeats ? shuffled(order) : order;
    const players = turnOrder.map((seat, pos) => createPlayer(this.playerIds[seat], unique(this.seats[seat].name), PLAYER_COLORS[pos], this.seats[seat].kind === "ai"));
    this.state = createInitialState(players, this.board, this.randomSeats);
    this.version++;
    this.broadcast();
    void this.pump();
  }

  private mutate(fn: (s: GameState) => void) {
    if (!this.state) return;
    try {
      fn(this.state);
    } catch (e) {
      this.logger("AI move failed", e);
    }
    this.version++;
    this.broadcast();
  }

  /** Let AI players act whenever it is their turn, and discard for them after a 7. */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.state && this.state.phase !== "gameover" && !this.closed) {
        const s = this.state;
        const aiDiscarder = s.phase === "discard" ? s.players.find((p) => p.isAI && s.pendingDiscards.includes(p.id)) : undefined;
        if (aiDiscarder) {
          await this.delay(350);
          this.mutate((st) => aiAutoDiscard(st, aiDiscarder.id));
          continue;
        }
        if (!currentPlayer(s).isAI) break;
        const before = this.version;
        await runAITurn(this.proxy, (m) => this.mutate(m), this.delay);
        if (this.version === before) break; // nothing to do: the AI is waiting for a person
      }
    } catch (e) {
      this.logger("AI loop failed", e);
    } finally {
      this.pumping = false;
    }
  }

  // ---------- sending ----------

  private seatInfo() {
    const connected = new Set(this.conns.values());
    return this.seats.map((s, i) => ({
      name: s.name,
      kind: s.kind,
      connected: s.kind === "ai" || connected.has(i),
      playerId: this.playerIds[i] ?? null,
    }));
  }

  private broadcast() {
    if (this.closed) return;
    const seats = this.seatInfo();
    for (const [conn, seat] of this.conns) {
      conn.send(JSON.stringify({ t: "room", code: this.code, started: this.started, board: this.board, randomSeats: this.randomSeats, seats, you: seat }));
      if (this.state) {
        conn.send(JSON.stringify({ t: "state", seq: this.version, you: this.playerIds[seat], state: viewFor(this.state, this.playerIds[seat]) }));
      }
    }
  }

  /** Same messages a client gets after joining, for one connection that just arrived. */
  sendSnapshot(conn: Conn) {
    const seat = this.conns.get(conn);
    if (seat === undefined) return;
    conn.send(JSON.stringify({ t: "room", code: this.code, started: this.started, board: this.board, randomSeats: this.randomSeats, seats: this.seatInfo(), you: seat }));
    if (this.state) {
      conn.send(JSON.stringify({ t: "state", seq: this.version, you: this.playerIds[seat], state: viewFor(this.state, this.playerIds[seat]) }));
    }
  }

  close(reason: string) {
    for (const [conn] of this.conns) {
      conn.send(JSON.stringify({ t: "closed", reason }));
      conn.close?.();
    }
    this.conns.clear();
    this.closed = true;
    this.onClosed?.();
  }

  private touch() { this.lastActive = Date.now(); }
}

/** Finds the room for each connection and handles the messages that come before a room is chosen. */
export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private where = new Map<Conn, Room>();
  private readonly opts: RoomOptions;
  private readonly maxRooms: number;

  constructor(opts: RoomOptions & { maxRooms?: number } = {}) {
    this.opts = opts;
    this.maxRooms = opts.maxRooms ?? 200;
  }

  onMessage(conn: Conn, raw: string) {
    const send = (o: object) => conn.send(JSON.stringify(o));
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return send({ t: "error", message: "Bad message" }); }
    if (typeof msg !== "object" || msg === null || typeof msg.t !== "string") return send({ t: "error", message: "Bad message" });

    const room = this.where.get(conn);
    if (room && !room.isClosed) return room.handle(conn, msg);
    if (room) this.where.delete(conn);

    if (msg.t === "create") {
      if (this.rooms.size >= this.maxRooms) return send({ t: "error", message: "The server is busy, try again later" });
      let code = randomCode();
      while (this.rooms.has(code)) code = randomCode();
      const r = new Room(code, this.opts);
      r.onClosed = () => { if (this.rooms.get(code) === r) this.rooms.delete(code); };
      this.rooms.set(code, r);
      const joined = r.join(conn, msg.name);
      if (!joined.ok) return send({ t: "error", message: joined.error });
      if (isBoardMode(msg.board)) r.handle(conn, { t: "board", board: msg.board });
      this.where.set(conn, r);
      send({ t: "welcome", code, token: joined.token, seat: joined.seat });
      return;
    }
    if (msg.t === "join" || msg.t === "rejoin") {
      const code = typeof msg.code === "string" ? msg.code.trim().toUpperCase() : "";
      const r = this.rooms.get(code);
      if (!r || r.isClosed) {
        // Rejoining a room that is gone (closed, expired, server restarted) is final: the page should forget it.
        return send(msg.t === "rejoin"
          ? { t: "error", message: "That game is no longer running.", fatal: true }
          : { t: "error", message: "No room with that code" });
      }
      if (msg.t === "join") {
        const joined = r.join(conn, msg.name);
        if (!joined.ok) return send({ t: "error", message: joined.error });
        this.where.set(conn, r);
        send({ t: "welcome", code, token: joined.token, seat: joined.seat });
        return;
      }
      const back = r.rejoin(conn, msg.token);
      if (!back.ok) return send({ t: "error", message: back.error, fatal: true });
      this.where.set(conn, r);
      send({ t: "welcome", code, token: msg.token, seat: back.seat });
      r.sendSnapshot(conn);
      return;
    }
    send({ t: "error", message: "Join or create a room first" });
  }

  onClose(conn: Conn) {
    const room = this.where.get(conn);
    this.where.delete(conn);
    room?.disconnect(conn);
  }

  /** Forget rooms nobody has touched for a while. */
  sweep(now = Date.now(), maxIdleMs = 30 * 60 * 1000) {
    for (const [code, room] of [...this.rooms]) {
      if (room.isClosed || (room.connectionCount === 0 && now - room.lastActive > maxIdleMs)) {
        room.close("This room has expired");
        this.rooms.delete(code);
      }
    }
  }
}
