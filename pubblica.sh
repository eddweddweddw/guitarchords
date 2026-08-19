#!/bin/bash
# Pubblica le modifiche locali sul sito https://eddweddweddw.github.io/guitarchords/
# Uso:  ./pubblica.sh "messaggio del commit"     (il messaggio è facoltativo)
set -e
cd "$(dirname "$0")"

MSG="${1:-Aggiorna il sito ($(date '+%d/%m/%Y %H:%M'))}"

if [ -z "$(git status --porcelain)" ]; then
  echo "Nessuna modifica da pubblicare."
  exit 0
fi

echo "Modifiche da pubblicare:"
git status --short
echo

git add -A
git commit -m "$MSG"
git push origin main

echo
echo "Fatto. Il sito si aggiorna entro circa un minuto."
