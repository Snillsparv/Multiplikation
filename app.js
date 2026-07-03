"use strict";

/* =====================================================
   Multiplikationstabellen, träningssida
   Bygger på Snillsparvs film om multiplikationstabellen.
   All data sparas lokalt i webbläsaren (localStorage).
   ===================================================== */

/* ---------- Småhjälpare ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function median(arr) {
  if (!arr || arr.length === 0) return null;
  const s = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const fmtSec = (ms) => (ms / 1000).toFixed(1).replace(".", ",") + " s";

/* ---------- Talen ---------- */
// Kommutativa lagen: 4×6 = 6×4, så varje par lagras bara en gång ("4x6").
const keyOf = (a, b) => Math.min(a, b) + "x" + Math.max(a, b);
const parseKey = (k) => k.split("x").map(Number);

const ALL_FACTS = [];
for (let a = 1; a <= 10; a++) {
  for (let b = a; b <= 10; b++) ALL_FACTS.push(a + "x" + b);
}

// De sex som enligt filmen verkligen behöver memoreras.
const HARD_SIX = ["6x6", "6x7", "6x8", "7x7", "7x8", "8x8"];

// Av/på-brytare för det "fancy" utseendet på Tabellen (3D-svävande rutor +
// regnbågsfärger). false = enkelt, platt utseende (standard). Sätt till true
// för att slå på det igen, allt är sparat nedan och i style.css (.tbl-fancy).
const FANCY_TABLE = false;

// Regnbågsfärger per rad (1 = röd högst upp ... 10 = lila), som på klassiska
// trä-multiplikationsbräden. Index 0 används inte. Används bara när FANCY_TABLE.
const ROW_COLORS = [
  "", "#ee6b63", "#f59148", "#f3bb45", "#bcd75c", "#82c95f",
  "#4cc596", "#45cbd2", "#5ab0ee", "#8090ee", "#b98ee0",
];

/* ---------- Sparad data ---------- */
const STORE_KEY = "snillsparv-multiplikation-v1";

function defaultState() {
  return {
    known: {},   // { "4x6": true }, tal man bockat av att man redan kan
    stats: {},   // { "4x6": { attempts, wrong, recent, box, due, fastRow } }
    totals: { rounds: 0, answers: 0, correct: 0, bestStreak: 0, paceMs: null },
    settings: {
      lastTables: [],
      count: 10,
      showAnswers: false,
    },
  };
}

// Lyfter in det äldre sparformatet (times-listan) i det nya rullande fönstret.
// Gamla fel följer medvetet inte med: bara de senaste svaren ska räknas.
function migrateStats(stats) {
  for (const k of Object.keys(stats || {})) {
    const s = stats[k];
    if (!s.recent) {
      s.recent = (s.times || []).map((ms) => ({ ok: true, ms }));
      delete s.times;
    }
    if (s.box == null) s.box = 0;
    if (s.due == null) s.due = 0;
    if (s.fastRow == null) s.fastRow = 0;
  }
  return stats;
}

function load() {
  if (typeof localStorage === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    const d = defaultState();
    return {
      known: data.known || d.known,
      stats: migrateStats(data.stats || d.stats),
      totals: Object.assign(d.totals, data.totals),
      settings: Object.assign(d.settings, data.settings),
    };
  } catch {
    return defaultState();
  }
}

const state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* t.ex. privat läge, sidan funkar ändå, utan att minnas */
  }
}

/* ---------- Statistik per tal ---------- */
// Tempogränserna anpassar sig efter användarens egen takt: paceMs är ett
// glidande medel av alla rätta svarstider. Utan historik motsvarar gränserna
// ungefär de gamla fasta värdena (snabb ~2,5 s, säker ~3,5 s, långsam ~6 s).
const DEFAULT_PACE = 2800;
const RECENT_MAX = 10;      // så många senaste svar räknas per tal
const AUTO_KNOWN_ROW = 3;   // så många snabba rätt i rad bockar av talet automatiskt

// Leitner-lådor: efter rätt svar "vilar" talet allt längre innan det är
// moget att övas igen. Fel svar backar till låda 0 (moget direkt).
const BOX_REST_MS = [0, 8 * 36e5, 24 * 36e5, 3 * 864e5, 7 * 864e5, 14 * 864e5];

function pace() {
  return state.totals.paceMs || DEFAULT_PACE;
}
const fastMs = () => clamp(0.9 * pace(), 1600, 3600);   // "Blixtsnabbt!"
const greenMs = () => clamp(1.25 * pace(), 2200, 5000); // säker på kartan + auto-avbockning
const slowMs = () => clamp(2.2 * pace(), 4500, 10000);  // dags för knep
const weakMs = () => slowMs() * 0.75;                   // räknas som lucka

function getStat(k) {
  return state.stats[k];
}

function recentOf(k) {
  const s = getStat(k);
  return s && s.recent ? s.recent : [];
}

function recentWrong(k) {
  return recentOf(k).filter((r) => !r.ok).length;
}

// Mediantid av de senaste rätta svaren.
function medTime(k) {
  return median(recentOf(k).filter((r) => r.ok && r.ms != null).map((r) => r.ms));
}

function recordAnswer(k, correct, ms) {
  const s = state.stats[k] || (state.stats[k] = { attempts: 0, wrong: 0, recent: [], box: 0, due: 0, fastRow: 0 });
  const now = Date.now();
  const slowLimit = slowMs();
  const quickLimit = greenMs();

  s.attempts++;
  if (!correct) s.wrong++;

  // rullande fönster: bara de senaste svaren räknas, gamla misstag glöms bort
  s.recent.push({ ok: correct, ms: correct && ms != null ? Math.round(ms) : null });
  if (s.recent.length > RECENT_MAX) s.recent.shift();

  if (correct) {
    // Leitner: rätt i rimlig takt kliver upp en låda och vilar längre
    if (ms != null && ms < slowLimit) s.box = Math.min(BOX_REST_MS.length - 1, (s.box || 0) + 1);
    s.due = now + BOX_REST_MS[s.box || 0];
    s.fastRow = ms != null && ms < quickLimit ? (s.fastRow || 0) + 1 : 0;
    // uppdatera användarens takt (glidande medel av rätta svarstider)
    if (ms != null) {
      const sample = Math.min(ms, 15000);
      state.totals.paceMs = clamp(Math.round((state.totals.paceMs || sample) * 0.9 + sample * 0.1), 1200, 8000);
    }
  } else {
    s.box = 0;
    s.due = now;
    s.fastRow = 0;
  }

  state.totals.answers++;
  if (correct) state.totals.correct++;
}

