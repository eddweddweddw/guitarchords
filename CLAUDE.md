# Manico — allenatore di accordi

Sito statico che allena la memoria delle diteggiature degli accordi di chitarra.
Online su <https://guitarchords.duckdns.org>.

## Architettura

Il sito è quasi tutto in `index.html`, senza build step, senza dipendenze,
senza framework. L'unico file a parte è `assets/listener.js`, il motore audio
dell'accordatore, collegato con un solo `<script src>`.

`index.html` è diviso in tre zone: il `<style>`, il markup (nessun handler
inline) e lo `<script>`. In cima al CSS stanno i **tre blocchi dei temi**: sono
l'unico posto del file dove compaiono valori di colore.

Strutture dati principali dentro lo script:

- **`I18N`** — tutte le stringhe visibili, in `it` e `en`.
- **`CH`** — dizionario degli accordi (90 voci): `sym`, `name`, `frets` (6 valori,
  `'x'` = corda muta, `0` = a vuoto), `fingers`, `deg`, `notes`.
- **`DECKS`** — gli insiemi di esercizi, raggruppati per difficoltà (`diff`)
  e per costruzione teorica (`th`).
- **`THEORY`** — le schede di teoria, una per ogni insieme del gruppo `th`.
  Vengono mostrate **dentro la home**, sopra l'insieme a cui si riferiscono:
  non esiste una pagina di teoria separata.
- **`S`** — stato della sessione, persistito in `localStorage`.

Le pagine a tutto schermo (`.stage`) sono l'esercizio e l'accordatore: si aprono
aggiungendo la classe `on`.

## Regole di lavoro

- **Nessuna stringa scritta a mano nel codice.** Ogni testo visibile passa da
  `t('chiave')` e va aggiunto **sia** in `I18N.it` **sia** in `I18N.en`.
- **Niente dipendenze esterne.** Il sito è servito da un telefono Android: ogni
  libreria è banda, batteria e un punto di rottura in più. Solo i font Google
  già presenti.
- **Mobile first.** Il contenitore `.app` è largo al massimo 460px. Il sito si usa
  in piedi con la chitarra in mano.
- **Due temi.** Nessun colore scritto a mano nelle regole CSS: solo `var(--nome)`.
  Un valore esadecimale sparso nel foglio resta identico su entrambi i temi ed è
  il modo tipico in cui il tema scuro si rompe.
- **Gli accordi si verificano, non si scrivono a occhio.** Le note di un accordo
  sono calcolabili dai `frets`: prima di aggiungerne uno, controlla che le note
  che dichiari siano davvero quelle che suona.
- **Accessibilità.** Gli stati si esprimono con `aria-pressed` / `aria-label`, non
  solo col colore. `:focus-visible` è già stilizzato: non rimuoverlo.
- Per le regole visive (palette, tipografia, spaziature) carica la skill
  **design-manico**.

## Pubblicazione — leggere prima di toccare git

Il deploy è una catena reale verso un sito pubblico:

```
cartella locale → git push su GitHub → ssh al telefono → nginx serve i file
```

Lo script `./pubblica.sh` fa tutto e verifica che il sito online serva davvero
la nuova versione. `./pubblica.sh --stato` controlla soltanto, senza pubblicare.

**Nessun agente esegue `pubblica.sh`, `git push` o `git commit`.** Pubblicare è
irreversibile e pubblico: lo decide una persona. Gli agenti modificano i file e
si fermano lì.

## Cose da non pubblicare

`contesto/` è in `.gitignore` e contiene la scheda del server con IP locale,
utente Termux e porte. Il repository è **pubblico**: non spostare quei contenuti
nei file versionati.

## Il server, in breve

OnePlus Nord CE con Termux e nginx, in casa. Il telefono fa `git pull` da solo
ogni 15 minuti (`termux-job-scheduler` in `~/.termux/boot/start-services.sh`,
non dal crontab). `pubblica.sh` salta l'attesa via SSH. Il dettaglio completo è
in `contesto/SCHEDA_SERVER.md`.
