#!/usr/bin/env bash
# Puts the newest released version (the highest v* tag) of the web app into a folder your web server serves.
# The server only ever fetches; never edit files there.
#
#   first time:  scripts/deploy.sh /srv/musichero          (clones the repository there)
#   afterwards:  scripts/deploy.sh /srv/musichero          (fetches tags, switches to the newest one)
#   cron, every 10 minutes:  */10 * * * * /srv/musichero/scripts/deploy.sh /srv/musichero >> /var/log/musichero-deploy.log 2>&1
#
# Serve the folder itself (index.html is at its root). It needs HTTPS for offline use (service worker).
set -euo pipefail
DIR="${1:?usage: deploy.sh <folder>}"
REPO="${REPO:-https://github.com/anoBand/musichero.git}"

if [ ! -d "$DIR/.git" ]; then
  git clone --quiet --filter=blob:none "$REPO" "$DIR"
fi
cd "$DIR"
git fetch --quiet --tags --force origin
TAG="$(git tag --list 'v*' --sort=-v:refname | head -n 1)"
if [ -z "$TAG" ]; then
  echo "$(date '+%F %T') no v* tag yet, nothing deployed"
  exit 0
fi
if [ "$(git describe --tags --exact-match 2>/dev/null || true)" = "$TAG" ]; then
  exit 0
fi
git -c advice.detachedHead=false checkout --quiet --force "$TAG"
echo "$(date '+%F %T') deployed $TAG"
