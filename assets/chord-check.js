"use strict";
/* ==========================================================================
   <manico-chord-check> — verifica dell'accordo suonato

   COME SI USA
   -----------
   Una volta sola, in fondo a <body>:

       <script src="assets/listener.js" defer></script>
       <script src="assets/chord-check.js" defer></script>

   Poi, ovunque serva, una riga:

       <manico-chord-check chord="F"></manico-chord-check>

   ATTRIBUTI
       chord="F"    quale accordo chiedere (chiave di CH). Cambiarlo cambia il
                    bersaglio senza ricreare niente.
       once         smette di ascoltare dopo il primo esito corretto.
       compact      versione bassa, senza il simbolo grande.
       lang="en"    forza la lingua; se manca segue il sito.

   PROPRIETÀ E METODI
       el.chord = "Am"          cambia bersaglio
       el.start() / el.stop()   accende e spegne il microfono
       el.setChord(sym, frets, candidati)   per accordi fuori da CH

   EVENTI
       chord-attack   detail {}                       ha sentito una pennata
       chord-result   detail {ok, score, rival, reason, sym}
       chord-error    detail {name}                   microfono negato o assente

   DA SAPERE
   - Il microfono si apre solo su tocco dell'utente e si chiude da solo quando
     l'elemento esce dalla pagina o la pagina va in secondo piano.
   - Il dizionario degli accordi lo trova da sé: usa CH di index.html se c'è.
   - I colori arrivano dai token del sito (var(--accent) e compagnia) con un
     ripiego per chi lo monta altrove: eredita i temi senza saperne nulla.
   ========================================================================== */
