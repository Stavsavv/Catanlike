# Isle of Embers: the game page and the online game server in one container.
# Works on any host that runs Docker (Render, Fly.io, Railway, a VPS ...).
FROM oven/bun:1

WORKDIR /app

# Install first so this layer is cached until the dependencies change.
COPY package.json bun.lock bunfig.toml ./
RUN bun install

COPY . .
RUN bun run build

# Hosts tell the app which port to use through $PORT; 4173 is the fallback.
ENV PORT=4173
EXPOSE 4173

# `vite preview` serves the built site and, through our plugin, the game server on /game-ws.
CMD ["bun", "run", "start"]