// Hur mycket ett tal behöver tränas: fel väger tyngst, sedan långsamhet.
// Bara de senaste svaren räknas, så gamla misstag förlåts när nya rätt kommer.
function difficulty(k) {
  const rec = recentOf(k);
  if (!rec.length) return 1.6; // aldrig tränad, ganska hög prioritet
  let d = 0.4 + (recentWrong(k) / rec.length) * 3;
  const med = medTime(k);
  if (med != null) d += clamp((med - greenMs()) / 5000, 0, 1) * 1.5;
  return d;
}

// Tal som vilar i sin Leitner-låda tonas ner, förfallna får en liten knuff.
function dueFactor(k) {
  const s = getStat(k);
  if (!s || !s.due) return 1;
  const now = Date.now();
  if (now < s.due) return 0.2;
  return 1 + Math.min(0.4, ((now - s.due) / (7 * 864e5)) * 0.4);
}

// Tal man bockat av i tabellen tonas ner rejält om de ändå dyker upp.
function weightOf(k) {
  return difficulty(k) * (state.known[k] ? 0.25 : 1) * dueFactor(k);
}

// Talen för "Mina luckor": fel eller långsamma på sistone.
function weakFacts() {
  return ALL_FACTS.filter((k) => {
    const rec = recentOf(k);
    if (!rec.length) return false;
    const med = medTime(k);
    return recentWrong(k) > 0 || (med != null && med > weakMs());
  }).sort((x, y) => difficulty(y) - difficulty(x));
}

/* ---------- Tips & minnesregler (från filmen) ---------- */
const MNEMONICS = {
  "7x8": {
    title: "5, 6, 7, 8!",
    text: "Skriv svaret först, så blir det 56 = 7 × 8. Det är bara siffrorna i ordning: 5, 6, 7, 8!",
  },
  "8x8": {
    title: "Mario och Luigi!",
    text: "Mario och Luigi ser ut som två åttor, och de kommer från Nintendo 64. Alltså: 8 × 8 = 64!",
  },
  "7x7": {
    title: "Sjösjuk? Fira nyår!",
    text: "Sju sju låter som ”sjösjuk” och fyra nio som ”fira nyår”. Tänk dig en sjösjuk pirat som firar nyår: 7 × 7 = 49!",
  },
  "6x6": {
    title: "Sax, sax, träsax!",
    text: "Sex låter som sax: ”sax, sax, träsax”, 6, 6, 3, 6. Tänk dig en träsax så sitter den i ett klipp: 6 × 6 = 36!",
  },
  "6x7": {
    title: "Hackan!",
    text: "7:an ser ut som en hacka som hackar 6:an i två bitar: en 4:a och en 2:a (4 + 2 = 6). Så 6 × 7 = 42!",
  },
  "6x8": {
    title: "Sex råttor!",
    text: "Åtta rimmar på råtta: sex råttor! Två äter upp varandra och kvar är fyra råttor, 4 och 8 ger 48. Så 6 × 8 = 48!",
  },
  "3x4": {
    title: "1, 2, 3, 4!",
    text: "12 = 3 × 4, siffrorna kommer i ordning: 1, 2, 3, 4. Precis som 56 = 7 × 8!",
  },
};

// Ordning för korten under "Knepen" (samma ordning som i filmen).
const MNEMONIC_ORDER = ["7x8", "8x8", "7x7", "6x6", "6x7", "6x8"];

// Bilder ur filmen till minnesreglerna (bilder/<tal>.webp). 8x8 saknar bild.
const MNEMO_BILD_ALT = {
  "7x8": "56 = 7 x 8, siffrorna kommer i ordning",
  "7x7": "Sjösjuk pirat som firar nyår: 7 x 7 = 49",
  "6x6": "Sax gånger sax blir träsax: 6 x 6 = 36",
  "6x7": "Sjuan hackar sexan i en fyra och en tvåa: 6 x 7 = 42",
  "6x8": "Sex råttor blir fyra råttor: 6 x 8 = 48",
};

// Varje tips finns i två varianter: "text" (med facit, visas när frågan är
// avgjord) och "hint" (utan facit, visas som ledtråd när man får försöka igen).
// Minnesreglerna är sina egna ledtrådar, där är poängen att plocka svaret ur ramsan.
function tipFor(a, b) {
  const k = keyOf(a, b);
  if (MNEMONICS[k]) return MNEMONICS[k];
  const other = (n) => (a === n ? b : a);

  if (a === 1 || b === 1) {
    const n = other(1);
    return {
      title: "Gånger 1, ingenting händer",
      text: `1 × ${n} är bara ${n}. Talet ändras inte!`,
      hint: "Multiplicerar du med 1 händer ingenting alls. Vad blir talet?",
    };
  }
  if (a === 10 || b === 10) {
    const n = other(10);
    return {
      title: "Gånger 10, lägg till en nolla",
      text: `Sätt en nolla efter ${n}: ${n} × 10 = ${n * 10}.`,
      hint: `Sätt bara en nolla efter ${n}.`,
    };
  }
  if (a === 2 || b === 2) {
    const n = other(2);
    return {
      title: "Gånger 2, dubbla!",
      text: `Plussa talet med sig självt: ${n} + ${n} = ${n * 2}.`,
      hint: `Plussa talet med sig självt: vad är ${n} + ${n}?`,
    };
  }
  if (a === 9 || b === 9) {
    const n = other(9);
    return {
      title: "Nians knep",
      text: `Första siffran är ett mindre än ${n}, alltså ${n - 1}. Siffrorna i svaret blir 9 ihop: ${n - 1} + ${10 - n} = 9. Svaret är ${n * 9}!`,
      hint: `Första siffran är ett mindre än ${n}. Och svarets två siffror blir 9 tillsammans.`,
    };
  }
  if (a === 5 || b === 5) {
    const n = other(5);
    const half = String(n / 2).replace(".", ",");
    return {
      title: "Femmans knep, halvera och ta gånger 10",
      text: `Fem är hälften av tio! Hälften av ${n} är ${half}, och ${half} × 10 = ${n * 5}.`,
      hint: `Fem är hälften av tio! Ta hälften av ${n}, och sedan gånger 10.`,
    };
  }
  if (a === 4 || b === 4) {
    const n = other(4);
    return {
      title: "Gånger 4, dubbla två gånger",
      text: `Dubbla ${n} till ${n * 2}, och dubbla en gång till: ${n * 4}!`,
      hint: `Dubbla ${n} till ${n * 2}, och dubbla sedan en gång till.`,
    };
  }
  if (a === 3 || b === 3) {
    const n = other(3);
    return {
      title: "Gånger 3, dubbla och lägg till en till",
      text: `${n} + ${n} = ${n * 2}, och ${n * 2} + ${n} = ${n * 3}.`,
      hint: `Dubbla först: ${n} + ${n} = ${n * 2}. Lägg sedan till ${n} en gång till.`,
    };
  }
  return { title: "Nöt in den!", text: "Repetition gör susen, kör några varv till så sitter den." };
}

