#!/bin/sh
set -eu

cd "$(dirname "$0")"
if ! mkdir .update.lock 2>/dev/null; then
  lock_pid=$(cat .update.lock/pid 2>/dev/null || true)
  if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
    echo "Another update is running (PID $lock_pid)"
    exit 1
  fi
  rm -f .update.lock/pid
  rmdir .update.lock
  mkdir .update.lock
fi
echo $$ > .update.lock/pid
trap 'rm -f .update.lock/pid; rmdir .update.lock' EXIT HUP INT TERM

if [ "${1:-}" != "--publish-only" ]; then
  while IFS="	" read -r project from to days destination airlines; do
    [ "$project" = "project" ] && continue
    [ -z "$project" ] && continue
    (cd "$project" && node scan.mjs "$from" "$to" "$days" "$destination" "$airlines" --force)
  done < watchlist.tsv
fi

for project in EuropeFlights JapanFlights ThailandFlights ThailandTripFlights; do
  (cd "$project" && npm run export)
done

git add EuropeFlights/public/data/results.json JapanFlights/public/data/results.json ThailandFlights/public/data/results.json ThailandTripFlights/public/data/results.json
git diff --cached --quiet && { echo "No data changes"; exit 0; }
git commit -m "Update flight prices $(date '+%Y-%m-%d %H:%M')"
gh auth switch --hostname github.com --user barneysbro >/dev/null
git push
