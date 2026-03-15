#!/bin/sh
set -eu

: "${OLLAMA_HOST:=ollama:11434}"
: "${OLLAMA_MODELS:=nomic-embed-text llama3.1:8b}"
: "${OLLAMA_MAX_RETRIES:=60}"
: "${OLLAMA_RETRY_SECONDS:=2}"
: "${OLLAMA_PULL_RETRIES:=5}"

export OLLAMA_HOST

echo "[ollama-init] Waiting for Ollama at ${OLLAMA_HOST}..."
attempt=1
while ! ollama list >/dev/null 2>&1; do
  if [ "$attempt" -ge "$OLLAMA_MAX_RETRIES" ]; then
    echo "[ollama-init] Ollama did not become ready after ${OLLAMA_MAX_RETRIES} attempts."
    exit 1
  fi

  sleep "$OLLAMA_RETRY_SECONDS"
  attempt=$((attempt + 1))
done

echo "[ollama-init] Ollama is ready."

for model in $OLLAMA_MODELS; do
  if ollama show "$model" >/dev/null 2>&1; then
    echo "[ollama-init] Model already present: ${model}"
    continue
  fi

  echo "[ollama-init] Pulling model: ${model}"
  pull_attempt=1
  while ! ollama pull "$model"; do
    if [ "$pull_attempt" -ge "$OLLAMA_PULL_RETRIES" ]; then
      echo "[ollama-init] Failed to pull ${model} after ${OLLAMA_PULL_RETRIES} attempts."
      exit 1
    fi

    sleep "$OLLAMA_RETRY_SECONDS"
    pull_attempt=$((pull_attempt + 1))
  done
done

echo "[ollama-init] Model initialization complete."