/* ---------- Prickmodellen: visa varför svaret stämmer ---------- */
const PLURAL = ["", "ettor", "tvåor", "treor", "fyror", "femmor", "sexor", "sjuor", "åttor", "nior", "tior"];

// Ritar a rader med b prickar. Fler än fem rader färgdelas vid femman, så att
// knepet "dela vid fem" syns: 7 × 8 = 5 åttor + 2 åttor. Vänd-knappen visar
// samma tal åt andra hållet (kommutativa lagen).
function dotsHtml(a, b) {
  let cells = "";
  for (let r = 0; r < a; r++) {
    for (let c = 0; c < b; c++) {
      cells += `<span class="dot-cell${r >= 5 ? " over5" : ""}"></span>`;
    }
  }
  let text;
  if (a > 5) {
    const rest = a - 5;
    text = `5 ${PLURAL[b]} är ${5 * b}, och ${rest} ${PLURAL[b]} är ${rest * b}. ${5 * b} + ${rest * b} = ${a * b}.`;
  } else if (a === 1) {
    text = `En rad med ${b} prickar: 1 × ${b} = ${b}.`;
  } else {
    text = `${a} rader med ${b} prickar: ${a} ${PLURAL[b]} är ${a * b}.`;
  }
  return `<div class="dots-wrap">
    <div class="dots-grid" style="grid-template-columns: repeat(${b}, 13px)">${cells}</div>
    <p class="dots-text">${text}</p>
    <button type="button" class="btn small secondary" id="dots-flip">Vänd på det: ${b} × ${a}</button>
  </div>`;
}

function bindDotsFlip(container, a, b) {
  const btn = container.querySelector("#dots-flip");
  if (!btn) return;
  btn.addEventListener("click", () => {
    container.querySelector(".dots-wrap").outerHTML = dotsHtml(b, a);
    bindDotsFlip(container, b, a);
  });
}

/* ---------- Filmen (inbäddad Vimeo-spelare) ---------- */
// Spelaren laddas först när användaren trycker play, och med dnt=1 så att
// Vimeo inte spårar. Sekundtalen anger var varje knep börjar i filmen;
// kortens data-film-attribut pekar in i tabellen.
const FILM_ID = "1206760390";
const FILM_TIDER = {
  flip: 20,        // 0:20 Vänd på det
  "1": 31,         // 0:31 Ettan och tian
  "10": 31,
  "5": 45,         // 0:45 Femmans
  "9": 60,         // 1:00 Nians
  "2": 90,         // 1:30 Tvåans
  "4": 97,         // 1:37 Fyrans
  "3": 105,        // 1:45 Treans
  sex: 112,        // 1:52 De sex svåra
  "7x8": 136,      // 2:16
  "8x8": 154,      // 2:34
  "7x7": 174,      // 2:54
  "6x6": 198,      // 3:18
  "6x7": 211,      // 3:31
  "6x8": 228,      // 3:48
};

const fmtTid = (sec) => Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");

function filmSrc(sec, autoplay) {
  return `https://player.vimeo.com/video/${FILM_ID}?dnt=1&byline=0&portrait=0${autoplay ? "&autoplay=1" : ""}#t=${sec || 0}s`;
}

// Förvärmer anslutningarna till Vimeos servrar när användaren är på väg att
// trycka play (hovrar/nuddar knappen). Ingen video hämtas förrän man klickar,
// men handskakningarna är redan gjorda, så uppspelningen startar snabbare.
function warmFilmConnections() {
  if (warmFilmConnections.done) return;
  warmFilmConnections.done = true;
  ["https://player.vimeo.com", "https://i.vimeocdn.com", "https://f.vimeocdn.com", "https://vod-adaptive-ak.vimeocdn.com"].forEach((href) => {
    const l = document.createElement("link");
    l.rel = "preconnect";
    l.href = href;
    document.head.appendChild(l);
  });
}

// Tar bort spelare (utom ev. den i angiven ruta). Fasaden ligger kvar under
// och syns igen, så filmen kan enkelt startas på nytt.
function stopFilm(exceptWrap) {
  $$(".video-wrap iframe").forEach((f) => {
    if (!exceptWrap || !exceptWrap.contains(f)) f.remove();
  });
}

// Spelar filmen i en viss ruta från en viss sekund. Bara en spelare i taget.
function playFilmIn(wrap, sec) {
  stopFilm(wrap);
  let iframe = wrap.querySelector("iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.title = "Snillsparvs film om multiplikationstabellen";
    wrap.appendChild(iframe);
  }
  iframe.src = filmSrc(sec, true);
}

function bindFilmButtons() {
  if (!FILM_ID) return;
  $$(".film-facade").forEach((fac) => {
    fac.addEventListener("pointerover", warmFilmConnections, { passive: true });
    fac.addEventListener("touchstart", warmFilmConnections, { passive: true });
    fac.addEventListener("focus", warmFilmConnections);
    fac.addEventListener("click", () => playFilmIn(fac.closest(".video-wrap"), 0));
  });
  const lugn = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hoppa = (sec) => {
    playFilmIn($("#film-wrap"), sec);
    $("#film-card").scrollIntoView({ behavior: lugn ? "auto" : "smooth", block: "start" });
  };
  $$("[data-film]").forEach((card) => {
    const sec = FILM_TIDER[card.dataset.film] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn small secondary film-btn";
    btn.textContent = `Se knepet i filmen (${fmtTid(sec)})`;
    btn.addEventListener("click", () => hoppa(sec));
    card.appendChild(btn);
  });
  // minnesreglernas egna hopp-punkter
  $$(".mnemo-film").forEach((btn) => {
    btn.addEventListener("click", () => hoppa(Number(btn.dataset.sec) || 0));
  });
}

/* ---------- Frågeval ---------- */
function poolFromTables(tables) {
  const set = new Set();
  for (const t of tables) {
    for (let i = 1; i <= 10; i++) set.add(keyOf(t, i));
  }
  return [...set];
}

// Viktat urval utan återläggning: svåra/långsamma tal dras oftare.
function weightedSample(pool, weights, n) {
  const items = pool.map((k, i) => ({ k, w: Math.max(weights[i], 0.01) }));
  const out = [];
  while (out.length < n && items.length) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = Math.random() * total;
    let idx = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      r -= items[i].w;
      if (r <= 0) { idx = i; break; }
    }
    out.push(items[idx].k);
    items.splice(idx, 1);
  }
  return out;
}

