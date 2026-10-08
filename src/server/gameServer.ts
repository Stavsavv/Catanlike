// Connects the rooms to real WebSockets. It attaches to an existing HTTP server (Vite's dev or preview
// server), so the game page and the game server share one address and one port.
import { WebSocketServer, type WebSocket } from "ws";
import { RoomManager, type Conn, type RoomOptions } from "./room";

/** The little we need from Node's http.Server (kept structural so no Node typings are required here). */
interface UpgradeServer {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface GameServerOptions extends RoomOptions {
  path?: string;
  maxRooms?: number;
}

export function attachGameServer(httpServer: UpgradeServer, options: GameServerOptions = {}) {
  const path = options.path ?? "/game-ws";
  const manager = new RoomManager(options);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  httpServer.on("upgrade", (req: { url?: string }, socket: unknown, head: unknown) => {
    let pathname = "";
    try { pathname = new URL(req.url ?? "", "http://localhost").pathname; } catch { return; }
    if (pathname !== path) return; // leave every other upgrade (Vite's hot reload) alone
    wss.handleUpgrade(req as never, socket as never, head as never, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    const conn: Conn = {
      send: (data) => { if (ws.readyState === ws.OPEN) ws.send(data); },
      close: () => ws.close(),
    };
    alive.set(ws, true);
    let burst = 0;
    const refill = setInterval(() => { burst = 0; }, 1000);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("message", (raw) => {
      if (++burst > 60) { ws.close(1008, "Too many messages"); return; } // simple flood guard
      manager.onMessage(conn, raw.toString());
    });
    ws.on("close", () => { clearInterval(refill); manager.onClose(conn); });
    ws.on("error", () => ws.close());
  });

  // Ping everyone so proxies and tunnels do not drop quiet connections, and drop connections that vanished.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (alive.get(ws) === false) return ws.terminate();
      alive.set(ws, false);
      ws.ping();
    });
    manager.sweep();
  }, 25_000);
  httpServer.on("close", () => { clearInterval(heartbeat); wss.close(); });

  return { manager, wss };
}
