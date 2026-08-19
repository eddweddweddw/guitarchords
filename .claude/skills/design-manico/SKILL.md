---
name: design-manico
description: Regole visive del sito Manico (guitarchords) — palette, tipografia, spaziature, componenti e accessibilità. Da caricare prima di toccare CSS o markup di index.html, prima di aggiungere un componente o una schermata, e ogni volta che si sceglie un colore, una dimensione di testo o un raggio di bordo per questo sito.
---

# Design del sito Manico

Il sito ha una sua identità già definita: **carta chiara, verde smeraldo come
unico accento, ambra per le etichette tecniche**. L'aspetto deve richiamare un
manuale di musica ben stampato, non un'app generica. Prima di introdurre
qualcosa di nuovo, verifica che non esista già un componente che fa il lavoro.

## Non inventare colori

I colori esistono **solo** come variabili in `:root`. Non scrivere mai un valore
esadecimale nuovo nelle regole CSS: se serve una tinta che non c'è, la si
aggiunge come token e si spiega perché.

| Token | Valore | Uso |
|---|---|---|
| `--wood` | `#f5f2ea` | sfondo carta |
| `--wood-2` | `#ffffff` | superficie di pannelli e card |
| `--wood-3` | `#e6e1d3` | bordi sottili |
| `--bone` | `#171310` | testo primario ad alto contrasto |
| `--steel` | `#3d382f` | testo corrente |
| `--steel-dim` | `#847d6d` | testo attenuato, sottotitoli |
| `--steel-faint` | `#b7b0a0` | etichette di gruppo, testo terziario |
| `--abalone` | `#0f9d84` | accento primario: selezione, stati attivi |
| `--abalone-deep` | `#0a7562` | accento su fondo chiaro, valori numerici |
| `--abalone-soft` | `rgba(15,157,132,.12)` | alone, sfondi di evidenziazione |
| `--brass` | `#b3781a` | etichette maiuscole, numeri, dati tecnici |
| `--danger` | `#d9503a` | errore, "non ricordavo" |

`--shadow` e `--r` (raggio 20px) sono i valori di default: usali invece di
riscrivere ombre e raggi a mano.

**L'accento è uno solo.** Il verde segnala ciò che è attivo o selezionato. Se in
una schermata compaiono tre elementi verdi in competizione, due sono di troppo.
L'ambra non è un secondo accento decorativo: marca i dati tecnici (gradi, note,
etichette di sezione).

## Tipografia

Tre famiglie, con ruoli non intercambiabili:

- **Space Grotesk** (classe `.slab`) — titoli e simboli degli accordi.
- **Inter** — testo dell'interfaccia. È il default del `body`.
- **IBM Plex Mono** (classe `.mono`) — tutto ciò che è dato: numeri, gradi,
  nomi delle corde, etichette maiuscole spaziate.

Le etichette di sezione seguono un unico stile ricorrente: mono, 11px, peso 600,
`letter-spacing:.18em`, maiuscolo, colore `--brass`. Le dimensioni del testo
d'interfaccia stanno tra 10,5px e 14px; sotto i 10,5px non si scende.

## Componenti che esistono già

`.panel` (card con bordo e ombra) · `.seg` (selettore segmentato) ·
`.chip` (interruttore con `aria-pressed`) · `.deck` (riga di un insieme) ·
`.group-label` (etichetta di gruppo con filetto sfumato) ·
`input[type=range]` con riempimento progressivo via `--pct`.

Riusa questi. Un nuovo componente si giustifica solo se nessuno di questi regge
il contenuto.

## Regole non negoziabili

1. **Mobile first.** `.app` è largo al massimo 460px, con `env(safe-area-inset-*)`
   già gestito. Il sito si usa in piedi, con la chitarra in mano: i bersagli
   toccabili non scendono sotto i 44px di lato.
2. **Lo stato non è mai solo colore.** Ogni stato attivo si esprime anche con
   `aria-pressed`, peso del testo o bordo. Chi non distingue il verde deve
   comunque capire cosa è selezionato.
3. **Contrasto.** Testo corrente su fondo carta almeno 4.5:1; `--steel-faint` è
   ammesso solo per testo decorativo o già ridondante.
4. **`:focus-visible` non si tocca.** L'outline verde è la navigazione da
   tastiera.
5. **Movimento sobrio.** Le transizioni stanno tra 0,15s e 0,2s. Rispetta
   `prefers-reduced-motion` per qualsiasi animazione nuova.
6. **Ogni stringa passa da `t()`**, in italiano e in inglese. Un testo scritto
   direttamente nel markup è un bug, non una scorciatoia.

## Prima di dire che è finito

Guarda il risultato a 360px di larghezza, non solo a 460. Controlla che il
diagramma del manico (SVG generato da `svgChord`, 280×286) non venga compresso.
Verifica che nulla finisca sotto la barra di sistema su iPhone.