function buildQueue(pool, count) {
  const queue = [];
  while (queue.length < count) {
    const remaining = count - queue.length;
    const last = queue[queue.length - 1];

    // sista frågan (eller pool med ett enda tal): dra en i taget, aldrig samma som förra
    if (remaining === 1 || pool.length === 1) {
      const cands = pool.length > 1 ? pool.filter((k) => k !== last) : pool;
      queue.push(weightedSample(cands, cands.map(weightOf), 1)[0]);
      continue;
    }

    const take = Math.min(pool.length, remaining);
    const chunk = weightedSample(pool, pool.map(weightOf), take);
    // undvik samma tal två gånger i rad där omgångarna möts,
    // talen i en omgång är alla olika, så det finns alltid ett att byta fram
    if (chunk[0] === last) {
      const e = chunk.findIndex((k) => k !== last);
      [chunk[0], chunk[e]] = [chunk[e], chunk[0]];
    }
    queue.push(...chunk);
  }
  return queue;
}

/* =====================================================
   Härifrån och ner: allt som rör själva sidan (DOM).
   ===================================================== */

let quiz = null; // pågående runda

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------- Flikar ---------- */
function showTab(name) {
  stopFilm(); // inget filmljud ska fortsätta i bakgrunden
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  if (name === "tabell") renderGrid();
  if (name === "stats") renderStats();
  window.scrollTo({ top: 0 });
}

/* ---------- Träna: uppstart ---------- */
function showScreen(name) {
  $("#setup-screen").hidden = name !== "setup";
  $("#quiz-screen").hidden = name !== "quiz";
  $("#result-screen").hidden = name !== "result";
}

function renderTableChips() {
  const wrap = $("#table-chips");
  wrap.innerHTML = "";
  for (let n = 1; n <= 10; n++) {
    const btn = document.createElement("button");
    btn.className = "chip" + (state.settings.lastTables.includes(n) ? " on" : "");
    btn.textContent = n;
    btn.setAttribute("aria-pressed", state.settings.lastTables.includes(n));
    btn.addEventListener("click", () => {
      const list = state.settings.lastTables;
      const i = list.indexOf(n);
      if (i >= 0) list.splice(i, 1);
      else list.push(n);
      save();
      renderTableChips();
    });
    wrap.appendChild(btn);
  }
}

function startRound(opts) {
  let pool = opts.facts ? [...new Set(opts.facts)] : poolFromTables(opts.tables);
  if (pool.length === 0) {
    toast("Välj minst en tabell först!");
    return;
  }

  // avbockade tal hoppas över, om allt är avbockat blir det repetition
  if (!opts.keepKnown) {
    const left = pool.filter((k) => !state.known[k]);
    if (left.length === 0) toast("Allt här är redan avbockat, vi kör repetition!");
    else pool = left;
  }

  const count = opts.count || state.settings.count;
  quiz = {
    opts,
    label: opts.label || "",
    queue: buildQueue(pool, count),
    cap: count + Math.min(8, count),
    idx: 0,
    answered: 0,
    corrects: 0,
    streak: 0,
    bestStreak: 0,
    misses: new Set(),
    slows: new Set(),
    hints: new Set(), // tal som satt först efter ledtråd
    need: {},       // revansch: fel kräver två rätt i rad innan talet släpps
    autoKnown: [],  // tal som bockades av automatiskt under rundan
    results: [],
    timer: null,
    current: null,
  };

  showTab("trana");
  showScreen("quiz");
  $("#round-label").textContent = quiz.label;
  showQuestion();
}

/* ---------- Träna: frågor ---------- */
function showQuestion() {
  const q = quiz;
  const k = q.queue[q.idx];
  let [a, b] = parseKey(k);
  // visa ibland spegelvänt, 4×6 och 6×4 är ju samma sak!
  if (a !== b && Math.random() < 0.5) [a, b] = [b, a];
  q.current = { key: k, a, b, t0: performance.now(), done: false };

  $("#q-display").textContent = `${a} × ${b}`;
  $("#q-progress-text").textContent = `Fråga ${q.idx + 1} av ${q.queue.length}`;
  $("#q-progress-fill").style.width = (q.idx / q.queue.length) * 100 + "%";
  $("#feedback").innerHTML = "";
  $("#q-buttons").hidden = false;

  const input = $("#q-input");
  input.value = "";
  input.disabled = false;
  input.focus();

  updateStreakBadge();
}

