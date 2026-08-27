FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/yt-dlp-venv \
  && /opt/yt-dlp-venv/bin/pip install --no-cache-dir --upgrade pip yt-dlp

ENV PATH="/opt/yt-dlp-venv/bin:${PATH}"
ENV YTDLP_PATH=/opt/yt-dlp-venv/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
