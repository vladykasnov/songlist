#!/usr/bin/env bash
# Обновляет резервный публичный снимок из работающего songlist-next.
set -euo pipefail

cd "$(dirname "$0")"
node scripts/update-snapshot.mjs

git --no-pager diff --stat -- catalog-snapshot.json songs.csv
read -r -p "Закоммитить и отправить обновлённый снимок? [y/N] " answer
case "$answer" in
  [yYдД]*)
    git add catalog-snapshot.json songs.csv
    git commit -m "Обновить резервный каталог песен"
    git push
    ;;
  *)
    echo "Снимок обновлён только локально."
    ;;
esac