function updateStreakBadge() {
  const el = $("#q-streak");
  if (quiz && quiz.streak >= 2) {
    el.textContent = `Svit: ${quiz.streak}`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// Om ett tal blir fel läggs det in igen lite senare i samma runda.
function requeue(k) {
  const q = quiz;
  if (q.queue.length >= q.cap) return;
  if (q.queue.slice(q.idx + 1).includes(k)) return;
  const pos = Math.min(q.idx + 2 + Math.floor(Math.random() * 2), q.queue.length);
  q.queue.splice(pos, 0, k);
}

function submitAnswer(skip) {
  const q = quiz;
  if (!q || !q.current || q.current.done) return;
  const cur = q.current;
  const raw = $("#q-input").value.trim();
  if (!skip && raw === "") return;

  const ms = performance.now() - cur.t0;
  const answer = cur.a * cur.b;
  const correct = !skip && Number(raw) === answer;
  const fb = $("#feedback");
  const tip = tipFor(cur.a, cur.b);

  // Ledtråd först: vid första felet (eller "Vet inte") visas bara knepet,
  // utan facit, och man får en ny chans att komma på svaret själv.
  if (!correct && !cur.hinted) {
    cur.hinted = true;
    const input = $("#q-input");
    input.value = "";
    input.focus();
    fb.innerHTML =
      `<div class="fb hint">${skip ? "Prova med knepet:" : "Inte riktigt. Prova med knepet:"}</div>` +
      `<div class="tip-box"><strong>${tip.title}</strong><br>${tip.hint || tip.text}</div>`;
    return;
  }

  cur.done = true;
  $("#q-input").disabled = true;
  $("#q-buttons").hidden = true;

  const slowLimit = slowMs();
  const quickLimit = fastMs();
  const hinted = correct && cur.hinted; // rätt, men först efter ledtråden
  recordAnswer(cur.key, correct, correct && !hinted ? ms : null);
  q.answered++;
  q.results.push({ key: cur.key, a: cur.a, b: cur.b, correct, ms, hinted: !!cur.hinted });

  if (correct) {
    q.corrects++;
    if (hinted) {
      // räknas som rätt i rundan, men talet måste bevisas utan hjälp
      q.streak = 0;
      q.hints.add(cur.key);
      q.need[cur.key] = 2;
      requeue(cur.key);
    } else {
      q.streak++;
      q.bestStreak = Math.max(q.bestStreak, q.streak);
      state.totals.bestStreak = Math.max(state.totals.bestStreak, q.streak);
      if (ms >= slowLimit) q.slows.add(cur.key);

      // revansch: ett tal som blivit fel måste sitta två gånger i rad
      if (q.need[cur.key]) {
        q.need[cur.key]--;
        if (q.need[cur.key] > 0) requeue(cur.key);
        else delete q.need[cur.key];
      }

      // tre snabba rätt i rad: talet sitter, bocka av det automatiskt
      const st = getStat(cur.key);
      if (!state.known[cur.key] && st.fastRow >= AUTO_KNOWN_ROW) {
        state.known[cur.key] = true;
        q.autoKnown.push(cur.key);
        toast(`${cur.a} × ${cur.b} sitter! Avbockad i tabellen.`);
      }
    }
  } else {
    q.streak = 0;
    q.misses.add(cur.key);
    q.need[cur.key] = 2;
  }
  save();
  updateStreakBadge();

  if (correct && hinted) {
    fb.innerHTML = `<div class="fb ok">Rätt! Knepet funkade.</div>`;
    q.timer = setTimeout(nextQuestion, 900);
  } else if (correct && ms < slowLimit) {
    fb.innerHTML = `<div class="fb ok">Rätt!${ms < quickLimit ? " Blixtsnabbt!" : ""}</div>`;
    q.timer = setTimeout(nextQuestion, 800);
  } else {
    const head = correct
      ? `<div class="fb ok">Rätt! Men den tog en liten stund.</div>`
      : `<div class="fb bad">${skip ? "" : "Inte riktigt, "}${cur.a} × ${cur.b} = <strong>${answer}</strong></div>`;
    fb.innerHTML =
      head +
      `<div class="tip-box"><strong>${tip.title}</strong><br>${tip.text}</div>` +
      (correct ? "" : dotsHtml(cur.a, cur.b)) +
      `<button class="btn" id="next-btn">Nästa</button>`;
    if (!correct) bindDotsFlip(fb, cur.a, cur.b);
    $("#next-btn").addEventListener("click", nextQuestion);
    $("#next-btn").focus();
    if (!correct) requeue(cur.key);
  }
}

function nextQuestion() {
  const q = quiz;
  if (!q) return;
  clearTimeout(q.timer);
  q.idx++;
  if (q.idx >= q.queue.length) finishRound();
  else showQuestion();
}

function quitRound() {
  if (quiz) clearTimeout(quiz.timer);
  quiz = null;
  showScreen("setup");
}

/* ---------- Träna: resultat ---------- */
function finishRound() {
  const q = quiz;
  state.totals.rounds++;
  save();

  const pct = q.answered ? Math.round((q.corrects / q.answered) * 100) : 0;
  let headline, ringColor;
  if (pct === 100) { headline = "Alla rätt!"; ringColor = "#16a34a"; }
  else if (pct >= 80) { headline = "Snyggt jobbat!"; ringColor = "#16a34a"; }
  else if (pct >= 50) { headline = "Bra kämpat!"; ringColor = "#d97706"; }
  else { headline = "Bra start, knepen hjälper dig!"; ringColor = "#be185d"; }

  const correctTimes = q.results.filter((r) => r.correct && !r.hinted);
  let statPills = "";
  if (q.bestStreak >= 3) statPills += `<span class="pill">Svit: ${q.bestStreak}</span>`;
  if (correctTimes.length) {
    const mean = correctTimes.reduce((s, r) => s + r.ms, 0) / correctTimes.length;
    statPills += `<span class="pill">Snitt: ${fmtSec(mean)}</span>`;
    const fastest = correctTimes.reduce((m, r) => (r.ms < m.ms ? r : m));
    statPills += `<span class="pill">Snabbast: ${fastest.a} × ${fastest.b} (${fmtSec(fastest.ms)})</span>`;
  }

  const workKeys = [...new Set([...q.misses, ...q.hints, ...q.slows])];
  let workHtml = "";
  if (workKeys.length) {
    const rows = workKeys
      .map((k) => {
        const [a, b] = parseKey(k);
        const tip = tipFor(a, b);
        const tags =
          (q.misses.has(k) ? `<span class="chip-tag chip-bad">fel</span>` : "") +
          (q.hints.has(k) && !q.misses.has(k) ? `<span class="chip-tag chip-hint">med ledtråd</span>` : "") +
          (q.slows.has(k) ? `<span class="chip-tag chip-slow">långsam</span>` : "");
        return `<div class="work-row">
          <div class="work-fact">${a} × ${b} = ${a * b}${tags}</div>
          <div class="work-tip">${tip.text}</div>
        </div>`;
      })
      .join("");
    workHtml = `<div class="card"><h2>Tal att jobba vidare på</h2>${rows}</div>`;
  } else {
    workHtml = `<div class="card center"><p style="margin:4px 0">Inga luckor i den här rundan, allt satt direkt!</p></div>`;
  }

  let autoHtml = "";
  if (q.autoKnown.length) {
    const names = q.autoKnown.map((k) => { const [a, b] = parseKey(k); return `${a} × ${b}`; }).join(", ");
    autoHtml = `<div class="card note-card"><strong>Nu sitter: ${names}.</strong> Tre snabba rätt i rad, så de är avbockade i tabellen åt dig.</div>`;
  }

  let buttons = "";
  if (workKeys.length) {
    buttons += `<button class="btn gaps" id="train-work-btn">Träna på dessa (${workKeys.length})</button>`;
  }
  buttons += `<button class="btn ${workKeys.length ? "secondary" : ""}" id="again-btn">En runda till</button>`;
  buttons += `<button class="btn ghost" id="change-btn">Ändra val</button>`;

  $("#result-screen").innerHTML = `
    <div class="card center">
      <div class="ring" style="--pct:${pct};--ring-color:${ringColor}">
        <div class="ring-inner">
          <span class="ring-big">${q.corrects}/${q.answered}</span>
          <span class="ring-small">rätt</span>
        </div>
      </div>
      <h2>${headline}</h2>
      <div class="result-stats">${statPills}</div>
    </div>
    ${autoHtml}
    ${workHtml}
    <div class="result-buttons">${buttons}</div>`;

  const opts = q.opts;
  quiz = null;
  showScreen("result");
  window.scrollTo({ top: 0 });

  if (workKeys.length) {
    $("#train-work-btn").addEventListener("click", () =>
      startRound({ facts: workKeys, keepKnown: true, label: "Dina luckor" })
    );
  }
  $("#again-btn").addEventListener("click", () => startRound(opts));
  $("#change-btn").addEventListener("click", () => showScreen("setup"));
}

/* ---------- Tabellen (bocka av det man kan) ---------- */
function makeCell(text, cls) {
  const el = document.createElement("button");
  el.className = "cell " + cls;
  el.textContent = text;
  return el;
}

// Bygger rutnätet. Bara ena halvan är klickbar, resten är spegling och visas utgråad.
// mode "mark": klicka för att bocka av tal man kan. mode "heat": färg efter statistik.
function renderMulGrid(container, mode) {
  container.innerHTML = "";
  const corner = makeCell("×", "head corner");
  corner.tabIndex = -1;
  container.appendChild(corner);

  for (let c = 1; c <= 10; c++) {
    const h = makeCell(c, mode === "mark" ? "head" : "head corner");
    if (mode === "mark") {
      h.title = `Bocka av hela ${c}:ans tabell`;
      h.addEventListener("click", () => toggleTable(c));
    } else {
      h.tabIndex = -1;
    }
    container.appendChild(h);
  }

  for (let r = 1; r <= 10; r++) {
    const h = makeCell(r, mode === "mark" ? "head" : "head corner");
    if (mode === "mark") {
      h.title = `Bocka av hela ${r}:ans tabell`;
      h.addEventListener("click", () => toggleTable(r));
    } else {
      h.tabIndex = -1;
    }
    container.appendChild(h);

    for (let c = 1; c <= 10; c++) {
      const k = keyOf(r, c);
      const label = state.settings.showAnswers || mode === "heat" ? r * c : `${r}·${c}`;

      // övre halvan (kolumn > rad) är bara en spegling, grå och oklickbar
      if (c > r) {
        const cell = makeCell(label, "mirror");
        cell.disabled = true;
        cell.tabIndex = -1;
        container.appendChild(cell);
        continue;
      }

      let cell;
      if (mode === "mark") {
        cell = makeCell(label, state.known[k] ? "known" : "");
        if (FANCY_TABLE) cell.style.setProperty("--c", ROW_COLORS[r]);
        cell.setAttribute("aria-pressed", !!state.known[k]);
        cell.setAttribute("aria-label", `${r} gånger ${c}`);
        cell.addEventListener("click", () => toggleKnown(r, c));
      } else {
        cell = makeCell(label, heatClass(k));
        cell.setAttribute("aria-label", `${r} gånger ${c}`);
        cell.addEventListener("click", () => {
          const rec = recentOf(k);
          if (!rec.length) {
            toast(`${r} × ${c} = ${r * c} | inte testad än`);
          } else {
            const med = medTime(k);
            const s = getStat(k);
            const resting = s.due > Date.now() ? " | vilar" : "";
            toast(`${r} × ${c} = ${r * c} | senaste ${rec.length}: ${recentWrong(k)} fel${med != null ? ` | ca ${fmtSec(med)}` : ""}${resting}`);
          }
        });
      }
      container.appendChild(cell);
    }
  }
}

function renderGrid() {
  renderMulGrid($("#mul-grid"), "mark");
  updateKnownProgress();
}

function toggleKnown(r, c) {
  const k = keyOf(r, c);
  if (state.known[k]) delete state.known[k];
  else state.known[k] = true;
  save();
  renderGrid();
}

function toggleTable(n) {
  const keys = [];
  for (let i = 1; i <= 10; i++) keys.push(keyOf(n, i));
  const allKnown = keys.every((k) => state.known[k]);
  for (const k of keys) {
    if (allKnown) delete state.known[k];
    else state.known[k] = true;
  }
  toast(allKnown ? `${n}:ans tabell avmarkerad` : `Hela ${n}:ans tabell avbockad`);
  save();
  renderGrid();
}

function updateKnownProgress() {
  const known = Object.keys(state.known).length;
  $("#known-fill").style.width = (known / ALL_FACTS.length) * 100 + "%";
  $("#known-text").textContent =
    known === 0
      ? "Inget avbockat ännu. Klicka på talen du redan kan, så ser du vad som är kvar att öva på."
      : known === ALL_FACTS.length
        ? "Alla 55 tal avbockade, hela tabellen sitter!"
        : `${known} av ${ALL_FACTS.length} tal avbockade, kvar att öva på: ${ALL_FACTS.length - known}.`;
}

/* ---------- Knepen ---------- */
function renderMnemonicCards() {
  const wrap = $("#mnemonic-cards");
  wrap.innerHTML = MNEMONIC_ORDER.map((k) => {
    const [a, b] = parseKey(k);
    const m = MNEMONICS[k];
    const sec = FILM_TIDER[k];
    const alt = MNEMO_BILD_ALT[k];
    return `<div class="mnemo">
      <div class="mnemo-fact">${a} × ${b} = ${a * b} <span class="mnemo-sep">|</span> ${m.title}</div>
      ${alt ? `<img class="mnemo-img" src="bilder/${k}.webp" alt="${alt}" loading="lazy" width="640" height="640">` : ""}
      <p>${m.text}</p>
      ${FILM_ID && sec ? `<button type="button" class="linkish mnemo-film" data-sec="${sec}">Se i filmen (${fmtTid(sec)})</button>` : ""}
    </div>`;
  }).join("");
}

/* ---------- Knepen: animerade rutnät som krymper ---------- */
// I vilken ordning tabellen krymper i filmen. Returnerar steget då rutan
// (r, c) stryks: 0 = spegelhalvan (kommutativa lagen), 1..7 = respektive
// tabell i tur och ordning, -1 = överlever (en av de sex svåra).
function eliminationStep(r, c) {
  if (c > r) return 0; // övre triangeln är bara en spegling
  const order = [1, 10, 5, 9, 2, 4, 3];
  for (let i = 0; i < order.length; i++) {
    if (r === order[i] || c === order[i]) return i + 1;
  }
  return -1; // 6, 7, 8 i båda led = de sex svåra
}

function renderTrickAnims() {
  const wraps = $$(".trick-anim");
  if (!wraps.length) return;

  for (const wrap of wraps) {
    const step = Number(wrap.dataset.step);
    const grid = document.createElement("div");
    grid.className = "trick-grid";
    let leaving = 0;
    let remain = 0;
    for (let r = 1; r <= 10; r++) {
      for (let c = 1; c <= 10; c++) {
        const cell = document.createElement("span");
        cell.className = "tcell";
        const e = eliminationStep(r, c);
        if (step >= 8) {
          cell.classList.add(e === -1 ? "six" : "gone");
        } else if (e === step) {
          cell.classList.add("leaving");
          cell.style.transitionDelay = Math.min(leaving++ * 14, 650) + "ms";
        } else if (e !== -1 && e < step) {
          cell.classList.add("gone");
        } else {
          cell.classList.add("remain");
          remain++;
        }
        grid.appendChild(cell);
      }
    }
    wrap.appendChild(grid);

    const cap = document.createElement("p");
    cap.className = "trick-caption";
    cap.textContent = step >= 8 ? "Bara 6 tal kvar att memorera!" : `${remain} tal kvar`;
    wrap.appendChild(cap);
  }

  // spela när kortet skrollas in i bild, återställ när det lämnar (så det
  // spelas om både när man skrollar tillbaka och när man öppnar fliken igen)
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          // starta först när (nästan) hela rutan syns ...
          if (ent.intersectionRatio >= 0.9) ent.target.classList.add("play");
          // ... och nollställ först när den skrollats helt ur bild (så den kan spelas om)
          else if (!ent.isIntersecting) ent.target.classList.remove("play");
        }
      },
      { threshold: [0, 0.9] }
    );
    wraps.forEach((w) => io.observe(w));
  } else {
    wraps.forEach((w) => w.classList.add("play"));
  }
}

