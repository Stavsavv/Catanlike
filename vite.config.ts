// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import { attachGameServer } from "./src/server/gameServer";

// Online play: the game server shares the page's address, on the path /game-ws, in both
// `vite dev` and `vite preview`. One port to open up for friends (see README-ONLINE.md).
// Hosts (Render, Fly, ...) ask this address whether the app is up. It answers before the app itself.
const health = (_req: unknown, res: { statusCode: number; setHeader(k: string, v: string): void; end(b?: string): void }) => {
  res.statusCode = 200;
  res.setHeader("content-type", "text/plain");
  res.end("ok");
};

function gameServerPlugin(): Plugin {
  return {
    name: "isle-of-embers-game-server",
    enforce: "pre", // run before the app's own server hooks so /healthz is answered first
    configureServer(server) {
      server.middlewares.use("/healthz", health);
      if (server.httpServer) attachGameServer(server.httpServer);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/healthz", health);
      attachGameServer(server.httpServer);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [gameServerPlugin()],
    // Let friends reach the page through a tunnel (ngrok, Cloudflare Tunnel, ...), whose host name Vite
    // would otherwise refuse.
    server: { allowedHosts: true },
    preview: { allowedHosts: true },
  },
});
