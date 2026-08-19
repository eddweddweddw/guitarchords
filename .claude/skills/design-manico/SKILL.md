---
name: design-manico
description: Regole visive del sito Manico (guitarchords) — i due temi, i token di colore, tipografia, componenti e accessibilità. Da caricare prima di toccare CSS o markup di index.html, prima di aggiungere un componente o una schermata, e ogni volta che si sceglie un colore, una dimensione di testo o un raggio di bordo per questo sito.
---

# Design del sito Manico

Il sito ha **due temi**: nero con accenti blu, e bianco con accenti azzurri.
L'aspetto è asciutto e tipografico — un manuale ben stampato, non un'app
decorata. Prima di introdurre qualcosa di nuovo, verifica che non esista già un
componente che fa il lavoro.

## Regola numero uno: mai un colore scritto a mano

Nel CSS **non esiste un solo valore esadecimale** fuori dai blocchi dei temi in
cima al file. Ogni regola usa `var(--nome)`. Se scrivi `#fff` da qualche parte,
quel punto resterà bianco anche sul tema nero: è esattamente così che un tema si
rompe.

I nomi sono semantici, non descrivono il colore ma il ruolo. Questo è ciò che
permette a una sola regola di funzionare su entrambi i temi.

| Token | Ruolo |
|---|---|
| `--bg`, `--bg-1`, `--bg-2` | fondo pagina e le due tinte del suo alone |
| `--surface` | card e pannelli |
| `--surface-2` | superficie incassata (segmenti, chip, riquadri) |
| `--line` | bordi sottili |
| `--text` | testo primario, massimo contrasto |
| `--text-2` | testo primario secondario |
| `--body` | testo corrente |
| `--dim` | testo attenuato, sottotitoli |
| `--faint` | testo terziario, etichette di gruppo |
| `--accent` | accento: selezione e stati attivi |
| `--accent-deep` | accento per testo e bordi su fondo |
| `--accent-soft` | alone, sfondi di evidenziazione |
| `--accent-2` | dati e etichette tecniche (gradi, note, numeri) |
| `--on-accent` | testo e simboli **sopra** l'accento |
| `--ink` | testo sul diagramma del manico |
| `--diagram-line`, `--diagram-string` | tasti e corde del diagramma |
| `--danger`, `--danger-soft` | errore, "non ricordavo" |
| `--shadow`, `--shadow-sm`, `--shadow-knob` | ombre |
| `--accent-glow`, `--accent-glow-strong` | aloni colorati dei pulsanti attivi |
| `--r` | raggio di default (20px) |

**Aggiungere un token significa definirlo in tutti e tre i blocchi**: `:root`
(chiaro), il blocco `@media (prefers-color-scheme:dark)` e il blocco
`:root[data-theme="dark"]`. Saltarne uno lascia un buco che si vede solo in un
tema, cioè quello che non stai guardando.

**L'accento è uno solo.** Il blu segnala ciò che è attivo o selezionato. Se in
una schermata compaiono tre elementi blu in competizione, due sono di troppo.
`--accent-2` non è un secondo accento decorativo: marca i dati tecnici.

## Tipografia

Una sola famiglia, **Roboto**, con due ruoli distinti:

- **Roboto** — interfaccia e titoli. I titoli usano la classe `.slab`
  (peso 900, `letter-spacing:-.02em`); il testo corrente è il default del `body`.
- **Roboto Mono** (classe `.mono`) — tutto ciò che è dato: numeri, gradi, nomi
  delle corde, etichette maiuscole spaziate.

La gerarchia si costruisce con **peso e dimensione**, non cambiando famiglia.
Le etichette di sezione hanno un unico stile ricorrente: mono, 11px, peso 600,
`letter-spacing:.18em`, maiuscolo, colore `--accent-2`. Il testo d'interfaccia
sta fra 10,5px e 14px; sotto i 10,5px non si scende.

## Componenti che esistono già

`.panel` (card) · `.seg` (selettore segmentato) · `.chip` (interruttore con
`aria-pressed`) · `.deck` (riga di un insieme) · `.deck.attached` (riga agganciata
sotto la sua scheda di teoria) · `.th-card` (scheda di teoria) · `.group-label`
(etichetta di gruppo col filetto) · `.iconbtn` (40×40) e `.iconbtn.hdr` (tondo,
in testata) · `.langpick` (menu a tendina) · `input[type=range]` con riempimento
via `--pct`.

Riusa questi. Un componente nuovo si giustifica solo se nessuno di questi regge
il contenuto.

## Le icone degli insiemi

Ogni insieme ha la sua icona (`DECK_ICONS`), 40×40, dentro un riquadro
`--surface-2`. Non sono decorazioni scelte a caso: sono **due alfabeti**, uno per
gruppo, e una nuova icona deve parlare la lingua del suo.

**Per difficoltà — dove si suona sul manico.** Capotasto spesso e corda a vuoto
per le posizioni aperte, nessun capotasto e sbarra orizzontale per il barré
mobile. La stella dei "più popolari" sta apposta fuori dal sistema: è una
selezione, non un livello.

**Per costruzione teorica — la forma dell'accordo:**

| Segno | Significato |
|---|---|
| triangolo in su | triade maggiore |
| triangolo in giù | triade minore |
| + pallino vuoto | settima minore (♭7) |
| + pallino pieno | settima maggiore |
| vertice aperto + freccia | la terza è sostituita (sus4 su, sus2 giù) |
| segno più | nota aggiunta (add9) |

La struttura è in `--body`, ciò che caratterizza la famiglia è in `--accent`:
guardando l'icona si vede subito *che cosa* distingue quell'insieme dagli altri.
Se aggiungi una famiglia (diminuiti, seste…), componi il suo segno con questo
alfabeto invece di disegnare un simbolo nuovo.

## Regole non negoziabili

1. **Mobile first.** `.app` è largo al massimo 460px, con `env(safe-area-inset-*)`
   già gestito. Si usa in piedi con la chitarra in mano: i bersagli toccabili non
   scendono sotto i 40px, e nei menu stanno a 44.
2. **Lo stato non è mai solo colore.** Ogni stato attivo si esprime anche con
   `aria-pressed`, peso del testo o bordo.
3. **Contrasto.** Testo corrente almeno 4.5:1 sul fondo, **in tutti e due i
   temi**. `--faint` solo per testo decorativo o già ridondante.
4. **`:focus-visible` non si tocca.**
5. **Movimento sobrio.** Transizioni fra 0,15s e 0,2s. Rispetta
   `prefers-reduced-motion` per qualsiasi animazione nuova.
6. **Ogni stringa passa da `t()`**, in italiano e in inglese. Un testo scritto
   nel markup è un bug. E non nominare i colori nei testi: "in verde" è diventato
   falso il giorno in cui l'accento è passato al blu.

## Prima di dire che è finito

Guarda il risultato **nei due temi** e a 360px di larghezza, non solo a 460.
Controlla che il diagramma del manico (SVG di `svgChord`, 280×286) resti
leggibile sul nero. Verifica che nulla finisca sotto la barra di sistema.
