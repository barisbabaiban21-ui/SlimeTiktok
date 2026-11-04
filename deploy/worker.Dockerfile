FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb ffmpeg pulseaudio fonts-liberation ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node scripts/stream-worker.mjs ./stream-worker.mjs
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "stream-worker.mjs"]
