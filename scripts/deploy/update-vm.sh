#!/usr/bin/env bash
# Installed root-owned on the VM; changes to this script require an explicit reinstall.
set -Eeuo pipefail
umask 077
export HOME=/root PM2_HOME=/root/.pm2
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
CONFIG=${TIMETRACKER_DEPLOY_CONFIG:-/etc/timetracker-deploy.conf}
source "$CONFIG"
mkdir -p "$STATE_DIR" "$RELEASES_DIR"
exec 9>"$STATE_DIR/update.lock"
flock -n 9 || exit 0

log() { printf '%s %s\n' "$(date -Is)" "$*"; }
activate() {
  node - "$STATE_DIR/base-app.json" "$1" "$STATE_DIR/ecosystem.json" <<'JS'
const fs = require('fs');
const [baseline, cwd, output] = process.argv.slice(2);
const app = JSON.parse(fs.readFileSync(baseline, 'utf8'));
fs.writeFileSync(output, JSON.stringify({apps: [{...app, cwd}]}));
JS
  # PM2 restart keeps the old cwd. Recreate only this app to activate a new
  # release directory; the health check restores the previous app on failure.
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then pm2 delete "$APP_NAME"; fi
  pm2 start "$STATE_DIR/ecosystem.json" --only "$APP_NAME"
}
health() {
  local expected="$1"
  for attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 5 "$HEALTH_URL/tracker" >/dev/null; then
      if [[ ! -f "$expected/public/deploy-version.txt" ]] || [[ "$(curl --fail --silent --max-time 5 "$HEALTH_URL/deploy-version.txt" || true)" == "$(cat "$expected/public/deploy-version.txt")" ]]; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}
write_state() { printf '%s\n' "$2" >"$STATE_DIR/$1.tmp"; mv "$STATE_DIR/$1.tmp" "$STATE_DIR/$1"; }
previous=$(cat "$STATE_DIR/current-path")
switched=0
target=""
on_error() {
  local status=$?
  trap - ERR
  set +e
  [[ -z "$target" ]] || write_state failed-sha "$target"
  if [[ "$switched" == 1 ]]; then
    log "Release failed; restoring $previous"
    if activate "$previous" && health "$previous"; then
      pm2 save
      write_state current-path "$previous"
      log "Rollback healthy"
    else
      log "ERROR: rollback needs attention; inspect PM2 and this service's journal"
    fi
  else
    log "Build/check failed; current app remains unchanged"
  fi
  exit "$status"
}
trap on_error ERR
trap 'false' TERM INT

if [[ "${1:-}" == --rollback ]]; then
  rollback=$(cat "$STATE_DIR/previous-path")
  [[ -d "$rollback" && "$rollback" != "$previous" ]]
  # Hold this master commit after rollback until a new commit arrives or --retry is used.
  target=$(git --git-dir="$STATE_DIR/repo.git" rev-parse refs/heads/master)
  switched=1
  activate "$rollback"
  health "$rollback"
  pm2 save
  write_state current-path "$rollback"
  write_state previous-path "$previous"
  write_state failed-sha "$target"
  log "Rolled back to $rollback; current master held"
  exit 0
fi

if [[ ! -d "$STATE_DIR/repo.git" ]]; then
  git clone --bare "$REPO_URL" "$STATE_DIR/repo.git"
fi
git --git-dir="$STATE_DIR/repo.git" fetch --quiet origin +refs/heads/master:refs/heads/master
target=$(git --git-dir="$STATE_DIR/repo.git" rev-parse refs/heads/master)
[[ "$target" =~ ^[0-9a-f]{40}$ ]]
if [[ "${1:-}" != --retry && -f "$STATE_DIR/failed-sha" && "$(cat "$STATE_DIR/failed-sha")" == "$target" ]]; then exit 0; fi
if [[ -f "$previous/public/deploy-version.txt" && "$(cat "$previous/public/deploy-version.txt")" == "$target" ]]; then exit 0; fi

# A fresh directory for every attempt keeps the running and rollback releases intact.
release=$(mktemp -d "$RELEASES_DIR/${target:0:12}.XXXXXX")
log "Building master $target in $release"
git --git-dir="$STATE_DIR/repo.git" archive "$target" | tar -x -C "$release"
ln -s "$ENV_FILE" "$release/.env.local"
mkdir -p "$release/public"
printf '%s\n' "$target" >"$release/public/deploy-version.txt"
(
  cd "$release"
  unset NEXT_PUBLIC_E2E_FIXTURES NEXT_DIST_DIR NODE_ENV
  export NODE_OPTIONS=--max-old-space-size=1024 NEXT_TELEMETRY_DISABLED=1
  pnpm install --frozen-lockfile
  pnpm test:unit
  pnpm build
)
log "Build passed; activating $target"
switched=1
activate "$release"
health "$release"
pm2 save
write_state previous-path "$previous"
write_state current-path "$release"
rm -f "$STATE_DIR/failed-sha"
log "Healthy release $target"
# Keep the current and rollback releases plus the original checkout. Remove only
# older directories created by this updater, never user data or the shared env.
python3 - "$RELEASES_DIR" "$release" "$previous" <<'PY'
import pathlib, re, shutil, sys
root, current, previous = map(pathlib.Path, sys.argv[1:])
for candidate in root.iterdir():
    if candidate not in (current, previous) and candidate.is_dir() and not candidate.is_symlink() and re.fullmatch(r'[0-9a-f]{12}\.[A-Za-z0-9]{6}', candidate.name):
        shutil.rmtree(candidate)
PY
