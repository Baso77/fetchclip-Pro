#!/usr/bin/env bash
set -e

echo "Installing ffmpeg and yt-dlp..."
apt-get update -qq
apt-get install -y ffmpeg python3-pip python3-setuptools
pip3 install -U yt-dlp

echo "yt-dlp version: $(yt-dlp --version)"
echo "ffmpeg version: $(ffmpeg -version | head -1)"
echo "Build complete."