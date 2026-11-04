FROM node:24-bookworm-slim
WORKDIR /app/bridges
COPY bridges/package.json ./
# Optional integration only; review THIRD_PARTY.md before building this profile.
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node bridges/ ./
RUN mkdir -p /app/data && chown node:node /app/data
ENV DATA_DIR=/app/data
USER node
CMD ["node", "tiktok.mjs"]
