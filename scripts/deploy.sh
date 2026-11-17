#!/usr/bin/env bash
# Puts the newest released version (the highest vX.Y.Z tag) of the web app into a folder your web server serves.
# The server only ever fetches; never edit files there.
#
# Keep a copy of this script outside the deployed folder and run that copy: the deployed folder is switched to
# other versions, so a script inside it would be replaced underneath itself.
#
#   cp scripts/deploy.sh ~/musichero-deploy.sh
#   ~/musichero-deploy.sh ~/musichero                  first run clones; later runs switch to a newer tag if any
#   crontab, every 10 minutes:
#   */10 * * * * $HOME/musichero-deploy.sh $HOME/musichero >> $HOME/musichero-deploy.log 2>&1
#
# Serve the folder itself (index.html is at its root) and keep .git and the non-web folders out of reach.
# Offline use (service worker) needs HTTPS.
set -euo pipefail

# Everything runs from inside main(), which bash reads in full before running it, so even a copy that gets
# replaced while running finishes the version it started with.
main() {
  local dir="${1:?usage: deploy.sh <folder>}"
  local repo="${REPO:-https://github.com/anoBand/musichero.git}"

  local fresh=0
  if [ ! -d "$dir/.git" ]; then
    git clone --quiet --filter=blob:none "$repo" "$dir"
    fresh=1
  fi
  cd "$dir"
  git fetch --quiet --tags --force origin

  # releases only: vX.Y.Z. Tags such as v1.0.0-beta would sort above v1.0.0, so they are left out.
  local tag
  tag="$(git tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)"
  if [ -z "$tag" ]; then
    echo "$(date '+%F %T') no vX.Y.Z tag yet, nothing deployed"
    return 0
  fi
  # compare commits, not names: two tags can point at the same commit
  if [ "$fresh" = 0 ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse "$tag^{commit}")" ]; then
    return 0
  fi
  git -c advice.detachedHead=false checkout --quiet --force "$tag"
  echo "$(date '+%F %T') deployed $tag"
}

main "$@"
exit
