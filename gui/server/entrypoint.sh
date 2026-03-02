#!/bin/bash
set -e

# Wait for Ollama to be ready if OLLAMA_URL is set 
if [ -n "$OLLAMA_URL" ]; then
  echo "Waiting for Ollama at ${OLLAMA_URL}..."
  # Simple wait loop checking the API endpoint
  while ! curl -s "${OLLAMA_URL}/api/tags" > /dev/null; do
    sleep 2
  done
  echo "Ollama is ready!"
fi

# Start the Node server
exec npm start
