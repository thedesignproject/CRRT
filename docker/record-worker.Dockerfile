FROM oven/bun:1.4.4-debian
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile --ignore-scripts
COPY api ./api
COPY shared ./shared
COPY scripts/record-worker.ts ./scripts/record-worker.ts
USER bun
CMD ["bun", "scripts/record-worker.ts"]
