# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder
WORKDIR /app

# Toolchain only for better-sqlite3's gyp build
RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false --network-timeout 600000

COPY . .
# Trim devDependencies after the native build is cached
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

# --- Runtime stage ---
FROM node:22-alpine AS runtime
WORKDIR /app

# yt-dlp is optional (MUSIC_PROVIDER=netease is default); leave it out of MVP.
RUN apk add --no-cache tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pwa ./pwa
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/router.js ./router.js
COPY --from=builder /app/scheduler.js ./scheduler.js
COPY --from=builder /app/context.js ./context.js
COPY --from=builder /app/claude.js ./claude.js
COPY --from=builder /app/llm.js ./llm.js
COPY --from=builder /app/tts.js ./tts.js
COPY --from=builder /app/music.js ./music.js
COPY --from=builder /app/music-netease.js ./music-netease.js
COPY --from=builder /app/music-yt-dlp.js ./music-yt-dlp.js
COPY --from=builder /app/state.js ./state.js
COPY --from=builder /app/netease-session.js ./netease-session.js
COPY --from=builder /app/paths.js ./paths.js

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    SEADIO_DATA_DIR=/data \
    MUSIC_PROVIDER=netease

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
