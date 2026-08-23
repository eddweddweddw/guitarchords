---
name: design-manico
description: Regole visive del sito Manico (guitarchords) — i due temi, i token di colore, tipografia, componenti e accessibilità. Da caricare prima di toccare CSS o markup di index.html, prima di aggiungere un componente o una schermata, e ogni volta che si sceglie un colore, una dimensione di testo o un raggio di bordo per questo sito.
---

# Design del sito Manico

Il fondo del sito è **il legno di una tastiera**, e i due temi sono due legni
veri: **acero** di giorno, **palissandro** di notte, come si distinguono le
tastiere delle chitarre. Sopra il legno stanno fogli chiari, e i contenuti
stanno sui fogli. L'accento resta blu in entrambi.

Il legno è fatto di cinque venature sovrapposte (`--vena-scura` e
`--vena-chiara`, periodi che non si allineano fra loro perché il disegno non si
ripeta a occhio) più la grana. Sono sfumature CSS: nessuna immagine da
scaricare, che su un server domestico conta.

**Niente tasti né intarsi nel fondo.** Il diagramma dell'accordo è già un manico
disegnato: un secondo manico sotto crea un'immagine dentro l'immagine e non si
capisce più quali righe siano i tasti veri.

**Sul legno non si scrive volentieri.** Il testo che sta direttamente sul fondo
(presentazione, etichette dei gruppi, introduzione teorica) è l'unico posto dove
il contrasto va ricontrollato dopo ogni ritocco del legno: è per questo che
`--dim` è più scuro di quanto sembrerebbe necessario guardandolo su una card.
L'aspetto è quello di un manuale di musica ben stampato, non di un'app decorata:
carta calda con una grana appena percettibile, fogli bianchi posati sopra, e il
simbolo dell'accordo in una serif. Prima di introdurre qualcosa di nuovo, verifica che non esista già un
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
| `--bg`, `--bg-1`, `--bg-2` | la carta e le due tinte del suo alone |
| `--grana` | quanto si vede la fibra della carta (`body::before`) |
| `--velo` | il fondo scuro dietro le finestre sovrapposte |
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

Due famiglie, con ruoli che non si scambiano:

- **Roboto** — interfaccia e titoli. I titoli usano la classe `.slab`
  (peso 900, `letter-spacing:-.02em`); il testo corrente è il default del `body`.
- **Roboto Mono** (classe `.mono`) — tutto ciò che è dato: numeri, gradi, nomi
  delle corde, etichette maiuscole spaziate.
- **Instrument Serif** — soltanto il **simbolo dell'accordo** a schermo intero
  (`.symbol`, `.tn-note`, `#gmFinal` e `.sym` dentro `<manico-chord-check>`).
  È l'elemento più guardato del sito ed è l'unico posto dove questa serif
  compare: non usarla altrove.

La gerarchia si costruisce con **peso e dimensione**, non cambiando famiglia.
Le etichette di sezione hanno un unico stile ricorrente: mono, 11px, peso 600,
`letter-spacing:.18em`, maiuscolo, colore `--accent-2`. Il testo d'interfaccia
sta fra 10,5px e 14px; sotto i 10,5px non si scende.

## Componenti che esistono già

`.panel` (card) · `.chip` (interruttore con `aria-pressed`) · `.blocco > .riga`
(un insieme più il suo bottone info) · `.deck` (riga di un insieme; con `.gioco`
mostra il tasto play al posto della freccia) · `.infobtn` (il tondo ⓘ) ·
`.modale` (finestra sovrapposta col velo) · `.th-card` (scheda di teoria) ·
`.tabbar`/`.tab` (i due modi) · `.group-label` · `.iconbtn` (40×40) e
`.iconbtn.hdr` (tondo, in testata) · `.langpick` · `input[type=range]` con `--pct`.

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
7. **Niente trattini lunghi per gli incisi**: virgola, o due punti.

## Prima di dire che è finito

Guarda il risultato **nei due temi** e a 360px di larghezza, non solo a 460.
Controlla che il diagramma del manico (SVG di `svgChord`, 280×286) resti
leggibile sul nero. Verifica che nulla finisca sotto la barra di sistema.
