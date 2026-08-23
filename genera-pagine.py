#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera una pagina statica per ogni accordo.

Perché esiste: l'applicazione costruisce tutto con JavaScript, quindi chi
scarica index.html senza eseguirlo vede una cinquantina di parole. Questo
script legge gli stessi dati che usa l'app (CH, DECKS, I18N dentro index.html)
e ne ricava pagine vere, che esistono anche senza JavaScript e che rispondono
ognuna a una domanda precisa: "come si fa il Fa maggiore".

Gira sul portatile, non sul telefono, e non aggiunge nulla a ciò che il
visitatore scarica. Lo lancia pubblica.sh prima di ogni pubblicazione, così il
generato non può scollarsi dalla sorgente.
"""
import json, os, re, shutil, sys, unicodedata
from datetime import date

BASE = "https://eddweddweddw.github.io/guitarchords"
QUI  = os.path.dirname(os.path.abspath(__file__))
SORGENTE = os.path.join(QUI, "index.html")
CARTELLA = os.path.join(QUI, "accordi")

# ---------------------------------------------------------------- lettura dati
def leggi_sorgente():
    return open(SORGENTE, encoding="utf-8").read()

def blocco(s, inizio, fine):
    a = s.index(inizio); b = s.index(fine, a)
    return s[a:b]

def leggi_accordi(s):
    """CH: chiave -> dizionario dell'accordo. Si legge riga per riga, che è come
    è scritto: un accordo per riga."""
    testo = blocco(s, "const CH = {", "const DECKS")
    accordi = {}
    for m in re.finditer(r'^  (\w+):\s*\{(.*)\},?$', testo, re.M):
        chiave, corpo = m.group(1), m.group(2)
        def campo(nome):
            mm = re.search(r'%s:"((?:[^"\\]|\\.)*)"' % nome, corpo)
            return mm.group(1) if mm else None
        def lista(nome):
            mm = re.search(r'%s:\[(.*?)\]' % nome, corpo)
            return [x.strip() for x in mm.group(1).split(",")]
        def bilingue(nome):
            mm = re.search(r'%s:\{it:"((?:[^"\\]|\\.)*)",en:"((?:[^"\\]|\\.)*)"\}' % nome, corpo)
            return {"it": mm.group(1), "en": mm.group(2)} if mm else None
        frets = [("x" if "'" in x else int(x)) for x in lista("frets")]
        accordi[chiave] = {
            "key": chiave, "sym": campo("sym"), "name": bilingue("name"),
            "frets": frets, "fingers": [int(x) for x in lista("fingers")],
            "deg": campo("deg"), "notes": bilingue("notes"),
        }
    return accordi

def leggi_insiemi(s):
    testo = blocco(s, "const DECKS = [", "\n];")
    insiemi = []
    for m in re.finditer(r'\{group:"(\w+)",\s*id:"(\w+)",\s*nm:\{it:"([^"]*)",en:"([^"]*)"\},\s*sb:\{it:"([^"]*)",en:"([^"]*)"\},\s*ch:\[(.*?)\]\}', testo):
        insiemi.append({"group": m.group(1), "id": m.group(2),
                        "nm": {"it": m.group(3), "en": m.group(4)},
                        "sb": {"it": m.group(5), "en": m.group(6)},
                        "ch": re.findall(r'"(\w+)"', m.group(7))})
    return insiemi

NOMI_CORDE = {"it": ["MI", "LA", "RE", "SOL", "SI", "mi"],
              "en": ["E", "A", "D", "G", "B", "e"]}

def ordinale(n, lang):
    if lang == "en":
        s = ["th", "st", "nd", "rd"]; v = n % 100
        return "%d%s" % (n, (s[(v - 20) % 10] if 0 <= (v-20) % 10 < 4 else None) or (s[v] if v < 4 else None) or s[0])
    return "%dª" % n

def leggi_teoria(s):
    """THEORY: una scheda per famiglia, con formula, testo e gradi."""
    testo = blocco(s, "const THEORY = [", "\n];")
    schede = []
    for m in re.finditer(r'\{ deckId:"(\w+)",(.*?)tones:\[(.*?)\] \}', testo, re.S):
        deck, corpo, toni = m.group(1), m.group(2), m.group(3)
        def lingua(l):
            mm = re.search(r'%s:\{eyebrow:"([^"]*)", title:"([^"]*)",\s*recipe:"((?:[^"\\]|\\.)*)",\s*sound:"((?:[^"\\]|\\.)*)"\}' % l, corpo, re.S)
            return {"eyebrow": mm.group(1), "title": mm.group(2),
                    "recipe": mm.group(3), "sound": mm.group(4)} if mm else None
        formula = re.findall(r"'([^']*)'", re.search(r'formula:\[(.*?)\]', corpo, re.S).group(1))
        schede.append({"deckId": deck, "formula": [re.sub(r'<[^>]*>', '', f) for f in formula],
                       "it": lingua("it"), "en": lingua("en"),
                       "gradi": re.findall(r"d:'([^']*)'", toni)})
    return schede

# ------------------------------------------------------------------ diagramma
def svg_accordo(c, lang="it"):
    """Ricalca svgChord di index.html. Ogni numero qui dentro deve restare
    uguale a quello: la verifica in fondo confronta i due risultati."""
    W, H, L, SP, TOP, FSP, N = 280, 286, 45, 38, 64, 46, 4
    xs = [L + i * SP for i in range(6)]
    tastati = [f for f in c["frets"] if isinstance(f, int) and f > 0]
    maxF = max(tastati) if tastati else 0
    minF = min(tastati) if tastati else 0
    start, capotasto = 1, True
    if maxF > 4:
        start, capotasto = minF, False
    rowY = lambda n: TOP + int((n - start + 0.5) * FSP)

    g = []
    for r in range(N + 1):
        y = TOP + r * FSP
        if r == 0 and capotasto:
            g.append('<line class="nut" x1="%d" y1="%d" x2="%d" y2="%d"/>' % (L - 2, y, xs[5] + 2, y))
        else:
            g.append('<line class="fret" x1="%d" y1="%d" x2="%d" y2="%d"/>' % (L, y, xs[5], y))
    cx = (xs[2] + xs[3]) // 2
    for r in range(N):
        if start + r in (3, 5, 7, 9, 15, 17):
            g.append('<circle class="inlay" cx="%d" cy="%d" r="7"/>' % (cx, TOP + int((r + 0.5) * FSP)))
    for i in range(6):
        g.append('<line class="string" style="stroke-width:%.2f" x1="%d" y1="%d" x2="%d" y2="%d"/>'
                 % (2.5 - i * 0.28, xs[i], TOP - (2 if capotasto else 0), xs[i], TOP + N * FSP))
    if not capotasto:
        g.append('<text class="fretlab" x="%d" y="%d" text-anchor="middle">%s</text>'
                 % (L - 16, rowY(start) + 4, ordinale(start, lang)))
    for i in range(6):
        g.append('<text class="slabel" x="%d" y="%d" text-anchor="middle">%s</text>'
                 % (xs[i], TOP + N * FSP + 22, NOMI_CORDE[lang][i]))

    mk = []
    y = TOP - 16
    for i in range(6):
        f = c["frets"][i]
        if f == "x":
            mk.append('<g><line class="xmark" x1="%d" y1="%d" x2="%d" y2="%d"/><line class="xmark" x1="%d" y1="%d" x2="%d" y2="%d"/></g>'
                      % (xs[i] - 5, y - 5, xs[i] + 5, y + 5, xs[i] + 5, y - 5, xs[i] - 5, y + 5))
        elif f == 0:
            mk.append('<circle class="omark" cx="%d" cy="%d" r="6"/>' % (xs[i], y))

    bars = []
    for fg in range(1, 5):
        idx = [i for i in range(6) if c["fingers"][i] == fg
               and isinstance(c["frets"][i], int) and c["frets"][i] > 0]
        if len(idx) >= 2:
            fr = c["frets"][idx[0]]
            if all(c["frets"][i] == fr for i in idx):
                a, b, yy = xs[min(idx)], xs[max(idx)], rowY(fr)
                bars.append('<rect class="barre" x="%d" y="%d" width="%d" height="26" rx="13"/>'
                            % (a - 13, yy - 13, b - a + 26))
    dots = []
    for i in range(6):
        f = c["frets"][i]
        if isinstance(f, int) and f > 0:
            yy = rowY(f)
            dots.append('<circle class="dot" cx="%d" cy="%d" r="13"/>' % (xs[i], yy))
            if c["fingers"][i] > 0:
                dots.append('<text class="dotnum" x="%d" y="%d">%d</text>' % (xs[i], yy + 5, c["fingers"][i]))

    return ('<svg viewBox="0 0 %d %d" role="img" aria-label="%s %s">\n'
            '    <g>%s</g>\n    <g class="markg">%s</g>\n    <g class="dotg">%s%s</g>\n  </svg>'
            % (W, H, "Chord diagram" if lang == "en" else "Diagramma accordo", c["sym"], "".join(g), "".join(mk), "".join(bars), "".join(dots)))

# ------------------------------------------------------------------- indirizzi
def sfilza(testo):
    t = unicodedata.normalize("NFKD", testo.replace("♯", "-diesis").replace("♭", "-bemolle"))
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return re.sub(r"-+", "-", t)

# --------------------------------------------------------------------- pagine
STILE = """  :root{
    --bg:#ece0c9;--bg-1:#f3e9d6;--bg-2:#e2d3b7;
    --vena-scura:rgba(120,86,44,.085);--vena-chiara:rgba(255,250,238,.22);
    --surface:#fff;--surface-2:#f3ece0;--line:#e3dccf;--grana:.30;
    --text:#14110b;--body:#443d32;--dim:#6a6152;--faint:#b3aa98;
    --accent:#1667d1;--accent-deep:#0f4d9e;--accent-soft:rgba(22,103,209,.10);
    --accent-2:#2b7ea8;--danger:#c8372d;
    --diagram-line:#d3cdc0;--diagram-string:#9c9486;
    --shadow:0 14px 32px -18px rgba(10,22,40,.20);--r:20px;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --bg:#241609;--bg-1:#31200f;--bg-2:#170d04;
    --vena-scura:rgba(8,4,1,.26);--vena-chiara:rgba(168,120,72,.085);
    --surface:#1b1610;--surface-2:#241d15;--line:#33291e;--grana:.22;
    --text:#f6f1e6;--body:#c4bbaa;--dim:#8f8574;--faint:#635b4c;
    --accent:#5c96f0;--accent-deep:#8fb8f7;--accent-soft:rgba(92,150,240,.18);
    --accent-2:#7cbede;--danger:#ef7a63;
    --diagram-line:#3b3226;--diagram-string:#7a7060;
    --shadow:0 14px 32px -18px rgba(0,0,0,.85);
  }}
  *{box-sizing:border-box}
  body{margin:0;color:var(--body);font-family:"Roboto",system-ui,sans-serif;
    background:
      repeating-linear-gradient(91deg, var(--vena-scura) 0 1px, transparent 1px 7px),
      repeating-linear-gradient(89.4deg, var(--vena-chiara) 0 1px, transparent 1px 17px),
      repeating-linear-gradient(90.6deg, var(--vena-scura) 0 2px, transparent 2px 31px),
      repeating-linear-gradient(90.2deg, var(--vena-chiara) 0 3px, transparent 3px 53px),
      repeating-linear-gradient(89.7deg, var(--vena-scura) 0 4px, transparent 4px 97px),
      radial-gradient(120% 80% at 50% -10%, var(--bg-1) 0%, var(--bg) 55%, var(--bg-2) 100%);
    background-attachment:fixed;min-height:100dvh;-webkit-font-smoothing:antialiased}
  .app{max-width:560px;margin:0 auto;padding:22px 16px 60px}
  a{color:var(--accent-deep)}
  .su{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--dim);
    text-decoration:none;margin-bottom:16px}
  .foglio{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
    padding:20px 18px;box-shadow:var(--shadow)}
  h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(52px,17vw,74px);
    line-height:.95;color:var(--text);margin:0;text-align:center}
  .nome{font-family:"Roboto Mono",ui-monospace,monospace;font-size:13.5px;color:var(--dim);
    text-align:center;margin:6px 0 0}
  .dati{display:flex;flex-direction:column;gap:5px;margin:18px 0 0;font-size:13.5px}
  .dati div{display:flex;gap:9px}
  .dati b{font-family:"Roboto Mono",ui-monospace,monospace;font-size:11px;font-weight:600;
    letter-spacing:.14em;text-transform:uppercase;color:var(--accent-2);min-width:66px;padding-top:2px}
  .testo{font-size:14.5px;line-height:1.6;color:var(--body);margin:20px 0 0}
  .testo b{color:var(--text)}
  h2{font-family:"Roboto",sans-serif;font-size:15px;color:var(--text);margin:26px 0 9px}
  ul.vicini{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:7px}
  ul.vicini a{display:inline-block;background:var(--surface);border:1px solid var(--line);
    border-radius:11px;padding:7px 11px;font-size:13.5px;text-decoration:none;color:var(--text)}
  .prova{display:block;text-align:center;margin:22px 0 0;background:var(--accent);
    color:#fff;border-radius:16px;padding:14px;font-weight:600;font-size:15px;text-decoration:none}
  .fret{stroke:var(--diagram-line);stroke-width:1.4}
  .nut{stroke:var(--text);stroke-width:5;stroke-linecap:round}
  .string{stroke:var(--diagram-string);stroke-linecap:round}
  .inlay{fill:var(--accent-soft)}
  .slabel{fill:var(--dim);font-family:"Roboto Mono",monospace;font-size:12px;font-weight:500}
  .fretlab{fill:var(--accent-2);font-family:"Roboto Mono",monospace;font-size:13px;font-weight:600}
  .barre{fill:var(--accent-deep)}
  .dot{fill:var(--accent)}
  .dotnum{fill:#fff;font-family:"Roboto Mono",monospace;font-size:14px;font-weight:600;text-anchor:middle}
  .omark{fill:none;stroke:var(--accent-deep);stroke-width:2}
  .xmark{stroke:var(--danger);stroke-width:2.4;stroke-linecap:round}
  svg{width:min(280px,100%);height:auto;display:block;margin:14px auto 0}
"""

L = {
 "it": dict(cartella="accordi", su="Tutti gli accordi", titolo_indice="Tutti gli accordi",
            sotto="sulla chitarra", prova="Allenati su questo accordo", vicini="Accordi vicini",
            simbolo="Simbolo", note="Note", gradi="Gradi", tasti="Tasti", dita="Dita",
            teoria="Come si costruisce", altra="English", home="Manico",
            desc_indice="Novanta accordi di chitarra con diteggiatura, note e gradi: triadi maggiori e minori, settime, sospesi e add9, in posizione aperta e in barré.",
            intro_indice="Novanta diteggiature, ognuna con le note che suona e i gradi da cui è costruita."),
 "en": dict(cartella="chords", su="All chords", titolo_indice="All chords",
            sotto="on the guitar", prova="Practise this chord", vicini="Nearby chords",
            simbolo="Symbol", note="Notes", gradi="Degrees", tasti="Frets", dita="Fingers",
            teoria="How it's built", altra="Italiano", home="Manico",
            desc_indice="Ninety guitar chords with fingering, notes and degrees: major and minor triads, sevenths, suspended and add9, open position and barre.",
            intro_indice="Ninety fingerings, each with the notes it sounds and the degrees it is built from."),
}

TESTA = """<!DOCTYPE html>
<html lang="%(lang)s">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>%(titolo)s</title>
<meta name="description" content="%(desc)s" />
<link rel="canonical" href="%(url)s" />
<link rel="alternate" hreflang="it" href="%(alt_it)s" />
<link rel="alternate" hreflang="en" href="%(alt_en)s" />
<link rel="alternate" hreflang="x-default" href="%(alt_it)s" />
<meta name="robots" content="index,follow" />
<meta property="og:type" content="article" />
<meta property="og:url" content="%(url)s" />
<meta property="og:title" content="%(titolo)s" />
<meta property="og:description" content="%(desc)s" />
<link rel="icon" href="%(icona)s" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;900&family=Roboto+Mono:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet" />
<script type="application/ld+json">%(ld)s</script>
<style>
%(stile)s</style>
</head>
<body>"""


def descrizione(c, lang):
    dita = " ".join("x" if f == "x" else str(f) for f in c["frets"])
    if lang == "en":
        return ("How to play %s on guitar: fingering %s, notes %s, degrees %s."
                % (c["name"]["en"], dita, c["notes"]["en"], c["deg"]))
    return ("Come si suona %s sulla chitarra: diteggiatura %s, note %s, gradi %s."
            % (c["name"]["it"], dita, c["notes"]["it"], c["deg"]))

def pagina(c, insieme, vicini, lang, scheda):
    lab = L[lang]; altro = "en" if lang == "it" else "it"
    nome = c["name"][lang]
    url  = "%s/%s/%s/" % (BASE, lab["cartella"], sfilza(c["name"][lang]))
    url_altro = "%s/%s/%s/" % (BASE, L[altro]["cartella"], sfilza(c["name"][altro]))
    desc = descrizione(c, lang)
    tastati = [f for f in c["frets"] if isinstance(f, int) and f > 0]
    barre = ((" Si suona con il barré." if lang == "it" else " It is played with a barre.")
             if c["fingers"].count(1) > 1 and tastati else "")
    mute = ((" Le corde marcate con una <b>×</b> non vanno suonate." if lang == "it"
             else " The strings marked <b>×</b> are not played.") if c["frets"].count("x")
            else (" Si suonano tutte e sei le corde." if lang == "it" else " All six strings are played."))
    corpo = (("<b>%s</b> si costruisce con le note %s, cioè i gradi %s a partire dalla fondamentale.%s%s"
              if lang == "it" else
              "<b>%s</b> is built from the notes %s, that is the degrees %s counting from the root.%s%s")
             % (nome, c["notes"][lang], c["deg"], barre, mute))
    if scheda:
        t = scheda[lang]
        corpo += " " + re.sub(r"<[^>]*>", "", t["recipe"]) + " " + re.sub(r"<[^>]*>", "", t["sound"])
    dati = [(lab["simbolo"], c["sym"]), (lab["note"], c["notes"][lang]), (lab["gradi"], c["deg"]),
            (lab["tasti"], " ".join("x" if f == "x" else str(f) for f in c["frets"])),
            (lab["dita"], " ".join("-" if d == 0 else str(d) for d in c["fingers"]))]
    passi = [("Metti le dita", "Metti le dita") if lang == "it" else ("Place your fingers", "Place your fingers")]
    ld = [{"@context": "https://schema.org", "@type": "HowTo",
           "name": ("Come suonare %s sulla chitarra" if lang == "it" else "How to play %s on guitar") % nome,
           "description": desc, "url": url, "inLanguage": lang,
           "step": [{"@type": "HowToStep", "position": 1,
                     "name": "Metti le dita" if lang == "it" else "Place your fingers",
                     "text": ("Dalla sesta corda alla prima: " if lang == "it" else "From the sixth string to the first: ")
                             + ", ".join(("corda muta" if lang == "it" else "muted") if f == "x"
                                         else (("a vuoto" if lang == "it" else "open") if f == 0
                                               else (("%d° tasto" if lang == "it" else "fret %d") % f))
                                         for f in c["frets"]) + "."},
                    {"@type": "HowToStep", "position": 2,
                     "name": "Controlla le note" if lang == "it" else "Check the notes",
                     "text": ("L'accordo suona %s." if lang == "it" else "The chord sounds %s.") % c["notes"][lang]}]},
          {"@context": "https://schema.org", "@type": "BreadcrumbList",
           "itemListElement": [
             {"@type": "ListItem", "position": 1, "name": lab["home"], "item": BASE + "/"},
             {"@type": "ListItem", "position": 2, "name": lab["titolo_indice"], "item": "%s/%s/" % (BASE, lab["cartella"])},
             {"@type": "ListItem", "position": 3, "name": nome, "item": url}]}]
    return TESTA % {
      "lang": lang, "titolo": "%s · %s %s" % (c["sym"], nome, lab["sotto"]), "desc": desc, "url": url,
      "alt_it": "%s/accordi/%s/" % (BASE, sfilza(c["name"]["it"])),
      "alt_en": "%s/chords/%s/" % (BASE, sfilza(c["name"]["en"])),
      "ld": json.dumps(ld, ensure_ascii=False), "stile": STILE, "su": "../../", "icona": "../../icon.svg",
    } + """
<div class="app">
  <a class="su" href="../">&larr; %(su)s</a>
  <div class="foglio">
    <h1>%(sym)s</h1>
    <p class="nome">%(nome)s</p>
    %(svg)s
    <div class="dati">%(dati)s</div>
    <p class="testo">%(corpo)s</p>
  </div>
  <a class="prova" href="../../">%(prova)s</a>
  <h2>%(vicini_t)s</h2>
  <ul class="vicini">%(vicini)s</ul>
  <p class="testo" style="text-align:center"><a href="%(url_altro)s">%(altra)s</a></p>
</div>
</body>
</html>
""" % {"su": lab["su"], "sym": c["sym"], "nome": nome, "svg": svg_accordo(c, lang),
       "dati": "".join("<div><b>%s</b><span>%s</span></div>" % (k, v) for k, v in dati),
       "corpo": corpo, "prova": lab["prova"], "vicini_t": lab["vicini"],
       "vicini": "".join('<li><a href="../%s/">%s</a></li>' % (sfilza(v["name"][lang]), v["sym"]) for v in vicini),
       "url_altro": url_altro, "altra": lab["altra"]}


def pagina_teoria(scheda, insieme, accordi, lang):
    lab = L[lang]; t = scheda[lang]
    url = "%s/teoria/%s/" % (BASE, sfilza(t["title"])) if lang == "it" else "%s/theory/%s/" % (BASE, sfilza(t["title"]))
    desc = re.sub(r"<[^>]*>", "", t["recipe"])
    voci = "".join('<li><a href="../../%s/%s/">%s</a></li>'
                   % (lab["cartella"], sfilza(accordi[k]["name"][lang]), accordi[k]["sym"])
                   for k in insieme["ch"] if k in accordi)
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": t["title"],
          "description": desc, "url": url, "inLanguage": lang}
    return TESTA % {
      "lang": lang, "titolo": "%s · %s" % (t["title"], "accordi di chitarra" if lang == "it" else "guitar chords"),
      "desc": desc, "url": url, "alt_it": url, "alt_en": url,
      "ld": json.dumps(ld, ensure_ascii=False), "stile": STILE, "su": "../../", "icona": "../../icon.svg",
    } + """
<div class="app">
  <a class="su" href="../../%(cartella)s/">&larr; %(su)s</a>
  <div class="foglio">
    <p class="nome" style="margin:0 0 4px">%(eyebrow)s</p>
    <h1 style="font-size:34px">%(titolo)s</h1>
    <p class="nome" style="font-size:17px;margin-top:10px">%(formula)s</p>
    <p class="testo">%(recipe)s <b>%(sound)s</b></p>
  </div>
  <h2>%(insieme)s</h2>
  <ul class="vicini">%(voci)s</ul>
  <a class="prova" href="../../">%(prova)s</a>
</div>
</body>
</html>
""" % {"cartella": lab["cartella"], "su": lab["su"], "eyebrow": t["eyebrow"], "titolo": t["title"],
       "formula": " · ".join(scheda["formula"]), "recipe": t["recipe"], "sound": t["sound"],
       "insieme": insieme["nm"][lang], "voci": voci, "prova": lab["prova"]}


def indice(accordi, insiemi, lang):
    lab = L[lang]
    righe = []
    for d in insiemi:
        voci = "".join('<li><a href="%s/">%s</a></li>' % (sfilza(accordi[k]["name"][lang]), accordi[k]["sym"])
                       for k in d["ch"] if k in accordi)
        righe.append('<h2>%s</h2><p class="testo" style="margin:0 0 10px">%s</p><ul class="vicini">%s</ul>'
                     % (d["nm"][lang], d["sb"][lang], voci))
    url = "%s/%s/" % (BASE, lab["cartella"])
    ld = {"@context": "https://schema.org", "@type": "CollectionPage",
          "name": lab["titolo_indice"], "description": lab["desc_indice"], "url": url, "inLanguage": lang}
    return TESTA % {
      "lang": lang, "titolo": lab["titolo_indice"] + (" di chitarra" if lang == "it" else " for guitar"),
      "desc": lab["desc_indice"], "url": url,
      "alt_it": "%s/accordi/" % BASE, "alt_en": "%s/chords/" % BASE,
      "ld": json.dumps(ld, ensure_ascii=False), "stile": STILE, "su": "../", "icona": "../icon.svg",
    } + """
<div class="app">
  <a class="su" href="../">&larr; %(home)s</a>
  <h1 style="font-size:34px;text-align:left">%(titolo)s</h1>
  <p class="testo" style="margin-top:8px">%(intro)s</p>
  %(righe)s
</div>
</body>
</html>
""" % {"home": lab["home"], "titolo": lab["titolo_indice"], "intro": lab["intro_indice"], "righe": "".join(righe)}


def testi_i18n(s, lang, chiavi):
    """Pesca le stringhe dal blocco I18N di index.html.
    Sono già lì, in due lingue: riscriverle qui vorrebbe dire tenere allineate
    due copie, ed è esattamente il modo in cui le traduzioni divergono."""
    i = s.index("\n  %s: {" % lang)
    fine = s.index("\n  },", i)
    zona = s[i:fine]
    out = {}
    for k in chiavi:
        m = re.search(r'\n\s*%s:\s*"((?:[^"\\]|\\.)*)"' % k, zona)
        if not m:
            sys.exit("manca la chiave %s in I18N.%s" % (k, lang))
        out[k] = m.group(1).replace('\\"', '"')
    return out


def home_inglese(s):
    """La home inglese come pagina vera, /en/.

    Prima l'inglese era ?lang=en: un indirizzo che serviva HTML dichiarato
    italiano e con canonical verso la home italiana. Google lo classificava
    "pagina alternativa con tag canonical appropriato", cioè non la indicizzava
    mai, e l'hreflang che puntava lì veniva ignorato perché rimandava a un
    indirizzo che canonicalizza altrove.

    La pagina è una copia della home generata a ogni pubblicazione: nasce dalla
    stessa sorgente, quindi non può scollarsi. Cambiano solo i segnali della
    testa, i testi visibili prima che il JavaScript entri in funzione, e i
    collegamenti relativi — perché /en/ sta un livello più in dentro."""
    t = testi_i18n(s, "en", ["pageTitle", "metaDescription", "tagline", "allChords"])
    h = s

    h = h.replace('<html lang="it">', '<html lang="en">', 1)

    def campo(testo, schema, valore):
        nuovo, n = re.subn(schema, lambda m: m.group(1) + valore + m.group(2), testo, count=1)
        if not n:
            sys.exit("home inglese: non ho trovato %s" % schema)
        return nuovo

    h = campo(h, r'(<title>).*?(</title>)', t["pageTitle"])
    h = campo(h, r'(<meta name="description" id="metaDescription" content=")[^"]*(")', t["metaDescription"])
    h = campo(h, r'(<link rel="canonical" id="canonical" href=")[^"]*(")', BASE + "/en/")
    h = campo(h, r'(<meta property="og:url" content=")[^"]*(")', BASE + "/en/")
    h = campo(h, r'(<meta property="og:title" content=")[^"]*(")', t["pageTitle"])
    h = campo(h, r'(<meta property="og:description" content=")[^"]*(")', t["metaDescription"])
    h = campo(h, r'(<p class="tagline" id="tagline">).*?(</p>)', t["tagline"])

    # i collegamenti relativi risalgono di un livello
    testa, resto = h.split("</head>", 1)
    testa = re.sub(r'(src|href)="((?!https?:|#|mailto:|data:|\.\./)[^"]+)"',
                   lambda m: '%s="../%s"' % (m.group(1), m.group(2)), testa)
    h = testa + "</head>" + resto
    h = h.replace('<script src="assets/', '<script src="../assets/')

    # il ponte verso le pagine statiche, in inglese e un livello più su
    h = campo(h, r'(<a href="accordi/" id="tuttiLink">).*?(</a>)', t["allChords"])
    h = h.replace('<a href="accordi/" id="tuttiLink">', '<a href="../chords/" id="tuttiLink">', 1)
    h = h.replace('<a href="accordi/">Vedi tutti i 90 accordi con diteggiatura, note e gradi</a>',
                  '<a href="../chords/">See all 90 chords with fingering, notes and degrees</a>', 1)
    return h


def sitemap(accordi, schede, insiemi):
    oggi = date.today().isoformat()
    def alt(it, en):
        return ('\n    <xhtml:link rel="alternate" hreflang="it" href="%s"/>'
                '\n    <xhtml:link rel="alternate" hreflang="en" href="%s"/>'
                '\n    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>' % (it, en, it))
    u = ['  <url><loc>%s/</loc><lastmod>%s</lastmod>%s</url>' % (BASE, oggi, alt(BASE + "/", BASE + "/en/")),
         '  <url><loc>%s/en/</loc><lastmod>%s</lastmod>%s</url>' % (BASE, oggi, alt(BASE + "/", BASE + "/en/")),
         '  <url><loc>%s/accordi/</loc><lastmod>%s</lastmod>%s</url>'
           % (BASE, oggi, alt(BASE + "/accordi/", BASE + "/chords/")),
         '  <url><loc>%s/chords/</loc><lastmod>%s</lastmod>%s</url>'
           % (BASE, oggi, alt(BASE + "/accordi/", BASE + "/chords/"))]
    for c in accordi.values():
        it = "%s/accordi/%s/" % (BASE, sfilza(c["name"]["it"]))
        en = "%s/chords/%s/" % (BASE, sfilza(c["name"]["en"]))
        u.append('  <url><loc>%s</loc><lastmod>%s</lastmod>%s</url>' % (it, oggi, alt(it, en)))
        u.append('  <url><loc>%s</loc><lastmod>%s</lastmod>%s</url>' % (en, oggi, alt(it, en)))
    for sc in schede:
        u.append('  <url><loc>%s/teoria/%s/</loc><lastmod>%s</lastmod></url>' % (BASE, sfilza(sc["it"]["title"]), oggi))
        u.append('  <url><loc>%s/theory/%s/</loc><lastmod>%s</lastmod></url>' % (BASE, sfilza(sc["en"]["title"]), oggi))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
            '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(u) + "\n</urlset>\n")

def main():
    s = leggi_sorgente()
    accordi = leggi_accordi(s)
    insiemi = leggi_insiemi(s)
    schede  = leggi_teoria(s)
    if not accordi or not insiemi or not schede:
        sys.exit("non ho letto i dati da index.html (accordi %d, insiemi %d, schede %d)"
                 % (len(accordi), len(insiemi), len(schede)))

    di_chi = {}
    for d in insiemi:
        for k in d["ch"]:
            di_chi.setdefault(k, d)
    scheda_di = {d["id"]: sc for sc in schede for d in insiemi if d["id"] == sc["deckId"]}

    fatte = 0
    for lang in ("it", "en"):
        cartella = os.path.join(QUI, L[lang]["cartella"])
        if os.path.isdir(cartella):
            shutil.rmtree(cartella)
        os.makedirs(cartella)
        for k, c in accordi.items():
            insieme = di_chi.get(k)
            vicini = [accordi[x] for x in (insieme["ch"] if insieme else []) if x != k][:8]
            sc = scheda_di.get(insieme["id"]) if insieme else None
            d = os.path.join(cartella, sfilza(c["name"][lang]))
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(pagina(c, insieme, vicini, lang, sc))
            fatte += 1
        open(os.path.join(cartella, "index.html"), "w", encoding="utf-8").write(indice(accordi, insiemi, lang))

        teoria = os.path.join(QUI, "teoria" if lang == "it" else "theory")
        if os.path.isdir(teoria):
            shutil.rmtree(teoria)
        os.makedirs(teoria)
        for sc in schede:
            ins = next((d for d in insiemi if d["id"] == sc["deckId"]), None)
            if not ins:
                continue
            d = os.path.join(teoria, sfilza(sc[lang]["title"]))
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(pagina_teoria(sc, ins, accordi, lang))
            fatte += 1

    cartella_en = os.path.join(QUI, "en")
    os.makedirs(cartella_en, exist_ok=True)
    open(os.path.join(cartella_en, "index.html"), "w", encoding="utf-8").write(home_inglese(s))
    fatte += 1

    open(os.path.join(QUI, "sitemap.xml"), "w", encoding="utf-8").write(sitemap(accordi, schede, insiemi))
    print("generate %d pagine (accordi, teoria e home inglese) più due indici e la sitemap" % fatte)

if __name__ == "__main__":
    main()
