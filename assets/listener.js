"use strict";
/* ==========================================================================
   Manico — motore di ascolto
   Punto 1 della roadmap: accordatore a corda singola.

   Nessuna dipendenza, nessun build step. Il file funziona sia nel browser
   (definisce window.Listener) sia in Node (globalThis.Listener), così la
   matematica si può provare senza microfono e senza pagina.
   ========================================================================== */
(function (root) {

  /* ---------------------------------------------------------------- config */
  /* Tutti i numeri regolabili in un posto solo: se una misura va storta,
     si gira una manopola qui e non si va a caccia nel codice. */
  const CFG = {
    fftSize:   4096,   // campioni che l'AnalyserNode consegna a ogni giro
    window:    2048,   // W: quanti campioni confronta la funzione differenza
    tauMin:      32,   // ritardo minimo → 44100/32  ≈ 1378 Hz (limite acuto)
    tauMax:     800,   // ritardo massimo → 44100/800 ≈ 55 Hz (limite grave)
    threshold:  0.10,  // soglia YIN: sotto questo valore il periodo è credibile
    reject:     0.60,  // sopra questo valore non c'è periodicità: è rumore
    rmsGate:    0.006, // sotto questo volume dichiariamo silenzio
    intervalMs:   50,  // 20 analisi al secondo: fluido all'occhio, gentile in batteria

    /* Stabilizzazione della lettura mostrata. Sono i numeri che decidono se
       l'ago è utilizzabile per accordare o se balla e basta. */
    minClarity: 0.90,  // sotto questa chiarezza la lettura non entra nemmeno
    medianLen:     9,  // ampiezza della mediana: toglie le letture sbandate
    lockFrames:    4,  // letture concordi richieste per agganciare una nota nuova
    lockSpread:   30,  // quanto possono discordare (cent) e dirsi ancora concordi
    jumpCents:    60,  // oltre questo scarto la lettura contraddice la nota agganciata
    holdFrames:   16,  // quanto si tiene l'ultima lettura buona quando il suono cala
    smoothMin:  0.05,  // inseguimento minimo: fermo vicino al bersaglio
    smoothMax:  0.45,  // inseguimento massimo: pronto quando il bersaglio si sposta
    smoothSpan:   40,  // scarto (cent) al quale l'inseguimento è già al massimo

    /* Ascolto degli accordi. Numeri diversi da quelli dell'accordatore perché
       il problema è diverso: lì una nota che dura, qui sei corde insieme che
       decadono. */
    chordSize:     32768, // campioni tenuti in memoria: 0,68 s a 48 kHz
    chordWindows:      3, // finestre di chroma da mediare
    chordHopMs:      120, // distanza fra una finestra e la successiva
    chordGate:     0.012, // sotto questo livello non è una pennata
    chordRise:       2.5, // di quanto deve salire il livello per essere un attacco
    chordWaitMs:     800, // attesa dall'attacco prima di giudicare
    chordHoldMs:     700  // pausa dopo un verdetto, prima di ascoltarne un altro
    /* La pausa è tarata, non scelta: a 1300 ms finiva a metà della pennata
       successiva, e l'attacco veniva riconosciuto con mezzo secondo di ritardo
       sul suono ormai spento (81% di esecuzioni corrette accettate). A 250 ms
       la stessa pennata veniva giudicata due volte (61%). A 700 ms: 92,8%. */
  };

  /* Nomi delle note come dato, non come stringa d'interfaccia: chi disegna
     la UI decide cosa mostrarne. Indice = classe di altezza (0 = Do). */
  const NOTE_NAMES = {
    it: ["Do","Do♯","Re","Re♯","Mi","Fa","Fa♯","Sol","Sol♯","La","La♯","Si"],
    en: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
  };

  /* Le sei corde a vuoto in accordatura standard, in numeri MIDI.
     Sono gli stessi 40/45/50/55/59/64 su cui si appoggeranno gli accordi
     al punto 2 della roadmap: un'unica fonte di verità. */
  const STRINGS = [
    { midi: 40, label: { it: "Mi basso", en: "Low E" } },
    { midi: 45, label: { it: "La",       en: "A"     } },
    { midi: 50, label: { it: "Re",       en: "D"     } },
    { midi: 55, label: { it: "Sol",      en: "G"     } },
    { midi: 59, label: { it: "Si",       en: "B"     } },
    { midi: 64, label: { it: "Mi cantino", en: "High E" } }
  ];

  const A4 = 440;      // riferimento di intonazione
  const A4_MIDI = 69;  // il La4 è il numero MIDI 69

  /* ------------------------------------------------------- note e frequenze */

  /* Da numero MIDI a frequenza: ogni semitono è un dodicesimo di ottava,
     e un'ottava è un raddoppio. Da qui esce 82.4069 Hz per il Mi basso. */
  function midiToFreq(midi) {
    return A4 * Math.pow(2, (midi - A4_MIDI) / 12);
  }

  /* Da frequenza a nota: l'inversa della precedente. midi resta frazionario,
     la parte decimale è esattamente lo scarto di intonazione. */
  function freqToMidi(freq) {
    return A4_MIDI + 12 * Math.log2(freq / A4);
  }

  /* Descrive una frequenza: nota più vicina, ottava, scarto in cent.
     Un cent è un centesimo di semitono; l'orecchio allenato ne sente 5. */
  function noteFromFreq(freq) {
    if (!(freq > 0)) return null;
    const midiFloat = freqToMidi(freq);
    const midi = Math.round(midiFloat);
    const cents = Math.round((midiFloat - midi) * 100 * 10) / 10;
    const pc = ((midi % 12) + 12) % 12;   // classe di altezza, sempre 0..11
    return {
      midi,
      cents,                               // negativo = calante, positivo = crescente
      octave: Math.floor(midi / 12) - 1,   // convenzione scientifica: Do centrale = C4
      pitchClass: pc,
      name: { it: NOTE_NAMES.it[pc], en: NOTE_NAMES.en[pc] },
      sci: NOTE_NAMES.en[pc] + (Math.floor(midi / 12) - 1),
      refFreq: midiToFreq(midi)             // dove dovrebbe stare la nota giusta
    };
  }

  /* Distanza in cent fra due frequenze: serve al filtro mediano e ai test. */
  function centsBetween(f1, f2) {
    return 1200 * Math.log2(f1 / f2);
  }

  /* --------------------------------------------------------------- YIN core */
  /* Perché YIN e non la FFT: una FFT a 8192 campioni su 44,1 kHz ha bin da
     5,4 Hz, mentre Mi2 (82,41) e Fa2 (87,31) distano meno di 5 Hz. Nel dominio
     del tempo invece si misura il periodo, e l'interpolazione lo raffina sotto
     il singolo campione. */

  /* Passo 1 — funzione differenza.
     Per ogni ritardo tau, quanto il segnale assomiglia a se stesso spostato
     di tau campioni. Se il suono ha periodo tau, la differenza crolla a zero. */
  function differenceFunction(buf, W, tauMax) {
    const d = new Float32Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < W; j++) {
        const delta = buf[j] - buf[j + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }
    return d;
  }

  /* Passo 2 — normalizzazione con media cumulativa.
     La differenza grezza vale zero anche a tau = 0 e tende a scendere sui tau
     grandi: senza questo passo l'algoritmo sceglierebbe sempre l'ottava sotto.
     Dividere per la media dei valori fin lì rimette tutto in scala. */
  function cumulativeMeanNormalized(d) {
    const n = d.length;
    const dp = new Float32Array(n);
    dp[0] = 1;
    let running = 0;
    for (let tau = 1; tau < n; tau++) {
      running += d[tau];
      dp[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
    }
    return dp;
  }

  /* Passo 3 — soglia assoluta.
     Si prende il PRIMO avvallamento sotto soglia, non il più profondo: è la
     mossa che evita l'errore di ottava, perché il periodo vero viene sempre
     prima dei suoi multipli. Poi si scende fino in fondo a quell'avvallamento. */
  function pickTau(dp, tauMin, tauMax, threshold, reject) {
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (dp[tau] < threshold) {
        while (tau + 1 <= tauMax && dp[tau + 1] < dp[tau]) tau++;
        return tau;
      }
    }
    /* Nessun avvallamento sotto soglia: ripiego sul minimo globale, ma solo
       se è abbastanza profondo. Altrimenti è rumore e si dichiara forfait. */
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (dp[tau] < dp[best]) best = tau;
    return dp[best] < reject ? best : -1;
  }

  /* Passo 4 — interpolazione parabolica.
     Il minimo cade fra due campioni. Passando una parabola per i tre punti
     attorno al minimo si stima dove sta davvero il vertice: è ciò che porta
     l'errore da qualche decina di cent a meno di uno. */
  function refineTau(dp, tau) {
    const x0 = tau > 1 ? tau - 1 : tau;
    const x2 = tau + 1 < dp.length ? tau + 1 : tau;
    if (x0 === tau) return dp[tau] <= dp[x2] ? tau : x2;
    if (x2 === tau) return dp[tau] <= dp[x0] ? tau : x0;
    const s0 = dp[x0], s1 = dp[tau], s2 = dp[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    return denom === 0 ? tau : tau + (s2 - s0) / denom;
  }

  /* Volume efficace del blocco: serve solo a distinguere il silenzio. */
  function rms(buf, W) {
    let sum = 0;
    for (let i = 0; i < W; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / W);
  }

  /* L'analisi completa di un blocco di campioni.
     È volutamente una funzione pura: stessi campioni, stesso risultato, sempre.
     Microfono, oscillatore e file WAV entrano tutti da qui. */
  function detectPitch(buf, sampleRate, opts) {
    const cfg = Object.assign({}, CFG, opts || {});
    const W = Math.min(cfg.window, buf.length - cfg.tauMax);
    const level = rms(buf, W);

    if (W < 256) return { freq: 0, clarity: 0, rms: level, tau: -1, note: null, reason: "buffer corto" };
    if (level < cfg.rmsGate) return { freq: 0, clarity: 0, rms: level, tau: -1, note: null, reason: "silenzio" };

    const d  = differenceFunction(buf, W, cfg.tauMax);
    const dp = cumulativeMeanNormalized(d);
    const tau = pickTau(dp, cfg.tauMin, cfg.tauMax, cfg.threshold, cfg.reject);

    if (tau < 0) return { freq: 0, clarity: 0, rms: level, tau: -1, note: null, reason: "nessun periodo" };

    const tauRefined = refineTau(dp, tau);
    const freq = sampleRate / tauRefined;
    return {
      freq,
      clarity: 1 - dp[tau],     // 1 = periodo perfetto, 0 = rumore puro
      rms: level,
      tau: tauRefined,
      note: noteFromFreq(freq),
      reason: null
    };
  }

  /* ------------------------------------------------- stabilizzazione a video */
  /* Il motore misura bene ma ogni singola lettura balla: la corda pizzicata ha
     armonici disallineati, le corde vicine risuonano, il decadimento cambia il
     segnale sotto l'analisi. Su una lettura sola l'ago non sta fermo abbastanza
     per accordare. Qui si trasforma la sequenza di letture in un valore leggibile,
     in quattro difese in fila. */
  function medianOf(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    return s[(s.length - 1) >> 1];
  }

  function makeStabiliser(opts) {
    const cfg = Object.assign({}, CFG, opts || {});
    let history = [];   // letture accettate, in ordine di arrivo
    let value = 0;      // la stima mostrata
    let miss = 0;       // fotogrammi consecutivi senza una lettura utilizzabile
    let pending = [];   // letture che contraddicono la stima: candidate a una nota nuova

    function reset() { history = []; value = 0; miss = 0; pending = []; }

    return function push(freq, clarity) {
      /* Difesa 1 — la soglia di fiducia.
         Una lettura poco chiara è peggio di nessuna lettura: la si scarta senza
         nemmeno pesarla. Se il silenzio dura, si azzera; ma per qualche decimo di
         secondo si tiene l'ultimo valore buono, perché la coda di una corda che
         si spegne non deve far sparire il numero mentre lo stai leggendo. */
      if (!(freq > 0) || clarity < cfg.minClarity) {
        if (++miss > cfg.holdFrames) reset();
        return value;
      }
      miss = 0;

      /* Difesa 2 — l'aggancio.
         Prima di dichiarare una nota servono più letture d'accordo fra loro.
         Impedisce che il transiente della pennata — dove l'altezza non è ancora
         definita — venga mostrato come se fosse una misura. */
      if (!value) {
        history.push(freq);
        if (history.length > cfg.lockFrames) history.shift();
        if (history.length === cfg.lockFrames) {
          const m = medianOf(history);
          if (history.every(f => Math.abs(centsBetween(f, m)) < cfg.lockSpread)) value = m;
        }
        return value;
      }

      /* Difesa 3 — chi contraddice deve insistere.
         Una lettura lontana dalla nota agganciata o è un errore isolato, o hai
         cambiato corda. Le due cose si distinguono da sole: l'errore capita una
         volta e viene buttato, il cambio di corda si ripete e riaggancia. */
      if (Math.abs(centsBetween(freq, value)) > cfg.jumpCents) {
        pending.push(freq);
        if (pending.length >= cfg.lockFrames) {
          const m = medianOf(pending);
          if (pending.every(f => Math.abs(centsBetween(f, m)) < cfg.lockSpread)) {
            value = m; history = [m];
          }
          pending = [];
        }
        return value;
      }
      pending = [];

      /* Difesa 4 — mediana, poi inseguimento a passo variabile.
         La mediana toglie lo sbandamento isolato senza il ritardo di una media.
         L'inseguimento poi avvicina il valore mostrato al bersaglio: piano
         quando siamo già lì (l'ago sta fermo e si legge), in fretta quando il
         bersaglio si sposta davvero (giri la chiavetta e l'ago ti segue). */
      history.push(freq);
      if (history.length > cfg.medianLen) history.shift();
      const target = medianOf(history);

      const gap = Math.abs(centsBetween(target, value));
      const step = Math.min(cfg.smoothMax, Math.max(cfg.smoothMin, gap / cfg.smoothSpan));
      value = value + (target - value) * step;
      return value;
    };
  }

  /* --------------------------------------------------- nota di riferimento */
  /* Il verso opposto dell'accordatore: invece di ascoltare la corda, suona la
     nota giusta perché la si possa inseguire a orecchio. La frequenza è quella
     esatta, calcolata dal numero MIDI: nessuna tabella, nessun campione audio
     da scaricare.

     Un seno puro suona sottile e fa fatica a farsi sentire accanto a una corda.
     Sommando qualche armonico con ampiezza calante si ottiene un timbro pieno
     e riconoscibile, che resta comunque un tono elettronico e non finge di
     essere una chitarra. */
  const TONE_HARMONICS = [1, 0.5, 0.26, 0.13, 0.06];

  let toneCtx = null, toneStop = null;

  function stopReference() {
    if (!toneStop) return;
    const fn = toneStop; toneStop = null; fn();
  }

  function playReference(midi, opts) {
    const o = Object.assign({ seconds: 6, gain: 0.22, onEnd: null }, opts || {});
    stopReference();                       // una nota alla volta
    if (!toneCtx) toneCtx = new (root.AudioContext || root.webkitAudioContext)();
    if (toneCtx.state === "suspended") toneCtx.resume();

    const ctx = toneCtx, t0 = ctx.currentTime, freq = midiToFreq(midi);
    const out = ctx.createGain();

    /* L'inviluppo non è un vezzo: far partire e fermare un oscillatore di colpo
       produce uno scatto secco, perché l'onda salta da zero al suo valore. Venti
       millisecondi di rampa lo tolgono. */
    const attack  = 0.02;
    const release = Math.min(0.3, Math.max(0.04, o.seconds * 0.25));
    const end     = t0 + Math.max(o.seconds, attack + release + 0.02);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(o.gain, t0 + attack);
    out.gain.setValueAtTime(o.gain, end - release);   // tiene, poi rilascia
    out.gain.linearRampToValueAtTime(0.0001, end);
    out.connect(ctx.destination);

    const oscs = TONE_HARMONICS.map((a, i) => {
      const osc = ctx.createOscillator(); osc.frequency.value = freq * (i + 1);
      const g = ctx.createGain(); g.gain.value = a;
      osc.connect(g); g.connect(out);
      osc.start(t0); osc.stop(end + 0.02);
      return osc;
    });

    let done = false;
    const finish = (silenzia) => {
      if (done) return; done = true;
      if (timer) { clearTimeout(timer); }
      if (silenzia) {
        /* Chiusura anticipata: stessa rampa, per lo stesso motivo di prima. */
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0.0001, now + 0.04);
        oscs.forEach(osc => { try { osc.stop(now + 0.06); } catch (e) {} });
      }
      setTimeout(() => { try { out.disconnect(); } catch (e) {} }, 120);
      if (toneStop === fnStop) toneStop = null;
      if (o.onEnd) o.onEnd();
    };
    const fnStop = () => finish(true);
    const timer = setTimeout(() => finish(false), (end - t0 + 0.05) * 1000);

    toneStop = fnStop;
    return freq;
  }

  function isPlaying() { return !!toneStop; }

  /* ------------------------------------------------------------- microfono */

  let ctx = null, stream = null, node = null, analyser = null;
  let timer = null, raf = null, lastAt = 0;
  let frame = null, stabilise = null, running = false;
  let mode = "pitch";                 // "pitch" = accordatore · "chord" = accordi
  let atteso = null;                  // cosa il sito ha chiesto di suonare
  let watcher = null;
  const callbacks = [], chordCallbacks = [];

  function onDetect(cb) {
    if (typeof cb === "function") callbacks.push(cb);
    return () => { const i = callbacks.indexOf(cb); if (i >= 0) callbacks.splice(i, 1); };
  }

  function emit(result) { for (const cb of callbacks) cb(result); }

  function onChord(cb) {
    if (typeof cb === "function") chordCallbacks.push(cb);
    return () => { const i = chordCallbacks.indexOf(cb); if (i >= 0) chordCallbacks.splice(i, 1); };
  }

  /* Cosa aspettarsi: la diteggiatura richiesta e l'elenco dei candidati fra cui
     cercare i rivali. Il sito ha già tutto in CH: glielo passa e basta. */
  function expectChord(spec) { atteso = spec || null; watcher = makeChordWatcher(); }

  /* L'ascolto degli accordi, come macchina a stati pura.

     Dal vivo non si può fare quello che fa il banco di prova: lì il file è tutto
     lì, e il segmentatore guarda avanti per decidere dove finisce una pennata.
     Qui esiste solo il passato — l'AnalyserNode tiene gli ultimi 0,68 secondi e
     nient'altro. Quindi si ribalta la logica: si riconosce un attacco, poi si
     lascia scorrere il tempo finché la memoria non contiene esattamente il
     tratto su cui sono state tarate le misure.

     È una funzione senza mondo attorno — le entrano campioni, un orologio e cosa
     ci si aspetta, le escono eventi — proprio perché così si può provare sulle
     registrazioni invece che solo con la chitarra in mano. */
  function makeChordWatcher(opts) {
    const cfg = Object.assign({}, CFG, opts || {});
    let base = 0, attesaFino = 0, fermoFino = 0;

    return function push(frame, sampleRate, now, richiesto) {
      /* Livello degli ultimi 50 ms: il presente, non la media di tutto. */
      const coda = Math.min(frame.length, Math.floor(sampleRate * 0.05));
      let somma = 0;
      for (let i = frame.length - coda; i < frame.length; i++) somma += frame[i]*frame[i];
      const rms = Math.sqrt(somma / coda);

      /* Rumore di fondo inseguito dal basso: scende in fretta verso il silenzio,
         sale piano. Così l'attacco si misura rispetto a com'era la stanza un
         attimo fa, invece che rispetto a una soglia fissa che in un'altra stanza
         sarebbe sbagliata. */
      base = base === 0 ? rms : (rms < base ? base*0.85 + rms*0.15 : base*0.995 + rms*0.005);

      if (attesaFino) {
        if (now < attesaFino) return null;
        attesaFino = 0;
        fermoFino = now + cfg.chordHoldMs;
        const ch = chromaAverage(frame, sampleRate,
                                 { size: 16384, windows: cfg.chordWindows, hopMs: cfg.chordHopMs });
        const esito = richiesto
          ? verifyChord(ch, richiesto.frets, richiesto.candidates || [])
          : { ok: false, score: 0, reason: "nessun accordo richiesto" };
        esito.chroma = ch;
        esito.sym = richiesto ? richiesto.sym : null;
        esito.rms = rms;
        return esito;
      }

      if (now < fermoFino) return null;                 // pausa dopo un verdetto
      if (rms > cfg.chordGate && rms > base * cfg.chordRise) {
        attesaFino = now + cfg.chordWaitMs;
        return { attacco: true, rms: rms };
      }
      return null;
    };
  }

  /* L'adattatore: prende i campioni freschi dall'AnalyserNode e li passa alla
     macchina a stati. Tutto ciò che decide sta di sopra, qui non c'è logica. */
  function analyseChordFrame(now) {
    if (!watcher) watcher = makeChordWatcher();
    analyser.getFloatTimeDomainData(frame);
    const evento = watcher(frame, ctx.sampleRate, now, atteso);
    if (evento) for (const cb of chordCallbacks) cb(evento);
  }

  /* Il ritmo dell'analisi.
     requestAnimationFrame invece di setTimeout per una ragione precisa: quando
     la pagina finisce in secondo piano, rAF si ferma del tutto, mentre setTimeout
     viene solo rallentato a un giro al secondo — cioè continua a consumare.
     Il fotogramma dello schermo va a 60 Hz e a noi ne bastano 20: si contano i
     millisecondi e si saltano i giri di troppo. */
  function schedule() {
    if (!running) return;
    if (typeof root.requestAnimationFrame === "function") {
      raf = root.requestAnimationFrame(now => {
        if (!running) return;
        if (now - lastAt >= CFG.intervalMs) { lastAt = now; analyseFrame(now); }
        else schedule();
      });
    } else {
      timer = setTimeout(analyseFrame, CFG.intervalMs);   // ambienti senza rAF (test)
    }
  }

  /* start() si chiama SOLO da un gesto esplicito dell'utente: il permesso
     microfono chiesto all'apertura della pagina è un modo sicuro di farselo
     negare per sempre. */
  async function start(opts) {
    if (running) return true;
    /* Con echoCancellation disattivata l'altoparlante rientra dritto nel
       microfono: se restassero accesi insieme, l'accordatore accorderebbe la
       propria nota di riferimento. Le due cose si escludono a vicenda. */
    stopReference();
    const o = Object.assign({ filter: true, source: null, mode: "pitch" }, opts || {});
    mode = o.mode;
    /* Per gli accordi il passa-basso dell'accordatore va tolto: lì gli armonici
       sono un disturbo, qui sono la materia prima del chroma. */
    if (mode === "chord") o.filter = false;

    ctx = new (root.AudioContext || root.webkitAudioContext)();
    if (ctx.state === "suspended") await ctx.resume();

    if (o.source) {
      /* Sorgente di prova. Si accetta una funzione che riceve il contesto e
         restituisce un nodo: gli OscillatorNode appartengono al contesto in cui
         nascono, e il contesto lo crea start(). */
      node = typeof o.source === "function" ? o.source(ctx) : o.source;
    } else {
      /* Le tre elaborazioni disattivate sono pensate per la voce al telefono:
         inseguono il parlato, comprimono il livello e mangiano gli armonici.
         Su una chitarra falsano tutto quello che stiamo per misurare. */
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      node = ctx.createMediaStreamSource(stream);
    }

    analyser = ctx.createAnalyser();
    analyser.fftSize = mode === "chord" ? CFG.chordSize : CFG.fftSize;

    if (o.filter) {
      /* Passa-alto: via il rombo di rete e il rumore di maneggio sotto le corde.
         Passa-basso a 900 Hz: gli armonici alti di una corda vera non sono multipli
         esatti della fondamentale (inarmonicità), e trascinano la lettura verso
         l'acuto. Tagliarli riduce la deriva misurata da 3,7 a 2,0 cent sul Mi
         basso simulato. La fondamentale più acuta che ci interessa è il Mi4 a
         329,6 Hz: sotto i 900 Hz c'è spazio abbondante.
         Al punto 2 (accordi) questo ramo va escluso, perché lì gli armonici
         servono a costruire il chroma. */
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 55;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass";  lp.frequency.value = 900;
      node.connect(hp); hp.connect(lp); lp.connect(analyser);
    } else {
      node.connect(analyser);
    }

    frame  = new Float32Array(analyser.fftSize);
    stabilise = makeStabiliser(o.stabiliser);
    running = true;
    lastAt = 0; watcher = null;
    analyseFrame();
    return true;
  }

  /* stop() chiude davvero il microfono: finché una traccia resta viva, Android
     tiene acceso l'indicatore e il consumo. */
  function stop() {
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (raf !== null && typeof root.cancelAnimationFrame === "function") { root.cancelAnimationFrame(raf); raf = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    try { if (node) node.disconnect(); } catch (e) {}
    try { if (analyser) analyser.disconnect(); } catch (e) {}
    if (ctx && ctx.state !== "closed") ctx.close();
    ctx = null; node = null; analyser = null; frame = null; stabilise = null;
  }

  function isRunning() { return running; }

  /* ------------------------------------------------------------ accordi ---- */
  /* Punto 2 della roadmap. Il problema non è "che accordo è?" ma "quello suonato
     è il Do che ho chiesto?": l'app sa già cosa ha chiesto, e rispondere sì/no a
     una domanda precisa è molto più affidabile che indovinare a insieme aperto.

     Lo strumento è il vettore chroma: dodici numeri, uno per nota della scala
     cromatica, che dicono quanta energia c'è su ciascuna indipendentemente
     dall'ottava. Un Do suonato grave o acuto dà lo stesso chroma, ed è proprio
     quello che serve: un accordo è un insieme di note, non di frequenze. */

  const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];   // Mi La Re Sol Si Mi, in MIDI

  /* Trasformata di Fourier veloce, iterativa, in loco. Quaranta righe invece di
     una libreria: è l'unico modo di rispettare il vincolo "nessuna dipendenza",
     e per potenze di due l'algoritmo è questo da sessant'anni. */
  function fft(re, im) {
    const n = re.length;
    /* Riordino a bit invertiti: la ricorsione pari/dispari di Cooley-Tukey,
       srotolata, corrisponde a leggere gli indici con i bit al contrario. */
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      const mezzo = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < mezzo; j++) {
          const ur = re[i+j], ui = im[i+j];
          const vr = re[i+j+mezzo]*cr - im[i+j+mezzo]*ci;
          const vi = re[i+j+mezzo]*ci + im[i+j+mezzo]*cr;
          re[i+j] = ur + vr;       im[i+j] = ui + vi;
          re[i+j+mezzo] = ur - vr; im[i+j+mezzo] = ui - vi;
          const ncr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = ncr;
        }
      }
    }
  }

  /* Ampiezza dello spettro attorno a una frequenza. Si prende il massimo dei tre
     bin vicini invece del valore esatto: una corda leggermente scordata cade fra
     due bin, e chiedere il bin esatto la farebbe sparire. */
  function magAt(mag, freq, sampleRate, n) {
    const bin = Math.round(freq * n / sampleRate);
    if (bin < 1 || bin >= mag.length - 1) return 0;
    return Math.max(mag[bin-1], mag[bin], mag[bin+1]);
  }

  function normalizza(v) {
    let max = 0;
    for (let i = 0; i < v.length; i++) if (v[i] > max) max = v[i];
    if (max > 0) for (let i = 0; i < v.length; i++) v[i] /= max;
    return v;
  }

  /* Il chroma con somma armonica.
     La versione ingenua guarda lo spettro e mette ogni riga nella sua casella:
     su una chitarra non funziona, perché gli armonici sono forti e mentono. Il
     terzo armonico di un Do è un Sol, il quinto è un Mi: un Do da solo produce
     un chroma che somiglia a un accordo di Do maggiore anche se la terza e la
     quinta non le hai suonate.

     La cura è invertire il ragionamento: invece di chiedere "questa riga di che
     nota è?", si chiede per ogni nota possibile "quanta energia c'è dove
     dovrebbero stare la sua fondamentale e i suoi armonici?". Un armonico
     estraneo contribuisce alla nota di cui è armonico, non alla propria. */
  function chroma(buf, sampleRate, opts) {
    const o = Object.assign({ size: 16384, minMidi: 40, maxMidi: 88,
                              harmonics: 5, decay: 0.6,
                              voices: 8, suppress: 1.0 }, opts || {});
    const n = o.size;
    const re = new Float64Array(n), im = new Float64Array(n);
    const N = Math.min(n, buf.length);
    /* Finestra di Hann: tagliare di netto un pezzo di suono equivale a
       moltiplicarlo per un rettangolo, e un rettangolo nello spettro è una
       sbavatura che sporca tutti i bin. La campana la evita. */
    for (let i = 0; i < N; i++) re[i] = buf[i] * (0.5 - 0.5*Math.cos(2*Math.PI*i/(N-1)));
    fft(re, im);

    const mag = new Float64Array(n >> 1);
    for (let k = 0; k < mag.length; k++) mag[k] = Math.sqrt(re[k]*re[k] + im[k]*im[k]);

    /* Quanta prova c'è che questa nota sia stata suonata: la sua fondamentale
       più i suoi armonici, pesati sempre meno via via che salgono. */
    const salienza = (spettro, midi) => {
      const f0 = midiToFreq(midi);
      let e = 0;
      for (let h = 1; h <= o.harmonics; h++) {
        e += Math.pow(o.decay, h-1) * magAt(spettro, f0*h, sampleRate, n);
      }
      return e;
    };

    const out = new Float32Array(12);

    if (!o.voices) {
      /* Somma diretta: ogni nota si prende la sua prova, e chi se ne importa se
         quella prova è l'armonico di qualcun altro. È il modo semplice, ed è
         quello che confonde il Sol7 col Solmaj7. */
      for (let midi = o.minMidi; midi <= o.maxMidi; midi++) out[((midi%12)+12)%12] += salienza(mag, midi);
      return normalizza(out);
    }

    /* Sbucciatura iterativa.
       Il difetto della somma diretta è che l'energia a 3·f viene contata due
       volte: come prova della nota f (giusto, è il suo armonico) e come prova
       della nota che sta a 3·f (sbagliato, lì non c'è nessuno). Su una chitarra
       questo produce Si fantasma sopra ogni Mi e Fa♯ fantasma sopra ogni Re —
       esattamente le note che distinguono gli accordi che si confondono.

       La cura: si trova la nota più sostenuta, la si registra, e si **toglie
       dallo spettro** tutto ciò che quella nota spiega. Chi resta, resta perché
       c'è davvero.

       Due numeri tarati sulle registrazioni, non scelti a occhio: otto giri
       (oltre non migliora più) e soppressione piena. Toglierne solo una parte
       lascia in giro abbastanza fantasma da confondere ancora. */
    const lavoro = Float64Array.from(mag);
    for (let v = 0; v < o.voices; v++) {
      let vincente = -1, forza = 0;
      for (let midi = o.minMidi; midi <= o.maxMidi; midi++) {
        const s = salienza(lavoro, midi);
        if (s > forza) { forza = s; vincente = midi; }
      }
      if (vincente < 0 || forza <= 0) break;
      out[((vincente % 12) + 12) % 12] += forza;
      const f0 = midiToFreq(vincente);
      for (let h = 1; h <= o.harmonics; h++) {
        const bin = Math.round(f0 * h * n / sampleRate);
        for (let d = -1; d <= 1; d++) {
          if (bin+d >= 0 && bin+d < lavoro.length) lavoro[bin+d] *= (1 - o.suppress);
        }
      }
    }
    return normalizza(out);
  }

  /* Il profilo atteso di un accordo, calcolato dalla diteggiatura che il sito ha
     già in CH[sym].frets. Nessun dizionario di accordi scritto a mano: esiste
     già, e un secondo elenco vorrebbe solo dire due elenchi da tenere allineati. */
  function profileFromFrets(frets) {
    const out = new Float32Array(12);
    for (let i = 0; i < frets.length && i < 6; i++) {
      const f = frets[i];
      if (f === "x" || f === null || f === undefined) continue;   // corda muta
      const midi = OPEN_STRINGS[i] + (+f);
      out[((midi % 12) + 12) % 12] += 1;
    }
    return normalizza(out);
  }

  /* Somiglianza coseno: l'angolo fra i due vettori, non la loro lunghezza.
     Serve proprio questo — che l'accordo suonato piano e quello suonato forte
     diano lo stesso risultato. 1 = stessa direzione, 0 = niente in comune. */
  function cosine(a, b) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < 12; i++) { ab += a[i]*b[i]; aa += a[i]*a[i]; bb += b[i]*b[i]; }
    return (aa === 0 || bb === 0) ? 0 : ab / Math.sqrt(aa*bb);
  }

  /* -------------------------------------------------- verifica dell'accordo */
  /* Qui si risponde alla domanda del prodotto: "quello suonato è il Fa che ho
     chiesto?". Due difese, perché due sono i modi di sbagliare.

     La soglia da sola è cieca sui vicini: il Fa minore prende un punteggio alto
     sul profilo del Fa, perché due note su tre le hanno in comune. Il confronto
     da solo è cieco sul nonsenso: un rumore qualsiasi somiglia più al Fa che al
     Fa minore, e passerebbe. Servono insieme. */

  /* Media del chroma su più finestre lungo la nota.
     Una finestra sola coglie un istante: la pennata non attacca tutte le corde
     nello stesso momento, e nei primi decimi di secondo l'accordo è incompleto.
     Mediando lungo mezzo secondo si guarda l'accordo, non l'istante. */
  function chromaAverage(buf, sampleRate, opts) {
    const o = Object.assign({ size: 16384, windows: 4, hopMs: 120 }, opts || {});
    const hop = Math.floor(sampleRate * o.hopMs / 1000);
    const out = new Float32Array(12);
    let n = 0;
    for (let w = 0; w < o.windows; w++) {
      const inizio = w * hop;
      if (inizio + o.size > buf.length) break;
      const c = chroma(buf.subarray(inizio, inizio + o.size), sampleRate, o);
      for (let i = 0; i < 12; i++) out[i] += c[i];
      n++;
    }
    if (n === 0) return chroma(buf, sampleRate, o);   // materiale per una sola finestra
    for (let i = 0; i < 12; i++) out[i] /= n;
    return normalizza(out);
  }

  /* Due accordi sono distinguibili solo se ciascuno ha almeno una nota che
     l'altro non ha. Fa e Fam lo sono (La contro La bemolle). Do e Domaj7 no: il
     Do è tutto contenuto nel Domaj7, e l'unica prova sarebbe l'assenza del Si —
     che gli armonici del Do producono da soli. Dichiararlo, invece di dare una
     risposta che sembra sicura e non lo è. */
  function decidable(profA, profB) {
    let soloA = false, soloB = false;
    for (let i = 0; i < 12; i++) {
      if (profA[i] > 0 && profB[i] === 0) soloA = true;
      if (profB[i] > 0 && profA[i] === 0) soloB = true;
    }
    return soloA && soloB;
  }

  /* I rivali di un bersaglio: fra i candidati, quelli che si possono davvero
     distinguere da lui. Gli altri non sono avversari, sono ambiguità note. */
  function rivalsFrom(targetFrets, candidati) {
    const pt = profileFromFrets(targetFrets);
    const rivali = [], ambigui = [];
    candidati.forEach(c => {
      const pc = profileFromFrets(c.frets);
      if (cosine(pt, pc) > 0.999) return;              // stesse note: è lo stesso accordo
      (decidable(pt, pc) ? rivali : ambigui).push({ sym: c.sym, profile: pc });
    });
    return { rivali, ambigui };
  }

  /* Il verdetto. */
  function verifyChroma(ch, targetProfile, rivali, opts) {
    /* Tarati sulle 227 pennate registrate, non scelti a occhio: con questi due
       numeri accetta il 94,7% delle esecuzioni corrette, lo 0,1% dei rivali
       distinguibili e lo 0,2% del rumore. */
    const o = Object.assign({ floor: 0.72, margin: 0 }, opts || {});
    const score = cosine(ch, targetProfile);

    let sfidante = null;
    for (const r of rivali) {
      const s = cosine(ch, r.profile);
      if (!sfidante || s > sfidante.score) sfidante = { sym: r.sym, score: s };
    }

    const plausibile = score >= o.floor;                       // non è rumore
    const vince = !sfidante || score >= sfidante.score + o.margin;   // batte i vicini
    return {
      ok: plausibile && vince,
      score,
      rival: sfidante,
      margin: sfidante ? score - sfidante.score : null,
      reason: !plausibile ? "sotto la soglia di plausibilità"
            : !vince ? "somiglia di più a " + sfidante.sym
            : null
    };
  }

  /* Comodità: dalla diteggiatura al verdetto, per chi ha in mano CH e basta. */
  function verifyChord(ch, targetFrets, candidati, opts) {
    const { rivali, ambigui } = rivalsFrom(targetFrets, candidati || []);
    const esito = verifyChroma(ch, profileFromFrets(targetFrets), rivali, opts);
    esito.ambigui = ambigui.map(a => a.sym);   // ciò che questo metodo non può escludere
    return esito;
  }

  /* ------------------------------------------------------------- superficie */
  root.Listener = {
    start, stop, isRunning, onDetect, onChord, expectChord, makeChordWatcher,
    playReference, stopReference, isPlaying,
    detectPitch, makeStabiliser, chroma, chromaAverage, profileFromFrets, cosine,
    decidable, rivalsFrom, verifyChroma, verifyChord, OPEN_STRINGS,
    noteFromFreq, midiToFreq, freqToMidi, centsBetween,
    CFG, NOTE_NAMES, STRINGS
  };

})(typeof window !== "undefined" ? window : globalThis);
