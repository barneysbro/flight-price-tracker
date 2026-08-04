#!/bin/sh
set -eu

cd "$(dirname "$0")"
mkdir .update.lock 2>/dev/null || { echo "Another update is running"; exit 1; }
trap 'rmdir .update.lock' EXIT

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
