#!/bin/bash
# Pipeline di pubblicazione del sito guitarchords.
#
#   ./pubblica.sh "messaggio"    pubblica le modifiche locali (messaggio facoltativo)
#   ./pubblica.sh --stato        mostra soltanto lo stato, senza pubblicare
#
# Cosa fa: commit -> push su GitHub -> deploy immediato sul telefono -> verifica online.

set -uo pipefail
cd "$(dirname "$0")"

SITO="https://guitarchords.duckdns.org/"
SERVER="telefono"

ok(){ printf '\033[32m✓\033[0m %s\n' "$1"; }
ko(){ printf '\033[31m✗\033[0m %s\n' "$1"; }
info(){ printf '\033[2m·\033[0m %s\n' "$1"; }

# --- stato ---------------------------------------------------------------
locale=$(shasum -a 256 index.html | cut -c1-12)
online=$(curl -fsS --max-time 15 "$SITO" 2>/dev/null | shasum -a 256 | cut -c1-12)

if [ "${1:-}" = "--stato" ]; then
  echo "index.html locale : $locale"
  echo "index.html online : ${online:-non raggiungibile}"
  [ "$locale" = "$online" ] && ok "il sito è allineato" || ko "il sito NON è allineato"
  echo
  git status --short --branch
  exit 0
fi

# --- 1. commit + push ----------------------------------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "Modifiche da pubblicare:"
  git status --short
  echo
  git add -A
  git commit -q -m "${1:-Aggiorna il sito ($(date '+%d/%m/%Y %H:%M'))}" || { ko "commit fallito"; exit 1; }
  ok "commit creato"
else
  info "nessuna modifica locale"
fi

if [ -n "$(git log origin/main..main --oneline 2>/dev/null)" ]; then
  git push -q origin main || { ko "push su GitHub fallito"; exit 1; }
  ok "push su GitHub"
else
  info "GitHub è già aggiornato"
fi

# --- 2. deploy sul telefono ---------------------------------------------
if ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" 'bash ~/scripts/deploy-pull.sh' 2>/dev/null; then
  ok "deploy sul telefono eseguito"
else
  ko "telefono non raggiungibile (sei sulla rete di casa? la VPN è attiva?)"
  info "il telefono si aggiornerà comunque da solo entro 15 minuti"
  exit 1
fi

# --- 3. verifica ---------------------------------------------------------
for i in 1 2 3 4 5; do
  online=$(curl -fsS --max-time 15 "$SITO" 2>/dev/null | shasum -a 256 | cut -c1-12)
  [ "$locale" = "$online" ] && break
  sleep 2
done

echo
if [ "$locale" = "$online" ]; then
  ok "il sito online serve la versione appena pubblicata"
  echo "  $SITO"
else
  ko "il sito online serve ancora una versione diversa (locale $locale / online ${online:-?})"
  info "controlla: ssh $SERVER 'tail -5 ~/logs/deploy.log; pgrep nginx'"
  exit 1
fi
