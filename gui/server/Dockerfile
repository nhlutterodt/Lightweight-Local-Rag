# Must be built from project root: docker build -t rag-server -f gui/server/Dockerfile .
FROM node:20-slim

# Install curl for waiting on Ollama in entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package definitions first for layer caching
COPY gui/server/package*.json ./gui/server/
RUN cd gui/server && npm install

# Copy the entire project codebase to maintain the directory structure
# expected by the server config loader (e.g. configs at root)
COPY . .

WORKDIR /app/gui/server
RUN chmod +x entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
