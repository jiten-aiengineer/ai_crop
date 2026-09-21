#!/usr/bin/env bash
set -euo pipefail

# Sync only browser-safe PWA, mascot and catalogue-pack assets for Nginx.
# Never point Nginx at private S3 data, inspection uploads, .env files or the
# application source checkout.
source_dir="${1:-/home/ubuntu/apps/ai_crop/frontend/public}"
target_dir="${2:-/var/www/crop-life-ai-public}"

sudo install -d -o www-data -g www-data -m 0755 "$target_dir"
sudo rsync -a --delete --chown=www-data:www-data "$source_dir/" "$target_dir/"
