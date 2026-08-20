#!/bin/bash
# Pubblica le modifiche del sito Manico.
#
#   ./pubblica.sh "messaggio"    pubblica (il messaggio è facoltativo)
#   ./pubblica.sh --stato        controlla soltanto, senza pubblicare
#
# Il sito vive in due posti:
#   · GitHub Pages  — sempre acceso, è l'indirizzo ufficiale (canonical)
#   · il telefono   — copia in casa, comoda ma spenta quando il telefono non c'è
# Il push è ciò che conta: Pages si aggiorna da solo. Il telefono è un extra,
# e se non risponde la pubblicazione è riuscita lo stesso.

set -uo pipefail
cd "$(dirname "$0")"

SITO="https://eddweddweddw.github.io/guitarchords/"
CASA="https://guitarchords.duckdns.org/"
SERVER="telefono"

ok(){   printf '\033[32m✓\033[0m %s\n' "$1"; }
ko(){   printf '\033[31m✗\033[0m %s\n' "$1"; }
info(){ printf '\033[2m·\033[0m %s\n' "$1"; }

# Se la richiesta fallisce non deve uscire l'impronta del vuoto, che sembrerebbe
# una versione diversa invece che un sito irraggiungibile.
impronta(){
  local corpo
  corpo=$(curl -fsS --max-time 15 "$1" 2>/dev/null) || return 0
  [ -n "$corpo" ] || return 0
  printf '%s' "$corpo" | shasum -a 256 | cut -c1-12
}

locale=$(shasum -a 256 index.html | cut -c1-12)

# --- solo controllo -------------------------------------------------------
if [ "${1:-}" = "--stato" ]; then
  echo "index.html locale : $locale"
  p=$(impronta "$SITO"); c=$(impronta "$CASA")
  echo "GitHub Pages      : ${p:-non raggiungibile}"
  echo "telefono di casa  : ${c:-non raggiungibile}"
  [ "$locale" = "$p" ] && ok "Pages è allineato" || ko "Pages NON è allineato"
  echo
  git status --short --branch
  exit 0
fi

# --- 1. commit + push -----------------------------------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "Modifiche da pubblicare:"; git status --short; echo
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

# --- 2. il telefono, se c'è ----------------------------------------------
if ssh -o ConnectTimeout=8 -o BatchMode=yes "$SERVER" 'bash ~/scripts/deploy-pull.sh' >/dev/null 2>&1; then
  ok "copia sul telefono aggiornata"
else
  info "telefono non raggiungibile: salto (si aggiornerà da solo quando torna)"
fi

# --- 3. verifica su Pages -------------------------------------------------
# La pubblicazione di Pages non è istantanea: si costruisce dopo il push.
printf '\033[2m·\033[0m attendo che GitHub Pages ricostruisca'
for i in $(seq 1 20); do
  online=$(impronta "$SITO")
  [ "$locale" = "$online" ] && break
  printf '.'; sleep 5
done
printf '\n'

if [ "$locale" = "$online" ]; then
  ok "il sito online serve la versione appena pubblicata"
  echo "  $SITO"
else
  ko "Pages serve ancora una versione diversa (locale $locale / online ${online:-?})"
  info "a volte ci mette qualche minuto: riprova con ./pubblica.sh --stato"
  exit 1
fi