function bindTrainButtons() {
  $$("[data-train]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.train;
      if (v === "hard") {
        // alltid alla sex, oavsett vad som bockats av i tabellen
        startRound({ facts: HARD_SIX, keepKnown: true, count: Math.max(state.settings.count, 6), label: "De sex svåra" });
      } else {
        const n = Number(v);
        startRound({ tables: [n], label: `${n}:ans tabell` });
      }
    });
  });
}

/* ---------- Statistik ---------- */
function heatClass(k) {
  const rec = recentOf(k);
  if (!rec.length) return "heat-none";
  const wrongRate = recentWrong(k) / rec.length;
  const med = medTime(k);
  if (wrongRate >= 1 / 3 || (med != null && med >= slowMs())) return "heat-bad";
  if (wrongRate > 0 || med == null || med >= greenMs() || rec.length < 2) return "heat-mid";
  return "heat-good";
}

function renderStats() {
  const wrap = $("#stats-content");
  const t = state.totals;

  if (t.answers === 0) {
    wrap.innerHTML = `
      <div class="card center">
        <h2>Här kommer din statistik</h2>
        <p class="muted">Kör en träningsrunda först! Sedan ser du här vilka tal du är snabb på, och vilka som behöver extra träning.</p>
        <button class="btn" id="goto-train-btn">Till träningen</button>
      </div>`;
    $("#goto-train-btn").addEventListener("click", () => showTab("trana"));
    return;
  }

  const pct = t.answers ? Math.round((t.correct / t.answers) * 100) : 0;
  const tilesHtml = `
    <div class="card">
      <div class="tiles">
        <div class="tile"><div class="val">${t.rounds}</div><div class="lbl">Rundor</div></div>
        <div class="tile"><div class="val">${t.answers}</div><div class="lbl">Frågor</div></div>
        <div class="tile"><div class="val">${pct}%</div><div class="lbl">Rätt</div></div>
        <div class="tile"><div class="val">${t.bestStreak}</div><div class="lbl">Bästa svit</div></div>
      </div>
    </div>`;

  const weak = weakFacts().slice(0, 8);
  let weakHtml;
  if (weak.length) {
    const rows = weak
      .map((k) => {
        const [a, b] = parseKey(k);
        const rec = recentOf(k);
        const wrongs = recentWrong(k);
        const med = medTime(k);
        let badges = "";
        if (wrongs > 0) badges += `<span class="chip-tag chip-bad">${wrongs} fel av ${rec.length}</span>`;
        if (med != null && med > weakMs()) badges += `<span class="chip-tag chip-slow">ca ${fmtSec(med)}</span>`;
        return `<div class="weak-row">
          <span class="weak-fact">${a} × ${b} = ${a * b}</span>
          <span class="weak-badges">${badges}</span>
        </div>`;
      })
      .join("");
    weakHtml = `<div class="card">
      <h2>Dina luckor just nu</h2>
      <p class="muted">Talen som gått fel eller tagit längst tid. Täpp igen luckorna!</p>
      ${rows}
      <button class="btn big gaps" id="train-gaps-btn">Träna på dessa</button>
    </div>`;
  } else {
    weakHtml = `<div class="card">
      <h2>Dina luckor just nu</h2>
      <p class="muted">Inga tydliga luckor just nu, snyggt! Kör fler rundor så håller vi koll.</p>
    </div>`;
  }

  const heatHtml = `<div class="card">
    <h2>Din karta</h2>
    <p class="muted">Färgen visar hur det går för varje tal. Tryck på en ruta för detaljer.</p>
    <div class="grid-wrap"><div class="mul-grid" id="heat-grid"></div></div>
    <div class="legend">
      <span><i class="dot l-good"></i>Säker</span>
      <span><i class="dot l-mid"></i>På gång</span>
      <span><i class="dot l-bad"></i>Träna mer</span>
      <span><i class="dot l-none"></i>Inte testad</span>
    </div>
  </div>`;

  const resetHtml = `<div class="card">
    <h2>Börja om</h2>
    <div class="reset-row">
      <button class="btn danger-ghost" id="reset-stats-btn">Nollställ statistik</button>
      <button class="btn danger-ghost" id="reset-known-btn">Nollställ avbockningar</button>
    </div>
  </div>`;

  wrap.innerHTML = tilesHtml + weakHtml + heatHtml + resetHtml;

  renderMulGrid($("#heat-grid"), "heat");

  if (weak.length) {
    $("#train-gaps-btn").addEventListener("click", () =>
      startRound({ facts: weak, keepKnown: true, label: "Mina luckor" })
    );
  }
  $("#reset-stats-btn").addEventListener("click", () => {
    if (confirm("Vill du nollställa all din statistik? Avbockningarna i tabellen behålls.")) {
      state.stats = {};
      state.totals = defaultState().totals;
      save();
      renderStats();
      toast("Statistiken är nollställd.");
    }
  });
  $("#reset-known-btn").addEventListener("click", () => {
    if (confirm("Vill du ta bort alla dina avbockningar i tabellen?")) {
      state.known = {};
      save();
      renderStats();
      toast("Avbockningarna är borttagna.");
    }
  });
}

