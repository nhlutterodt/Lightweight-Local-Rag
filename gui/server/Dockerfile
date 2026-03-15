# Must be built from project root: docker build -t rag-server -f gui/server/Dockerfile .
FROM node:20-slim AS deps

WORKDIR /app/gui/server
COPY gui/server/package*.json ./
RUN npm install --no-audit --no-fund

FROM node:20-slim

# Install curl for waiting on Ollama in entrypoint and for health checks.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire project codebase to preserve root-relative config paths.
COPY . .

# Reuse dependency layer, then strip dev dependencies for runtime.
COPY --from=deps /app/gui/server/node_modules /app/gui/server/node_modules

WORKDIR /app/gui/server
RUN npm prune --omit=dev && chmod +x entrypoint.sh

ENV NODE_ENV=production

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
