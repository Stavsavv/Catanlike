# Playing Isle of Embers online with friends

The game server is built in. It runs inside the same Vite server that shows the page, on the path `/game-ws`,
so **one address is all your friends need**.

## First time

```bash
bun install        # adds the new "ws" package
```

## Every game night

1. Start the game on your computer:
   ```bash
   bun run dev        # or: bun run build && bun run preview
   ```
   Note the port it prints (for example `http://localhost:5173`).
2. Give your friends a way to reach that port. Pick one:
   - **Same Wi-Fi or home network:** they open `http://<your computer's local IP>:<port>`.
     Start Vite with `--host` (`bun run dev -- --host`) so it listens on the network.
   - **Over the internet, no router setup:** use a tunnel, for example
     `cloudflared tunnel --url http://localhost:<port>` or `ngrok http <port>`.
     It prints a public `https://...` address. (Vite is already set to accept tunnel host names.)
   - **A VPN such as Tailscale:** everyone joins the same private network and uses your Tailscale address.
3. Open that address yourself, press **Play online with friends**, then **Create a room**.
4. Press **Copy invite link** and send it. Friends open the link, type a name and join.
   (They can also open the page and type the 5-letter code.)
5. Add AI players if you want a full table, pick the island, and press **Start the game**.

## Putting it online for good (no need to keep your computer on)

The project comes with a `Dockerfile`, so any host that runs Docker can run it. The page and the game server
are one process on one address, so friends just open the link.

**On Render (an easy start):**
1. Put the project in a GitHub repository (private is fine).
2. On render.com press **New > Web Service**, pick the repository. Render finds the `Dockerfile`.
3. Choose an instance type (the free one works, see below), and under **Advanced** set the
   **Health Check Path** to `/healthz`. (Or use **New > Blueprint**, which reads `render.yaml`.)
4. Press **Create**. The first build takes a few minutes. When it is live, open the `https://....onrender.com`
   address, press **Play online with friends**, create a room and send the invite link.

**Anywhere else with Docker (Fly.io, Railway, a VPS):**
```bash
docker build -t isle-of-embers .
docker run -p 4173:4173 isle-of-embers      # the host's $PORT is used if it sets one
```

**Things to know about hosting**
- Rooms live in the server's memory. A restart or redeploy ends running games.
- Free instances usually go to sleep when idle (Render's free tier stops a service after 15 minutes with no
  traffic, and wakes it on the next visit, which takes about a minute). While people are playing there is
  traffic, so it stays up. Paid instances do not sleep.
- This runs the site with `vite preview`. That is not what Vite recommends for big public sites, but it is fine
  for a game among friends.

## Good to know

- Rooms live in the server's memory. If you stop the server, running games are lost. Rooms nobody has touched
  for 30 minutes are removed.
- If someone closes their tab or loses their connection, their seat is kept. Opening the page again rejoins
  them automatically. If they never come back, the host can press **Let the AI play for them**.
- Only your own cards are ever sent to your browser. Other players' hands are just card counts, until the
  game ends.
- Your computer and the tunnel must stay on while you play.

## For developers

- `src/game/actions.ts`: every move as plain data, checked by `applyAction`. The server and the single-screen
  game use the same function.
- `src/server/room.ts`: rooms, seats, AI turns and per-player views. No Node-only code, so it can move into a
  Cloudflare Durable Object later.
- `src/server/gameServer.ts`: attaches the rooms to WebSockets (`ws`).
- `src/game/onlineClient.ts`: the browser side, with automatic reconnecting.
- `vite.config.ts`: attaches the server to `vite dev` and `vite preview`. The production build (`vite build`
  for Cloudflare) does not include it.