/* ---------- Start ---------- */
/* ---------- Kontaktformulär (skickar direkt via FormSubmit) ---------- */
function bindContactForm() {
  const form = $("#contact-form");
  if (!form) return;
  const note = $("#contact-note");
  const btn = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#contact-email").value.trim();
    const msg = $("#contact-message").value.trim();
    const honey = $("#contact-honey") ? $("#contact-honey").value : "";
    if (!msg) {
      note.textContent = "Skriv gärna ett meddelande först.";
      $("#contact-message").focus();
      return;
    }
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Skickar …";
    note.textContent = "";
    try {
      const res = await fetch("https://formsubmit.co/ajax/info@jonasvonessen.se", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          Meddelande: msg,
          "E-post (besökare)": email || "(ingen angiven)",
          _replyto: email || "",
          _subject: "Hälsning från gångertabellen.se",
          _template: "table",
          _captcha: "false",
          _honey: honey,
        }),
      });
      if (!res.ok) throw new Error("status " + res.status);
      form.reset();
      note.textContent = "Tack! Ditt meddelande har skickats. 🎉";
    } catch {
      note.innerHTML =
        'Hoppsan, det gick inte att skicka just nu. Du kan mejla direkt till <a href="mailto:info@jonasvonessen.se">info@jonasvonessen.se</a>.';
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

// Låter bilden kika upp bakom kontaktkortet när kontaktdelen skrollas i bild.
function setupContactPeek() {
  const contact = $(".contact");
  if (!contact) return;
  if (!("IntersectionObserver" in window)) {
    contact.classList.add("in-view");
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) contact.classList.toggle("in-view", e.isIntersecting);
    },
    { threshold: 0.15 }
  );
  io.observe(contact);
}

