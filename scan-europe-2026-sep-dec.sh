#!/bin/sh
set -eu

cd "$(dirname "$0")"
lock=.europe-update.lock
state=.europe-scan-progress
mkdir "$lock" 2>/dev/null || { echo "Europe update is already running"; exit 1; }
trap 'rmdir "$lock"' EXIT

unexpected=$(git status --porcelain --untracked-files=no | grep -v ' EuropeFlights/public/data/results.json$' || true)
[ -z "$unexpected" ] || { echo "Tracked files other than Europe flight data have uncommitted changes"; exit 1; }
gh auth switch --hostname github.com --user barneysbro >/dev/null
last_done=$(cat "$state" 2>/dev/null || true)
skipping=$([ -n "$last_done" ] && echo 1 || echo 0)

while IFS="	" read -r destination airline_list; do
  [ -n "$destination" ] || continue
  if [ "$skipping" = 1 ]; then
    [ "$destination" = "$last_done" ] && skipping=0
    continue
  fi

  echo "=== $destination: $airline_list ==="
  for airline in $(printf '%s' "$airline_list" | tr ',' ' '); do
    echo "--- $destination / $airline ---"
    (cd EuropeFlights && node scan.mjs 2026-09-01 2026-12-31 8,9,10 "$destination" "$airline" --headless)
  done

  (cd EuropeFlights && npm run export)
  git add EuropeFlights/public/data/results.json
  if git diff --cached --quiet; then
    echo "No public data change for $destination"
  else
    git commit -m "Update $destination flight prices Sep-Dec 2026"
    git push
  fi
  printf '%s\n' "$destination" > "$state"
done <<'ROUTES'
MAD	CZ,CA,3U
FRA	CZ,CA
BCN	CA,ZH
BER	HU,MF
MUC	CA
CDG	CZ,CA,HU,MF
FCO	CA,HU,3U
MXP	CZ,CA,HU,HO
VCE	CA
AMS	CZ,MF
VIE	CA,HU
BRU	CA,HU,HO
ATH	CA,HO
BUD	CZ,CA,HU
ROUTES

rm -f "$state"
echo "All Europe destinations completed and pushed"
