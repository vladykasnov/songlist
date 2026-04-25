#!/usr/bin/env bash
# Обновляет songs.csv свежим экспортом из ~/Downloads/song-export.csv
# и предлагает закоммитить + запушить.
set -euo pipefail

cd "$(dirname "$0")"

SRC="${SONGLIST_SRC:-$HOME/Downloads/song-export.csv}"
DST="songs.csv"

if [[ ! -f "$SRC" ]]; then
  echo "Не найден файл: $SRC" >&2
  echo "Скачай экспорт и положи туда, либо задай SONGLIST_SRC=/путь/к/файлу" >&2
  exit 1
fi

if [[ -f "$DST" ]] && cmp -s "$SRC" "$DST"; then
  echo "Файл уже актуальный — обновлять нечего."
  exit 0
fi

OLD_ACTIVE=0
if [[ -f "$DST" ]]; then
  OLD_ACTIVE=$(awk -F',' 'NR>1 && tolower($4)=="true"' "$DST" | wc -l | tr -d ' ')
fi
NEW_ACTIVE=$(awk -F',' 'NR>1 && tolower($4)=="true"' "$SRC" | wc -l | tr -d ' ')

cp "$SRC" "$DST"

DIFF=$((NEW_ACTIVE - OLD_ACTIVE))
SIGN=""
[[ $DIFF -gt 0 ]] && SIGN="+"
echo "Активных песен: было $OLD_ACTIVE, стало $NEW_ACTIVE (${SIGN}${DIFF})"

if ! git diff --quiet "$DST"; then
  git --no-pager diff --stat "$DST"
else
  echo "git не видит изменений (странно, но ок) — выходим."
  exit 0
fi

read -r -p "Закоммитить и запушить? [y/N] " ans
case "$ans" in
  [yYдД]*)
    git add "$DST"
    git commit -m "Update songs.csv ($NEW_ACTIVE active, ${SIGN}${DIFF})"
    git push
    echo "Готово. Pages обновится через ~30–60 секунд."
    ;;
  *)
    echo "Отменено. Файл лежит как unstaged — можешь сам решить, что с ним делать."
    ;;
esac
