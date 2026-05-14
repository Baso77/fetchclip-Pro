#!/usr/bin/env bash
set -e

echo "==> Installing yt-dlp binary..."

# Download yt-dlp binary directly into project bin folder
mkdir -p ./bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp
chmod +x ./bin/yt-dlp

echo "==> yt-dlp version: $(./bin/yt-dlp --version)"

echo "==> Running npm install..."
npm install

echo "==> Build complete."