(function () {

  /* Le stringhe stanno qui e non in I18N perché questo componente deve poter
     essere aggiornato senza toccare index.html — è il motivo per cui esiste.
     Sono comunque in entrambe le lingue e passano da un unico punto, come la
     regola del progetto chiede; se un giorno si spostano in I18N basta far
     puntare t() lì. */
  const STR = {
    it: { listen:"Ascolta", stop:"Ferma", idle:"Tocca «Ascolta», poi suona",
          listening:"In ascolto…", heard:"Sentito", checking:"Controllo…",
          ok:"è giusto", rival:"sembra piuttosto {r}", weak:"non l'ho capito, riprova",
          denied:"Microfono negato: puoi consentirlo dalle impostazioni del browser.",
          nomic:"Il microfono richiede una connessione sicura (https).",
          nodevice:"Nessun microfono collegato.",
          busy:"Microfono occupato da un'altra scheda o applicazione. Chiudila e riprova.",
          failed:"Il microfono non si è aperto ({e}).",
          unknown:"Accordo sconosciuto: {s}", play:"Suona" },
    en: { listen:"Listen", stop:"Stop", idle:"Tap “Listen”, then play",
          listening:"Listening…", heard:"Heard", checking:"Checking…",
          ok:"that's right", rival:"sounds more like {r}", weak:"didn't catch that, try again",
          denied:"Microphone denied: you can allow it in your browser settings.",
          nomic:"The microphone needs a secure connection (https).",
          nodevice:"No microphone connected.",
          busy:"Microphone busy in another tab or app. Close it and try again.",
          failed:"The microphone didn't open ({e}).",
          unknown:"Unknown chord: {s}", play:"Play" }
  };

  const CSS = `
    :host{display:block;font-family:Roboto,system-ui,-apple-system,sans-serif;
      color:var(--body,#39424e)}
    .box{background:var(--surface,#fff);border:1px solid var(--line,#dbe3ec);
      border-radius:var(--r,20px);box-shadow:var(--shadow,0 1px 2px rgba(10,22,40,.06));
      padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px}
    .lab{font-family:"Roboto Mono",ui-monospace,monospace;font-size:11px;font-weight:600;
      letter-spacing:.18em;text-transform:uppercase;color:var(--accent-2,#2b7ea8)}
    .sym{font-family:"Roboto",system-ui,sans-serif;font-weight:700;line-height:1;
      font-size:clamp(38px,12vw,54px);color:var(--text,#0a0d12);letter-spacing:-.02em}
    :host([compact]) .sym{font-size:26px}
    :host([compact]) .box{flex-direction:row;gap:14px;padding:12px 14px}
    :host([compact]) .lab{display:none}
    .state{font-size:13.5px;color:var(--dim,#6d7986);text-align:center;min-height:20px;flex:1}
    .state.ok{color:var(--accent-deep,#0f4d9e);font-weight:600}
    .state.no{color:var(--danger,#c8372d)}
    .dots{display:flex;gap:5px;height:8px;align-items:center}
    .dots i{width:7px;height:7px;border-radius:50%;background:var(--line,#dbe3ec);
      transition:background .18s,transform .18s}
    .dots i.on{background:var(--accent,#1667d1);transform:scale(1.25)}
    button{font:inherit;font-weight:600;font-size:15px;cursor:pointer;
      width:100%;max-width:300px;min-height:46px;padding:12px 16px;border:0;border-radius:14px;
      background:var(--accent,#1667d1);color:#fff;transition:.15s}
    :host([compact]) button{width:auto;font-size:13.5px;min-height:44px;padding:10px 14px}
    button[data-on="true"]{background:var(--surface,#fff);color:var(--body,#39424e);
      border:1px solid var(--line,#dbe3ec)}
    button:active{transform:translateY(1px)}
    button:focus-visible{outline:2px solid var(--accent,#1667d1);outline-offset:2px}
    @media (prefers-reduced-motion:reduce){ .dots i{transition:none} }
  `;

  /* Il dizionario del sito, se c'è. Non è un requisito: si può sempre passare
     la diteggiatura a mano con setChord(). */
  function dizionario() {
    try { return (typeof CH !== "undefined" && CH) ? CH : null; } catch (e) { return null; }
  }
  function candidatiDa(dic) {
    return dic ? Object.keys(dic).map(k => ({ sym: k, frets: dic[k].frets })) : [];
  }

  class ChordCheck extends HTMLElement {
    static get observedAttributes() { return ["chord", "lang"]; }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._root.innerHTML =
        `<style>${CSS}</style>
         <div class="box">
           <div style="text-align:center">
             <div class="lab" part="label"></div>
             <div class="sym" part="symbol">—</div>
           </div>
           <div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
           <div class="state" part="state" role="status" aria-live="polite"></div>
           <button type="button" part="button"></button>
         </div>`;
      this._sym = null; this._frets = null; this._candidati = null;
      this._on = false; this._sganciaEsito = null; this._pulsante = this._q("button");
      this._pulsante.addEventListener("click", () => this._on ? this.stop() : this.start());
      this._suPagina = () => { if (document.hidden) this.stop(); };
    }

    _q(sel) { return this._root.querySelector(sel); }
    _t(k, sost) {
      const lingua = this.getAttribute("lang")
        || (typeof S !== "undefined" && S && S.lang)
        || (document.documentElement.lang || "it").slice(0, 2);
      const tab = STR[lingua] || STR.it;
      let v = tab[k] !== undefined ? tab[k] : STR.it[k];
      if (sost) for (const k2 in sost) v = v.replace("{" + k2 + "}", sost[k2]);
      return v;
    }

    connectedCallback() {
      if (!this.hasAttribute("chord") && !this._sym) this._disegna();
      else this.chord = this.getAttribute("chord") || this._sym;
      document.addEventListener("visibilitychange", this._suPagina);
    }
    disconnectedCallback() {
      /* Sparire dalla pagina deve spegnere il microfono: un componente che
         continua ad ascoltare dopo essere stato rimosso è una perdita, e su un
         telefono è anche una spia accesa che non si spiega. */
      this.stop();
      document.removeEventListener("visibilitychange", this._suPagina);
    }
    attributeChangedCallback(nome, prima, dopo) {
      if (prima === dopo) return;
      if (nome === "chord") this.chord = dopo;
      if (nome === "lang") this._disegna();
    }

    get chord() { return this._sym; }
    set chord(sym) {
      const dic = dizionario();
      if (!sym) { this._sym = null; return this._disegna(); }
      if (dic && dic[sym]) this.setChord(sym, dic[sym].frets, candidatiDa(dic));
      else { this._sym = sym; this._frets = null; this._stato(this._t("unknown", { s: sym }), "no"); }
    }

    /* Per accordi che nel dizionario non ci sono ancora. */
    setChord(sym, frets, candidati) {
      this._sym = sym; this._frets = frets; this._esitoMostrato = false;
      this._candidati = candidati || candidatiDa(dizionario());
      if (window.Listener && this._on) {
        window.Listener.expectChord({ sym: this._sym, frets: this._frets, candidates: this._candidati });
      }
      this._disegna();
    }

    _disegna() {
      const dic = dizionario();
      this._q(".lab").textContent = this._t("play");
      this._q(".sym").textContent = (dic && this._sym && dic[this._sym] && dic[this._sym].sym) || this._sym || "—";
      this._pulsante.textContent = this._on ? this._t("stop") : this._t("listen");
      this._pulsante.setAttribute("data-on", String(this._on));
      /* Un esito appena mostrato non si cancella ridisegnando: con once, fermarsi
         dopo la risposta giusta cancellerebbe proprio il messaggio che l'utente
         stava aspettando. */
      if (!this._on && !this._esitoMostrato) this._stato(this._t("idle"));
    }
    _stato(testo, classe) {
      const el = this._q(".state");
      el.textContent = testo; el.className = "state" + (classe ? " " + classe : "");
    }
    _puntini(n) {
      this._root.querySelectorAll(".dots i").forEach((p, i) => p.classList.toggle("on", i < n));
    }

    /* start() accetta le stesse opzioni di Listener.start(): serve a me per
       provarlo su registrazioni, e al design per fare una demo senza chitarra
       passando {source: ...}. Senza argomenti apre il microfono. */
    async start(opzioni) {
      const L = window.Listener;
      /* navigator.mediaDevices manca solo fuori da un contesto sicuro: lì il
         messaggio sulla connessione è quello giusto, e solo lì. */
      if (!L || !navigator.mediaDevices) { this._stato(this._t("nomic"), "no"); return false; }
      if (!this._frets) { this._stato(this._t("unknown", { s: this._sym || "?" }), "no"); return false; }
      if (this._on) return true;

      if (!this._sganciaEsito) {
        this._sganciaEsito = L.onChord(ev => {
          if (!this._on) return;
          if (ev.attacco) { this._puntini(3); this._stato(this._t("checking")); 
                            this.dispatchEvent(new CustomEvent("chord-attack", {detail:{}, bubbles:true})); return; }
          this._mostra(ev);
        });
      }
      L.expectChord({ sym: this._sym, frets: this._frets, candidates: this._candidati });
      try {
        await L.start(Object.assign({ mode: "chord" }, opzioni || {}));  // il permesso si chiede qui, sul tocco
      } catch (err) {
        const nome = (err && err.name) || "Error";
        /* Un avvio annullato non è un guasto: qualcuno ha chiuso o fermato
           mentre chiedevamo il permesso. Si torna in silenzio allo stato di
           partenza, senza allarmare nessuno. */
        if (nome === "AbortError") { this._on = false; this._disegna(); return false; }
        this._stato(this._messaggioErrore(nome), "no");
        this.dispatchEvent(new CustomEvent("chord-error", { detail: { name: nome }, bubbles: true }));
        return false;
      }
      this._on = true; this._puntini(1); this._esitoMostrato = false;
      this._disegna(); this._stato(this._t("listening"));
      return true;
    }

    /* Dire la verità sul guasto. Il messaggio precedente dava la colpa alla
       connessione qualunque cosa fosse successa — e con la connessione a posto
       e il permesso concesso mandava a caccia della causa sbagliata. Quando il
       nome non è fra quelli noti, si mostra il nome: meglio una parola tecnica
       vera che una spiegazione inventata. */
    _messaggioErrore(nome) {
      if (nome === "NotAllowedError")  return this._t("denied");
      if (nome === "NotFoundError" || nome === "OverconstrainedError") return this._t("nodevice");
      if (nome === "NotReadableError" || nome === "TrackStartError") return this._t("busy");
      return this._t("failed", { e: nome });
    }

    stop() {
      if (window.Listener && this._on) window.Listener.stop();
      this._on = false; this._puntini(0); this._disegna();
    }

    _mostra(ev) {
      this._puntini(ev.ok ? 3 : 0);
      this._esitoMostrato = true;
      if (ev.ok) this._stato(this._t("heard") + " · " + this._t("ok"), "ok");
      else if (ev.rival && ev.reason && ev.reason.indexOf("somiglia") === 0)
        this._stato(this._t("rival", { r: ev.rival.sym }), "no");
      else this._stato(this._t("weak"));
      this.dispatchEvent(new CustomEvent("chord-result", {
        detail: { ok: ev.ok, score: ev.score, rival: ev.rival ? ev.rival.sym : null,
                  reason: ev.reason, sym: this._sym, ambigui: ev.ambigui },
        bubbles: true
      }));
      if (ev.ok && this.hasAttribute("once")) this.stop();
    }
  }

  if (!customElements.get("manico-chord-check")) customElements.define("manico-chord-check", ChordCheck);
})();