/* ---------- Läxlänkar: starta träning direkt via adressen ---------- */
// gångertabellen.se/#tabell=5,9&antal=10 startar en runda direkt, perfekt att
// skicka som läxa. Även #traning=sex-svara och #traning=luckor fungerar.
function startFromHash() {
  const h = location.hash.replace(/^#/, "");
  if (!h) return false;
  const params = new URLSearchParams(h);

  const antal = Number(params.get("antal"));
  if ([5, 10, 20].includes(antal)) {
    state.settings.count = antal;
    save();
  }

  const traning = params.get("traning");
  if (traning === "sex-svara") {
    startRound({ facts: HARD_SIX, keepKnown: true, count: Math.max(state.settings.count, 6), label: "De sex svåra" });
    return true;
  }
  if (traning === "luckor") {
    const weak = weakFacts().slice(0, 8);
    if (!weak.length) return false;
    startRound({ facts: weak, keepKnown: true, label: "Mina luckor" });
    return true;
  }

  const tabell = params.get("tabell");
  if (tabell) {
    const tables = [...new Set(tabell.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10))];
    if (tables.length) {
      state.settings.lastTables = tables;
      save();
      renderTableChips();
      const sorted = [...tables].sort((x, y) => x - y);
      const label = sorted.length === 10 ? "Hela tabellen" : "Tabell " + sorted.join(", ");
      startRound({ tables, label });
      return true;
    }
  }
  return false;
}

// Tillbaka till startvyn (samma som när man landar): Träna-fliken, uppstartsskärmen.
function goHome() {
  if (quiz) {
    clearTimeout(quiz.timer);
    quiz = null;
  }
  showScreen("setup");
  showTab("trana");
}

function init() {
  // slå på/av det "fancy" utseendet på Tabellen (se FANCY_TABLE ovan)
  document.body.classList.toggle("tbl-fancy", FANCY_TABLE);

  // flikar
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  // klick på rubriken tar dig till startvyn
  $("#home-btn").addEventListener("click", goHome);

  // uppstartsval
  renderTableChips();
  $("#chips-all").addEventListener("click", () => {
    const all = state.settings.lastTables.length === 10;
    state.settings.lastTables = all ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    save();
    renderTableChips();
  });

  const seg = $("#count-seg");
  const syncSeg = () =>
    Array.from(seg.children).forEach((b) =>
      b.classList.toggle("on", Number(b.dataset.count) === state.settings.count)
    );
  syncSeg();
  Array.from(seg.children).forEach((b) =>
    b.addEventListener("click", () => {
      state.settings.count = Number(b.dataset.count);
      save();
      syncSeg();
    })
  );

  $("#start-btn").addEventListener("click", () => {
    const tables = [...state.settings.lastTables].sort((x, y) => x - y);
    if (tables.length === 0) {
      toast("Välj minst en tabell först!");
      return;
    }
    const label = tables.length === 10 ? "Hela tabellen" : "Tabell " + tables.join(", ");
    startRound({ tables, label });
  });

  $("#quick-hard").addEventListener("click", () => {
    // till översikten med minnesreglerna först, träningen startas därifrån
    showTab("tips");
    requestAnimationFrame(() => {
      const card = $("#sex-svara");
      if (card) card.scrollIntoView({ block: "start" });
    });
  });
  $("#quick-gaps").addEventListener("click", () => {
    const weak = weakFacts().slice(0, 8);
    if (weak.length === 0) {
      toast("Kör en träningsrunda först, så ser jag vad du behöver öva på.");
      return;
    }
    startRound({ facts: weak, keepKnown: true, label: "Mina luckor" });
  });

  // quiz
  const input = $("#q-input");
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "");
    const cur = quiz && quiz.current;
    if (!cur || cur.done) return;
    // rätta automatiskt när rätt antal siffror är skrivna
    if (input.value.length >= String(cur.a * cur.b).length) submitAnswer(false);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAnswer(false);
  });
  $("#ok-btn").addEventListener("click", () => submitAnswer(false));
  $("#idk-btn").addEventListener("click", () => submitAnswer(true));
  $("#quit-btn").addEventListener("click", quitRound);

  // tabellen
  const showAns = $("#show-answers");
  showAns.checked = state.settings.showAnswers;
  showAns.addEventListener("change", () => {
    state.settings.showAnswers = showAns.checked;
    save();
    renderGrid();
  });

  // knepen
  renderMnemonicCards();
  renderTrickAnims();
  bindTrainButtons();

  // kontaktformulär
  bindContactForm();

  // bilden som kikar upp bakom kontaktkortet
  setupContactPeek();

  // filmen: spelare och hoppknappar per knep
  bindFilmButtons();

  // läxlänk: kopiera en adress som startar det valda träningsvalet direkt
  $("#copy-link").addEventListener("click", async () => {
    const tables = [...state.settings.lastTables].sort((x, y) => x - y);
    if (!tables.length) {
      toast("Välj minst en tabell först!");
      return;
    }
    const url = location.href.split("#")[0] + "#tabell=" + tables.join(",") + "&antal=" + state.settings.count;
    try {
      await navigator.clipboard.writeText(url);
      toast("Länk kopierad! Den som öppnar den hamnar direkt i träningen.");
    } catch {
      prompt("Kopiera länken:", url);
    }
  });

  // läxlänkar i adressen startar träningen direkt
  window.addEventListener("hashchange", startFromHash);
  startFromHash();
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", init);
}

// gör logiken testbar i Node (används inte i webbläsaren)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    keyOf, parseKey, median, tipFor, difficulty, weightOf, weakFacts,
    weightedSample, buildQueue, heatClass, recordAnswer, migrateStats,
    fastMs, greenMs, slowMs, weakMs, dueFactor, medTime, getStat, recentWrong,
    dotsHtml, PLURAL,
    ALL_FACTS, HARD_SIX, MNEMONICS, BOX_REST_MS, state,
  };
}
