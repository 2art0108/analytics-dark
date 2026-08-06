import React from 'react';
import { DCLogic } from '../dc-runtime.js';
import StatusBar from '../components/StatusBar.jsx';

class AnalyticsScreen extends DCLogic {
  // page 0 = current period, higher = further back
  state = { activeTab: 0, activePeriod: 1, chartType: "bars", selectedBar: 5, page: 0, scrolled: false, scrollMap: {}, animTick: 0, segment: null, segEntered: false, listPhase: "in",
    pickerOpen: false, pickCurrency: "UAH", chipLabel: "Усі картки та конверти",
    pickCardSel: { all: true, ids: [] }, pickEnvSel: { all: true, ids: [] },
    chipScroll: 0, chipMax: 0, badgeW: 0, badgeBoxW: 0, catBadgeW: 0, catBadgeBoxW: 0,
    theme: "dark", themeFade: false,
    // navigation: "main" | "calendar" | "category"
    screen: "main", navFrom: null, navDir: 1, initialSel: true,
    custom: null, calCtx: "main", calDraft: { start: null, end: null },
    cat: null };

  bump(patch) { this.setState((s) => ({ segment: null, segEntered: false, listPhase: "in", noGrow: false, initialSel: false, ...patch, animTick: s.animTick + 1 })); }

  // iOS-style push: the outgoing screen slides a little left, the incoming one
  // comes in from the right (reversed on back). Only the screen bodies move —
  // the status/nav layer and the home indicator are outside this stack.
  static NAV_MS = 400;
  static NAV_EASE = "400ms cubic-bezier(0.32, 0.72, 0, 1) both";
  nav(next, dir, patch) {
    if (this._navT) clearTimeout(this._navT);
    this.setState((s) => Object.assign({ screen: next, navFrom: s.screen, navDir: dir, scrolled: dir === 1 ? false : !!(s.scrollMap || {})[next] },
      s.initialSel ? { selectedBar: null, initialSel: false } : null, patch || null));
    this._navT = setTimeout(() => { this._navT = null; this.setState({ navFrom: null }); }, AnalyticsScreen.NAV_MS);
  }
  screenAnim(name) {
    const st = this.state;
    if (!st.navFrom || st.navFrom === st.screen) return "none";
    if (name === st.screen) return (st.navDir > 0 ? "pushInR " : "pushInL ") + AnalyticsScreen.NAV_EASE;
    if (name === st.navFrom) return (st.navDir > 0 ? "pushOutL " : "pushOutR ") + AnalyticsScreen.NAV_EASE;
    return "none";
  }
  screenLive(name) { return this.state.screen === name || this.state.navFrom === name; }

  // Two-step list swap: fade the current block out, then mount the next one.
  startSwap(next) {
    if (next === this.state.segment) return;
    // segment → segment keeps the transactions list mounted: swap content instantly,
    // only animate when the list TYPE changes (categories ↔ transactions)
    if (next !== null && this.state.segment !== null) {
      this.setState((s) => ({ segment: next, segEntered: true, listPhase: "none", animTick: s.animTick + 1 }));
      return;
    }
    clearTimeout(this._swapT);
    this.setState({ listPhase: "out" });
    this._swapT = setTimeout(() => {
      this.setState((s) => ({
        segment: next,
        segEntered: next !== null && s.segment !== null,
        listPhase: "in",
        animTick: s.animTick + 1,
      }));
    }, 200);
  }

  componentWillUnmount() { clearTimeout(this._swapT); clearTimeout(this._chipT); }

  // Overflow is measured from the element, not inferred from scroll events —
  // a label that fits never fires a scroll, so it must report chipMax 0.
  chipParts() {
    const root = this._rootEl || document;
    const sc = root.querySelector('span[style*="max-width: 100%"]');
    if (!sc) return null;
    const wrap = sc.parentElement;
    const fades = [...wrap.children].filter((c) => /position: absolute/.test(c.getAttribute("style") || ""));
    return { sc: sc, l: fades[0], r: fades[1] };
  }

  measureChip() {
    const p = this.chipParts();
    if (!p) return;
    const max = Math.max(0, p.sc.scrollWidth - p.sc.clientWidth);
    const left = Math.min(p.sc.scrollLeft, max);
    if (Math.abs(max - this.state.chipMax) > 1 || Math.abs(left - this.state.chipScroll) > 1) {
      this.setState({ chipMax: max, chipScroll: left });
    }
  }

  // Temporary switch: the nav title is the trigger. Only the token sheet swaps, so
  // screen, period, chart type, scroll and navigation state all survive untouched.
  toggleTheme() {
    if (this._themeBusy) return;
    this._themeBusy = true;
    this.setState({ themeFade: true });
    setTimeout(() => this.setState((st) => ({ theme: st.theme === "dark" ? "light" : "dark" })), 150);
    setTimeout(() => { this.setState({ themeFade: false }); this._themeBusy = false; }, 200);
  }

  badgeEl() {
    return document.querySelector('[data-badge="main"]');
  }

  badgeKeyCat() {
    const c = this.state.cat;
    if (!c) return "none";
    return "c" + c.pool + (c.income ? "i" : "e") + "|" + c.period + "|" + c.page + "|" + c.selectedBar + "|" + (c.custom ? c.custom.from + c.custom.to : "");
  }

  // identity of what the badge is currently showing
  // every distinct badge — main and each category's own timeframe — gets its own key,
  // so switching screens or periods never reuses a stale measurement
  badgeKey() {
    const c = this.state.cat;
    const cat = this.state.screen === "category" && c
      ? "c" + c.pool + (c.income ? "i" : "e") + "|" + c.period + "|" + c.page + "|" + c.selectedBar + "|" + (c.custom ? c.custom.from + c.custom.to : "")
      : "m";
    return this.state.screen + "|" + cat + "|" + this.state.activeTab + "|" + this.state.activePeriod + "|" + this.state.page + "|" + this.state.selectedBar + "|" + (this.state.custom ? this.state.custom.from + this.state.custom.to : "");
  }

  // Two widths per badge: the text itself (positions the resting badge) and the padded
  // box (clamps the selected one inside the card). The main badge and the category
  // badge are measured independently — each keyed to its own identity, so a screen or
  // period change always re-reads. Repeating the same reading is what stops the loop.
  measureBadge() {
    this.measureOne('[data-badge="main"]', "badgeW", "badgeBoxW", this.badgeKey(), "m");
    if (this.state.cat) this.measureOne('[data-badge="cat"]', "catBadgeW", "catBadgeBoxW", this.badgeKeyCat(), "c");
  }

  measureOne(sel, wKey, boxKey, key, tag) {
    const el = document.querySelector(sel);
    if (!el) return;
    const inner = el.firstElementChild;
    if (!inner || !inner.children.length) return;
    let w = 0;
    for (let i = 0; i < inner.children.length; i++) w = Math.max(w, inner.children[i].offsetWidth);
    const box = inner.offsetWidth;
    if (!w || !isFinite(w)) return;
    const st = this["_bm" + tag] || (this["_bm" + tag] = {});
    if (st.key !== key) { st.key = key; st.lastW = null; st.lastBox = null; }
    const settled = st.lastW !== null && Math.abs(w - st.lastW) <= 1 && Math.abs(box - st.lastBox) <= 1;
    const moved = Math.abs(w - (this.state[wKey] || 0)) > 1 || Math.abs(box - (this.state[boxKey] || 0)) > 1;
    st.lastW = w;
    st.lastBox = box;
    if (moved && !settled) {
      const patch = {};
      patch[wKey] = w;
      patch[boxKey] = box;
      this.setState(patch, () => { this._badgeReady = true; });
    } else {
      this._badgeReady = true;
    }
  }

  static BADGE_PAD = 28; // 14px each side once the badge background is showing

  catPeriodChanged(c) {
    const key = c.pool + "|" + c.income + "|" + c.period + "|" + c.page + "|" + (c.custom ? c.custom.from + c.custom.to : "");
    if (key !== this._catPeriodKey) {
      this._catPeriodKey = key;
      this._catPeriodTick = (this._catPeriodTick || 0) + 1;
      this._catPeriodChanged = this._catPeriodSeen === true;
      this._catPeriodSeen = true;
      this._catPeriodSel = c.selectedBar;
    } else if (this._catPeriodSel !== c.selectedBar) {
      this._catPeriodSel = c.selectedBar;
      this._catPeriodChanged = false;
    }
    return this._catPeriodChanged;
  }

  // Swiping to another period re-plays the counter; selecting a bar does not.
  periodChanged(t, p) {
    const key = t + "|" + p + "|" + this.state.page + "|" + (this.state.custom ? this.state.custom.from + this.state.custom.to : "");
    if (key !== this._periodKey) {
      this._periodKey = key;
      this._periodTick = (this._periodTick || 0) + 1;
      this._periodChanged = this._periodSeen === true;
      this._periodSeen = true;
      this._periodSel = this.state.selectedBar;
    } else if (this._periodSel !== this.state.selectedBar) {
      // selecting or clearing a bar inside the same period cancels the counter
      this._periodSel = this.state.selectedBar;
      this._periodChanged = false;
    }
    return this._periodChanged;
  }

  // Radial: the counter runs on a carousel swipe, on picking / swapping / clearing a
  // category — never on the first reveal while the ring is still drawing, and never
  // when the resulting number is identical to the one already shown.
  radialChanged(t, p, text, noGrow, bars) {
    const seg = this.state.segment;
    // the chart type is part of the key, so a bars→radial remount re-evaluates
    // instead of inheriting the previous radial verdict
    const key = (bars ? "b" : "r") + t + "|" + p + "|" + this.state.page + "|" + (this.state.custom ? this.state.custom.from + this.state.custom.to : "") + "|" + seg;
    if (key === this._radialKey) return this._radialChanged;
    const first = this._radialSeen !== true;
    const segMoved = !first && seg !== this._radialSeg;
    // noGrow means the ring is NOT redrawing (a carousel swipe); a category change
    // counts either way. The first reveal and the bars→radial remount never do.
    this._radialKey = key;
    this._radialSeen = true;
    this._radialSeg = seg;
    this._radialChanged = !bars && !first && text !== this._radialText && (!!noGrow || segMoved);
    if (this._radialChanged) this._radialTick = (this._radialTick || 0) + 1;
    this._radialText = text;
    return this._radialChanged;
  }

  // one span per character, revealed left to right on a very short stagger
  amountChars(text, animate, tick) {
    const name = ["digitInA", "digitInB"][((tick === undefined ? this._periodTick : tick) || 0) % 2];
    return String(text).split("").map((c, i) => ({
      key: "c" + i,
      c: c,
      anim: animate ? name + " 360ms cubic-bezier(0.2, 0.7, 0.2, 1) " + (i * 26) + "ms both" : "none",
    }));
  }

  clampBadge(center, which) {
    // the measured padded box when we have it, the text + padding estimate until then
    const textW = which === "cat" ? this.state.catBadgeW : this.state.badgeW;
    const boxW = which === "cat" ? this.state.catBadgeBoxW : this.state.badgeBoxW;
    const box = boxW && boxW > textW ? boxW : (textW || 200) + AnalyticsScreen.BADGE_PAD;
    const half = box / 2;
    const CARD = 380;
    return Math.round(Math.min(Math.max(center, half), CARD - half) * 10) / 10;
  }

  measureChipLater() {
    setTimeout(() => this.measureChip(), 0);
    setTimeout(() => this.measureChip(), 140);
  }

  _unusedMeasure() {
    const el = this._chipEl;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = el.scrollLeft;
    const fits = max <= 2;
    if (this._fadeL) this._fadeL.style.opacity = !fits && left > 2 ? "1" : "0";
    if (this._fadeR) this._fadeR.style.opacity = !fits && left < max - 2 ? "1" : "0";
  }

  componentDidMount() {
    document.addEventListener("touchstart", function () {}, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { this._measuredFor = null; this.measureBadge(); this.measureChip(); });
    }
    setTimeout(() => this.measureBadge(), 0);
    // native listener + observer: React's synthetic onScroll can miss programmatic
    // scrolls, and a label that fits never scrolls at all
    this._onScrollNative = () => this.measureChip();
    this._attachChip();
    this.measureChipLater();
  }

  _attachChip() {
    const p = this.chipParts();
    if (!p || p.sc === this._boundSc) return;
    if (this._boundSc) this._boundSc.removeEventListener("scroll", this._onScrollNative);
    this._boundSc = p.sc;
    p.sc.addEventListener("scroll", this._onScrollNative, { passive: true });
    if (window.ResizeObserver) {
      if (this._ro) this._ro.disconnect();
      this._ro = new ResizeObserver(() => this.measureChip());
      this._ro.observe(p.sc);
      if (p.sc.firstElementChild) this._ro.observe(p.sc.firstElementChild);
    }
  }

  componentDidUpdate() {
    // the runtime doesn't forward prevState — track the last measured label ourselves
    // measure before paint: a width correction must never land in a second,
    // animated commit (the guard in measureBadge stops a loop)
    this.measureBadge();
    this._hadSelection = this.state.selectedBar !== null;
    this._hadCatSel = !!(this.state.cat && this.state.cat.selectedBar !== null);
    this._attachChip();
    if (this._lastChipLabel !== this.state.chipLabel) {
      this._lastChipLabel = this.state.chipLabel;
      const p = this.chipParts();
      if (p) p.sc.scrollLeft = 0;
      this.measureChipLater();
    }
  }

  static WEEK_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  static WEEK_DAYS = ["понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота", "неділя"];
  static MONTH_NAMES = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
  static MONTH_ABBR = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
  static MONTH_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
  static MONTH_INITIAL = ["С", "Л", "Б", "К", "Т", "Ч", "Л", "С", "В", "Ж", "Л", "Г"];
  // A period label that carries a year abbreviates its month; without a year the
  // full name stays. mon() picks the form, monY() appends the year.
  static mon(m, withYear, genitive) {
    if (withYear) return AnalyticsScreen.MONTH_SHORT[m];
    return genitive ? AnalyticsScreen.MONTH_GEN[m] : AnalyticsScreen.MONTH_NAMES[m];
  }

  static monY(m, y, showYear, genitive) {
    return AnalyticsScreen.mon(m, showYear, genitive) + (showYear ? " " + y : "");
  }

  static MONTH_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  static WEEK_RANGES = ["20 - 26 серпня", "13 - 19 серпня", "6 - 12 серпня", "30 липня - 5 серпня"];

  // Deterministic pseudo-random so every timeframe/page/tab has its own realistic set.
  noise(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── Financial profile ────────────────────────────────────────────────
  // income ≈ 45–55K a month, paid on the 5th (60%), 15th (20%) and 25th (20%);
  // expenses ≈ 40–48K and always below that month's income.
  monthIncome(y, m) { return Math.round((45000 + this.noise(y * 12 + m + 7) * 10000) / 10) * 10; }
  monthExpense(y, m) {
    const inc = this.monthIncome(y, m);
    const exp = 40000 + this.noise(y * 12 + m + 91) * 8000;
    return Math.round(Math.min(exp, inc - 1500) / 10) * 10;
  }
  paySplit(total, seed) {
    const a = Math.round((total * (0.58 + this.noise(seed) * 0.04)) / 10) * 10;
    const b = Math.round((total * (0.19 + this.noise(seed + 1) * 0.03)) / 10) * 10;
    return [a, b, total - a - b];
  }

  // Bar geometry: 6 fixed columns are gone — the plot is a flex row, so only the
  // bar width and its height in px vary with the timeframe.
  spec() { return this.specFor(this.state.activePeriod, this.state.page, this.state.activeTab === 1, this.state.custom, 1, 0); }

  // A custom range replaces the timeframe entirely; `mult` scales a whole
  // dataset down to one category's share of it.
  specFor(tf, page, income, custom, mult, seedShift) {
    const s = custom ? this.customSpec(custom, income) : this.rawSpec(tf, page, income, seedShift);
    if (mult && mult !== 1) return Object.assign({}, s, { values: s.values.map((v) => Math.max(10, Math.round(v * mult / 10) * 10)) });
    return s;
  }

  rawSpec(tf, page, income, seedShift) {
    const seedBase = (tf + 1) * 97 + page * 31 + (income ? 13 : 0) + (seedShift || 0);

    if (tf === 0) {
      // four swipeable weeks covering вересень; income lands on the 5th/15th/25th
      const M = 8, Y = 2025;
      const startDay = 1 + (3 - Math.min(page, 3)) * 7;
      const days = [];
      for (let d = 0; d < 7; d++) days.push(startDay + d);
      const values = days.map((d) => this.dayValue(Y, M, d, income));
      const mn = AnalyticsScreen.MONTH_GEN[M];
      return {
        width: 22,
        axisMax: 0,
        labels: AnalyticsScreen.WEEK_LABELS,
        names: days.map((d) => d + " " + mn),
        values: values,
        range: days[0] + " – " + days[6] + " " + mn,
      };
    }

    if (tf === 1) {
      // absolute months so windows further back never repeat вересень's labels
      const endAbs = 2025 * 12 + 8 - page * 6;
      const cells = [];
      for (let i = 5; i >= 0; i--) { const a = endAbs - i; cells.push({ y: Math.floor(a / 12), m: ((a % 12) + 12) % 12 }); }
      const yr = (c) => (c.y === 2025 ? "" : " " + c.y);
      const base = income ? 15500 : 40000;
      const values = cells.map((c, i) => Math.round((base * (0.72 + this.noise(seedBase + i) * 0.5)) / 10) * 10);
      return {
        width: 22,
        axisMax: 0,
        axisUnit: 1000,
        labels: cells.map((c) => AnalyticsScreen.MONTH_ABBR[c.m]),
        names: cells.map((c) => AnalyticsScreen.monY(c.m, c.y, c.y !== 2025)),
        values: values,
        range: (() => {
          const showY = cells[0].y !== cells[5].y || cells[5].y !== 2025;
          return AnalyticsScreen.monY(cells[0].m, cells[0].y, showY) + " – " + AnalyticsScreen.monY(cells[5].m, cells[5].y, showY);
        })(),
      };
    }
    const base = income ? 260000 : 520000;
    const values = AnalyticsScreen.MONTH_NAMES.map((_, i) => Math.round((base * (0.62 + this.noise(seedBase + i) * 0.62)) / 10) * 10);
    return {
      width: 14,
      axisMax: 0,
      axisUnit: 1000,
      labels: AnalyticsScreen.MONTH_INITIAL,
      names: AnalyticsScreen.MONTH_NAMES,
      values: values,
      range: String(2025 - page),
    };
  }

  // Top gridline: the smallest clean step (1/2/2.5/5/10 × power of ten) that clears
  // the tallest bar, so it always sits just above the data. Middle line is half of it.
  niceMax(max) {
    if (!(max > 0)) return 1000;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      const cand = m * pow;
      if (cand >= max * 1.02) return cand;
    }
    return 10 * pow;
  }

  // The four categories that already exist in the list; shares match the ring.
  static CATS = [
    { name: "Аптеки", color: "#ec3d96", share: 0.327, tx: [
      { logo: "АДД", logoBg: "#ec3d96", logoColor: "#ffffff", name: "Аптека Доброго Дня", date: "24 липня, 11:05", amount: "-820.00 UAH" },
      { logo: "ANC", logoBg: "#1f7a4d", logoColor: "#ffffff", name: "ANC", date: "18 липня, 09:40", amount: "-1 240.50 UAH" },
      { logo: "АДД", logoBg: "#ec3d96", logoColor: "#ffffff", name: "Аптека Доброго Дня", date: "11 липня, 18:22", amount: "-465.00 UAH" },
      { logo: "ПОД", logoBg: "#4b45e0", logoColor: "#ffffff", name: "Подорожник", date: "4 липня, 13:10", amount: "-2 180.00 UAH" } ] },
    { name: "Таксі", color: "#4b45e0", share: 0.164, tx: [
      { logo: "Bolt", logoBg: "#1f9b6a", logoColor: "#ffffff", name: "Bolt", date: "23 липня, 19:30", amount: "-560.50 UAH" },
      { logo: "Bolt", logoBg: "#1f9b6a", logoColor: "#ffffff", name: "Bolt", date: "20 липня, 19:30", amount: "-1 650.00 UAH" },
      { logo: "Uber", logoBg: "var(--brand-black)", logoColor: "#ffffff", name: "Uber", date: "16 липня, 19:30", amount: "-280.00 UAH" },
      { logo: "Uber", logoBg: "var(--brand-black)", logoColor: "#ffffff", name: "Uber", date: "9 липня, 08:15", amount: "-315.00 UAH" } ] },
    { name: "Одяг та взуття", color: "#2ea836", share: 0.115, tx: [
      { logo: "ZARA", logoBg: "var(--brand-black)", logoColor: "#ffffff", name: "Zara", date: "22 липня, 16:48", amount: "-2 990.00 UAH" },
      { logo: "RSV", logoBg: "#1e3a8a", logoColor: "#ffffff", name: "Reserved", date: "14 липня, 15:02", amount: "-1 450.00 UAH" },
      { logo: "INT", logoBg: "#c11c3a", logoColor: "#ffffff", name: "Intertop", date: "6 липня, 12:30", amount: "-3 200.00 UAH" } ] },
    { name: "Дім та ремонт", color: "#f26a11", share: 0.082, tx: [
      { logo: "EPI", logoBg: "#f26a11", logoColor: "#ffffff", name: "Епіцентр", date: "21 липня, 10:12", amount: "-1 870.00 UAH" },
      { logo: "LM", logoBg: "#2ea836", logoColor: "#ffffff", name: "Leroy Merlin", date: "13 липня, 14:55", amount: "-2 365.00 UAH" },
      { logo: "JYS", logoBg: "#1e86c8", logoColor: "#ffffff", name: "JYSK", date: "5 липня, 17:20", amount: "-640.00 UAH" } ] },
  ];

  // Ring segment fills: the selected category keeps its colour and gains a glow,
  // everything else drops to the inactive grey.
  static RING = ["#ec3d96","#4b45e0","#2ea836","#f26a11","#1e86c8","#c11c3a","#ffd426","#34c7a0","#8b5cf6","#0ea5a4","#f59e0b","#64748b","#e11d48","#22c55e"];

  segmentVals(total) {
    const sel = this.state.segment;
    const tf = this.state.activePeriod, page = this.state.page, custom = this.state.custom;
    const income = this.state.activeTab === 1;
    const shares = this.radialShares(tf, page, income, custom);
    const on = sel !== null && sel !== undefined && sel < shares.length && !income && this.state.chartType === "radial";
    const out = {};
    const cat = on ? this.radialCat(sel, tf, page, custom) : null;
    out.segIcon = cat ? cat.icon : "";
    out.segIconBg = cat && cat.icon ? "url('" + cat.icon + "')" : "none";
    const incShares = [0.95, 0.05];
    const payCount = custom ? Math.max(1, Math.round(this.rangeDays(custom).length / 10)) : [1, 3, 36][tf];
    out.incomeRows = !income ? [] : AnalyticsScreen.INCOME_POOL.map((p, i) => {
      const amt = Math.round((total * incShares[i]) / 10) * 10;
      const n = i === 0 ? payCount : Math.max(1, Math.round(payCount * 1.4));
      return {
        key: "inc" + i, name: p.name, iconBg: this.iconBg(p),
        amount: this.fmt(amt),
        pct: Math.round(incShares[i] * 100) + "%",
        count: n + " " + this.txWord(n),
        open: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCategory(i, amt, true); },
      };
    });
    out.categories = income ? [] : this.catsFor(tf, page, custom, total).map((r) => ({
      key: r.key,
      name: r.name,
      color: r.color,
      icon: r.icon,
      iconBg: r.iconBg,
      amount: "-" + this.fmt(r.amount),
      pct: r.share >= 0.05 ? Math.round(r.share * 100) + "%" : (Math.round(r.share * 1000) / 10).toString().replace(".", ",") + "%",
      count: r.count + " " + this.txWord(r.count),
      open: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCategory(r.pool, r.amount); },
    }));
    const share = on ? shares[sel] : 0;
    out.hasSegment = !!cat;
    out.glowColor = cat ? cat.color : "#00000000";
    out.segPct = cat ? (share >= 0.05 ? Math.round(share * 100) + "%" : (Math.round(share * 1000) / 10).toString().replace(".", ",") + "%") : "";
    out.segAmount = cat ? this.fmt(total * share) : "";
    out.listTitle = cat ? cat.name : "Категорії";
    out.showCategoryList = !cat;
    const phase = this.state.listPhase;
    out.listAnim = phase === "out" ? "listOut" : phase === "none" ? "none" : "listIn";
    out.listDur = phase === "out" ? "200ms" : "340ms";
    out.listDelay = phase === "out" ? "0ms" : "40ms";
    out.iconAnim = this.state.segEntered ? "none" : "iconIn";
    out.pctAnim = this.state.segEntered ? "none" : "pctIn";
    out.transactions = cat ? this.synthTx(sel, total * share, tf, page, custom) : [];
    return out;
  }

  static PICK_CARDS = [
    { id: "card-universal", art: "/assets/card-universal.png", name: "Універсальна", masked: "•••• 1142 | UA25 •••• 1635945", amount: "50 000", currency: "UAH" },
    { id: "card-payout", art: "/assets/card-payout.png", name: "Картка для виплат", masked: "•••• 1567 | UA25 •••• 1635945", amount: "2 000", currency: "UAH" },
  ];
  static PICK_ENVS = [
    { id: "env-default", art: "/assets/envelope-money.png", name: "Конверт на подорож", masked: "••••1234 | UA25 •••• 1635945", amount: "50 000", currency: "UAH" },
    { id: "env-cushion", art: "/assets/envelope-plain.png", name: "Фінансова подушка", masked: "••••1234 | UA25 •••• 1635945", amount: "50 000", currency: "UAH" },
  ];
  static PICK_CURRENCIES = ["UAH", "USD", "EUR"];

  // Per-block selection: `all` is the block-level checkbox, `ids` are individual
  // picks. "all" is derived — it turns off as soon as one row is unchecked and back
  // on when every row is checked again.
  blockRows(block, items) {
    const sel = this.state[block];
    return items.map((it, i) => {
      const checked = sel.all || sel.ids.indexOf(it.id) >= 0;
      return {
        ...it,
        key: it.id,
        artUrl: "url('" + it.art + "?v=2')",
        checked: checked,
        divider: i < items.length - 1,
        boxBg: checked ? "var(--accent)" : "transparent",
        boxBorder: checked ? "2px solid var(--accent)" : "2px solid var(--div2)",
        toggle: () => this.setState((s) => {
          const cur = s[block];
          // "all" expands to every id first, so tapping a checked row always unchecks it
          const base = cur.all ? items.map((x) => x.id) : cur.ids;
          const has = base.indexOf(it.id) >= 0;
          const ids = has ? base.filter((x) => x !== it.id) : base.concat(it.id);
          return { [block]: { all: ids.length === items.length, ids: ids } };
        }),
      };
    });
  }

  selectedNames() {
    const pick = (block, items) => {
      const sel = this.state[block];
      if (sel.all) return items.map((i) => i.name);
      return items.filter((i) => sel.ids.indexOf(i.id) >= 0).map((i) => i.name);
    };
    return pick("pickCardSel", AnalyticsScreen.PICK_CARDS).concat(pick("pickEnvSel", AnalyticsScreen.PICK_ENVS));
  }

  pickerVals() {
    const cards = this.state.pickCardSel, envs = this.state.pickEnvSel;
    const box = (on) => ({ bg: on ? "var(--accent)" : "transparent", border: on ? "2px solid var(--accent)" : "2px solid var(--div2)" });
    // block checkbox reflects "every item in the block is selected", however it got there
    const allOf = (sel, items) => sel.all || items.every((i) => sel.ids.indexOf(i.id) >= 0);
    const cardsAll = allOf(cards, AnalyticsScreen.PICK_CARDS);
    const envsAll = allOf(envs, AnalyticsScreen.PICK_ENVS);
    const cb = box(cardsAll), eb = box(envsAll);
    const count = this.selectedNames().length;
    return {
      pickerOpen: this.screenLive("picker"),
      pickAnim: this.screenAnim("picker"),
      pickCards: this.blockRows("pickCardSel", AnalyticsScreen.PICK_CARDS),
      pickEnvelopes: this.blockRows("pickEnvSel", AnalyticsScreen.PICK_ENVS),
      cardsAllChecked: cardsAll, envsAllChecked: envsAll,
      cardsBoxBg: cb.bg, cardsBoxBorder: cb.border,
      envsBoxBg: eb.bg, envsBoxBorder: eb.border,
      saveOpacity: count ? 1 : 0.4,
      saveDisabled: count === 0,
      saveCursor: count ? "pointer" : "default",
      chipLabel: this.state.chipLabel,
      currencyChips: AnalyticsScreen.PICK_CURRENCIES.map((code) => ({
        code: code,
        key: code,
        bg: code === this.state.pickCurrency ? "var(--accent-tint)" : "var(--surface)",
        border: code === this.state.pickCurrency ? "1px solid var(--accent)" : "1px solid var(--div2)",
        select: () => this.setState({ pickCurrency: code }),
      })),
      openPicker: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.nav("picker", 1); },
      closePicker: () => this.nav("main", -1),
      savePicker: () => {
        const names = this.selectedNames();
        const everything = names.length === AnalyticsScreen.PICK_CARDS.length + AnalyticsScreen.PICK_ENVS.length;
        this.nav("main", -1, {
          chipLabel: !names.length || everything ? "Усі картки та конверти" : names.join(", "),
          chipScroll: 0,
          chipMax: 0,
        });
      },
      onChipScroll: () => this.measureChip(),
      // fades only when content is actually hidden in that direction
      chipFadeLeft: this.state.chipMax > 2 && this.state.chipScroll > 2 ? 1 : 0,
      chipFadeRight: this.state.chipMax > 2 && this.state.chipScroll < this.state.chipMax - 2 ? 1 : 0,
      toggleAllCards: () => this.setState((s) => ({ pickCardSel: { all: !s.pickCardSel.all, ids: [] } })),
      toggleAllEnvelopes: () => this.setState((s) => ({ pickEnvSel: { all: !s.pickEnvSel.all, ids: [] } })),
    };
  }

  color() { return this.state.activeTab === 1 ? "var(--income)" : "#f4470b"; }
  fmt(v) { return Math.round(v).toLocaleString("uk-UA").replace(/\u00a0/g, " ") + " UAH"; }
  thousands(v) { return Math.round(v / 1000).toLocaleString("uk-UA").replace(/\u00a0/g, " ") + " тис"; }
  clear() { this.setState({ selectedBar: null }); }

  swipe(dir) {
    if (this.state.custom) return; // a custom range is a single fixed period
    const max = 3;
    const next = Math.min(max, Math.max(0, this.state.page + dir));
    if (next !== this.state.page) this.bump({ page: next, selectedBar: null });
  }

  // ── Radial datasets ─────────────────────────────────────────────────
  // ── Category library ────────────────────────────────────────────────
  // One pool for the ring, the list and the detail screens. `w` is how much of a
  // typical month the category tends to take (relative weight, not a percent) and
  // drives how often it lands near the top; `icon` names an uploaded 40px SVG.
  // m: merchants — n name, l initials, b logo colour, lo/hi single-purchase range.
  static POOL = [
    { name: "Супермаркети та продукти", color: "#C62E65", icon: "icons/groceries", w: 20, f: 22, m: [
      { n: "Сільпо", l: "СІЛ", b: "#C62E65", lo: 180, hi: 2400 },
      { n: "АТБ", l: "АТБ", b: "#c11c3a", lo: 120, hi: 1400 },
      { n: "Novus", l: "NOV", b: "#2ea836", lo: 210, hi: 2100 },
      { n: "Varus", l: "VAR", b: "#f26a11", lo: 160, hi: 1700 } ] },
    { name: "Ресторани, кафе, бари", color: "#EB165B", icon: "icons/restaurants", w: 11, f: 12, m: [
      { n: "Пузата Хата", l: "PUZ", b: "#EB165B", lo: 140, hi: 780 },
      { n: "Aroma Kava", l: "ARO", b: "#7c3f12", lo: 45, hi: 220 },
      { n: "Львівські круасани", l: "ЛЬВ", b: "#f59e0b", lo: 90, hi: 460 } ] },
    { name: "АЗС", color: "#FF9500", icon: "АЗС", w: 9, f: 5, m: [
      { n: "WOG", l: "WOG", b: "#c11c3a", lo: 600, hi: 2600 },
      { n: "OKKO", l: "OKK", b: "#1e86c8", lo: 550, hi: 2400 },
      { n: "UPG", l: "UPG", b: "#22c55e", lo: 480, hi: 2200 } ] },
    { name: "Заощадження", color: "#71B000", icon: "icons/savings", w: 8, f: 2, m: [
      { n: "Поповнення банки", l: "БАН", b: "#71B000", lo: 500, hi: 12000 },
      { n: "Депозит", l: "ДЕП", b: "#059669", lo: 1000, hi: 20000 } ] },
    { name: "Зняття готівки", color: "#61675F", icon: "icons/cash-withdrawal", w: 7, f: 3, dull: 1, m: [
      { n: "Банкомат ПриватБанк", l: "ПБ", b: "#61675F", lo: 500, hi: 8000 },
      { n: "Банкомат Ощадбанк", l: "ОЩ", b: "#22c55e", lo: 400, hi: 6000 } ] },
    { name: "Таксі", color: "#5856D6", icon: "icons/taxi", w: 7, f: 10, m: [
      { n: "Bolt", l: "Bolt", b: "#1f9b6a", lo: 80, hi: 620 },
      { n: "Uber", l: "Uber", b: "var(--brand-black)", lo: 95, hi: 540 },
      { n: "Uklon", l: "Ukl", b: "#f2b21b", lo: 70, hi: 480 } ] },
    { name: "Одяг та взуття", color: "#D44F9A", icon: "icons/clothing", w: 7, f: 2, m: [
      { n: "Zara", l: "ZARA", b: "var(--brand-black)", lo: 700, hi: 3400 },
      { n: "Reserved", l: "RSV", b: "#1e3a8a", lo: 450, hi: 2100 },
      { n: "Intertop", l: "INT", b: "#c11c3a", lo: 900, hi: 3600 } ] },
    { name: "Комуналка та Інтернет", color: "#F15C00", icon: "icons/utilities", w: 7, f: 3, m: [
      { n: "Київенерго", l: "КЕ", b: "#F15C00", lo: 400, hi: 2800 },
      { n: "Київводоканал", l: "КВК", b: "#0ea5a4", lo: 180, hi: 900 },
      { n: "Ланет", l: "ЛАН", b: "#1C91C7", lo: 180, hi: 600 } ] },
    { name: "Доставка", color: "#E37D06", icon: "icons/delivery", w: 6, f: 7, m: [
      { n: "Glovo", l: "GLV", b: "#E37D06", lo: 180, hi: 900 },
      { n: "Bolt Food", l: "BF", b: "#1f9b6a", lo: 150, hi: 780 },
      { n: "Нова Пошта", l: "НП", b: "#c11c3a", lo: 60, hi: 450 } ] },
    { name: "Авто", color: "#FF9500", icon: "Авто", w: 6, f: 1, m: [
      { n: "АТЛ", l: "АТЛ", b: "#0f766e", lo: 400, hi: 4200 },
      { n: "Автотехніка", l: "АВТ", b: "#1e3a8a", lo: 300, hi: 3100 },
      { n: "Bosch Service", l: "BSH", b: "#c11c3a", lo: 800, hi: 5200 } ] },
    { name: "Аптеки", color: "#FF3B30", icon: "Аптеки", w: 6, f: 3, m: [
      { n: "Аптека Доброго Дня", l: "АДД", b: "#FF3B30", lo: 120, hi: 1200 },
      { n: "ANC", l: "ANC", b: "#1f7a4d", lo: 200, hi: 1400 },
      { n: "Подорожник", l: "ПОД", b: "#4b45e0", lo: 150, hi: 2200 } ] },
    { name: "Kids", color: "#A81B91", icon: "Kids", w: 6, f: 3, m: [
      { n: "Антошка", l: "АНТ", b: "#A81B91", lo: 250, hi: 2600 },
      { n: "Чичо", l: "ЧИЧ", b: "#f26a11", lo: 180, hi: 1500 },
      { n: "Kids Land", l: "KID", b: "#38bdf8", lo: 220, hi: 1900 } ] },
    { name: "Кредити", color: "#F3AF00", icon: "icons/credits", w: 6, f: 1, m: [
      { n: "Платіж за кредитом", l: "КРД", b: "#F3AF00", lo: 800, hi: 9000 },
      { n: "Розстрочка Оплата частинами", l: "ОЧ", b: "#f59e0b", lo: 400, hi: 4200 } ] },
    { name: "Інтернет-магазини", color: "#5856D6", icon: "icons/online-shops", w: 6, f: 4, m: [
      { n: "Prom.ua", l: "PRM", b: "#5856D6", lo: 200, hi: 4800 },
      { n: "OLX", l: "OLX", b: "#0284c7", lo: 150, hi: 3600 },
      { n: "AliExpress", l: "ALI", b: "#e11d48", lo: 90, hi: 2400 } ] },
    { name: "Дім та ремонт", color: "#1F919D", icon: "icons/home-repair", w: 5, f: 2, m: [
      { n: "Епіцентр", l: "EPI", b: "#f26a11", lo: 250, hi: 2400 },
      { n: "Leroy Merlin", l: "LM", b: "#2ea836", lo: 300, hi: 2600 },
      { n: "JYSK", l: "JYS", b: "#1e86c8", lo: 180, hi: 1500 } ] },
    { name: "Медичні послуги", color: "#FF3B30", icon: "icons/medical", w: 5, f: 2, m: [
      { n: "Добробут", l: "ДОБ", b: "#FF3B30", lo: 600, hi: 4800 },
      { n: "Сінево", l: "СІН", b: "#0ea5a4", lo: 320, hi: 2100 },
      { n: "Dental Art", l: "DEN", b: "#1e86c8", lo: 900, hi: 6400 } ] },
    { name: "Побутова техніка", color: "#A14F8F", icon: "icons/appliances", w: 5, f: 1, m: [
      { n: "Comfy", l: "CMF", b: "#A14F8F", lo: 350, hi: 6400 },
      { n: "Foxtrot", l: "FOX", b: "#c11c3a", lo: 300, hi: 5600 },
      { n: "Eldorado", l: "ELD", b: "#f59e0b", lo: 400, hi: 7200 } ] },
    { name: "Краса", color: "#7A48E2", icon: "icons/beauty", w: 5, f: 3, m: [
      { n: "EVA", l: "EVA", b: "#7A48E2", lo: 150, hi: 1400 },
      { n: "Watsons", l: "WAT", b: "#2ea836", lo: 180, hi: 1600 },
      { n: "Салон Bella", l: "BEL", b: "#ec3d96", lo: 400, hi: 2600 } ] },
    { name: "Переказ на конверт", color: "#1DA334", icon: "icons/envelope-transfer", w: 5, f: 2, m: [
      { n: "Конверт на подорож", l: "КНВ", b: "#1DA334", lo: 500, hi: 8000 },
      { n: "Фінансова подушка", l: "ФП", b: "#059669", lo: 1000, hi: 15000 } ] },
    { name: "Розваги", color: "#444DBD", icon: "icons/entertainment", w: 4, f: 2, m: [
      { n: "Steam", l: "STM", b: "#444DBD", lo: 150, hi: 1800 },
      { n: "Квест-рум", l: "QST", b: "#6366f1", lo: 600, hi: 2200 },
      { n: "Боулінг", l: "БОУ", b: "#0284c7", lo: 300, hi: 1600 } ] },
    { name: "Авіаквитки", color: "#5856D6", icon: "Авіаквитки", w: 4, f: 0.4, m: [
      { n: "МАУ", l: "МАУ", b: "#5856D6", lo: 2400, hi: 12000 },
      { n: "Wizz Air", l: "WIZ", b: "#a855f7", lo: 1600, hi: 8400 },
      { n: "Ryanair", l: "RYA", b: "#1e86c8", lo: 1400, hi: 7600 } ] },
    { name: "Готелі", color: "#00A8CE", icon: "Готелі", w: 4, f: 0.5, m: [
      { n: "Booking.com", l: "BKG", b: "#1B5AA8", lo: 1200, hi: 9600 },
      { n: "Ribas Hotels", l: "RIB", b: "#00A8CE", lo: 900, hi: 6200 },
      { n: "Premier Hotels", l: "PRE", b: "#8637B9", lo: 1400, hi: 8800 } ] },
    { name: "Фонди та організації", color: "#F049B3", icon: "icons/funds", w: 4, f: 3, m: [
      { n: "Повернись живим", l: "ПЖ", b: "#F049B3", lo: 200, hi: 5000 },
      { n: "Сергій Притула", l: "СП", b: "#22c55e", lo: 100, hi: 3000 },
      { n: "UNITED24", l: "U24", b: "#1e86c8", lo: 200, hi: 4000 } ] },
    { name: "Музика", color: "#444DBD", icon: "icons/music", w: 3, f: 3, m: [
      { n: "Spotify", l: "SPT", b: "#0f9f4f", lo: 129, hi: 299 },
      { n: "Apple Music", l: "AM", b: "#444DBD", lo: 129, hi: 349 },
      { n: "YouTube Premium", l: "YTP", b: "#e11d48", lo: 159, hi: 379 } ] },
    { name: "Громадський транспорт", color: "#5856D6", icon: "icons/public-transport", w: 3, f: 12, m: [
      { n: "Метрополітен", l: "МЕТ", b: "#5856D6", lo: 40, hi: 200 },
      { n: "Київпастранс", l: "КПТ", b: "#1e86c8", lo: 30, hi: 160 },
      { n: "Швидкісний трамвай", l: "ТРМ", b: "#0f766e", lo: 30, hi: 140 } ] },
    { name: "Спорт товари", color: "#158595", icon: "icons/sport-goods", w: 3, f: 2, m: [
      { n: "Decathlon", l: "DEC", b: "#158595", lo: 400, hi: 3200 },
      { n: "Intersport", l: "INS", b: "#1e3a8a", lo: 500, hi: 3600 },
      { n: "Sport Life", l: "SPL", b: "#64748b", lo: 600, hi: 2400 } ] },
    { name: "Освіта", color: "#2646DA", icon: "icons/education", w: 3, f: 1, m: [
      { n: "Prometheus", l: "PRO", b: "#2646DA", lo: 300, hi: 2800 },
      { n: "Genius Space", l: "GEN", b: "#6366f1", lo: 900, hi: 6400 },
      { n: "Coursera", l: "COU", b: "#1e86c8", lo: 700, hi: 3400 } ] },
    { name: "Відкритий банкінг", color: "#12A2B5", icon: "icons/open-banking", w: 3, f: 2, m: [
      { n: "Комісія за переказ", l: "КОМ", b: "#12A2B5", lo: 20, hi: 180 },
      { n: "Оплата послуг", l: "ОПЛ", b: "#64748b", lo: 60, hi: 900 } ] },
    { name: "Платежі до бюджету", color: "#F15C00", icon: "icons/budget-payments", w: 3, f: 1, m: [
      { n: "Податкова", l: "ПОД", b: "#F15C00", lo: 300, hi: 9000 },
      { n: "Штраф ПДР", l: "ШТР", b: "#c11c3a", lo: 340, hi: 1700 },
      { n: "Держмито", l: "ДМ", b: "#64748b", lo: 200, hi: 2400 } ] },
    { name: "Побутові послуги", color: "#1C91C7", icon: "icons/household-services", w: 3, f: 2, m: [
      { n: "Хімчистка", l: "ХІМ", b: "#1C91C7", lo: 200, hi: 1400 },
      { n: "Ремонт взуття", l: "РВ", b: "#8637B9", lo: 150, hi: 900 },
      { n: "Клінінг", l: "КЛН", b: "#0ea5a4", lo: 500, hi: 2600 } ] },
    { name: "Інше", color: "#6B7077", icon: "icons/other", w: 3, f: 4, dull: 1, m: [
      { n: "Інші витрати", l: "ІНШ", b: "#6B7077", lo: 100, hi: 2600 },
      { n: "Оплата онлайн", l: "ОНЛ", b: "#64748b", lo: 150, hi: 3200 } ] },
    { name: "Тварини", color: "#AE764C", icon: "icons/pets", w: 2, f: 2, m: [
      { n: "Masterzoo", l: "MAS", b: "#AE764C", lo: 180, hi: 1600 },
      { n: "Zoodim", l: "ZOO", b: "#0f766e", lo: 150, hi: 1200 },
      { n: "Ветклініка", l: "ВЕТ", b: "#f43f5e", lo: 400, hi: 3200 } ] },
    { name: "Кіно", color: "#444DBD", icon: "icons/cinema", w: 2, f: 1, m: [
      { n: "Планета Кіно", l: "ПЛК", b: "#444DBD", lo: 200, hi: 1100 },
      { n: "Мультиплекс", l: "МУЛ", b: "#34c7a0", lo: 180, hi: 900 },
      { n: "Оскар", l: "ОСК", b: "#c11c3a", lo: 160, hi: 800 } ] },
    { name: "Квіти", color: "#EA3B8F", icon: "icons/flowers", w: 2, f: 1, m: [
      { n: "Квіти24", l: "КВ24", b: "#EA3B8F", lo: 250, hi: 2400 },
      { n: "Проквіти", l: "ПРК", b: "#a855f7", lo: 300, hi: 1800 } ] },
    { name: "Книги та канцтовари", color: "#BA1C3D", icon: "icons/books", w: 2, f: 1, m: [
      { n: "Книгарня Є", l: "КЄ", b: "#BA1C3D", lo: 200, hi: 1400 },
      { n: "Yakaboo", l: "YAK", b: "#0284c7", lo: 250, hi: 1800 },
      { n: "Канцтовари", l: "КНЦ", b: "#64748b", lo: 80, hi: 600 } ] },
    { name: "Мистецтво", color: "#A5AB12", icon: "icons/art", w: 2, f: 0.5, m: [
      { n: "Галерея", l: "ГАЛ", b: "#A5AB12", lo: 800, hi: 9000 },
      { n: "Арт-студія", l: "АРТ", b: "#8637B9", lo: 400, hi: 2600 } ] },
    { name: "Квитки на автобус", color: "#5856D6", icon: "icons/bus-tickets", w: 2, f: 0.6, m: [
      { n: "Busfor", l: "BUS", b: "#5856D6", lo: 250, hi: 1600 },
      { n: "FlixBus", l: "FLX", b: "#22c55e", lo: 400, hi: 2400 },
      { n: "Автостанція", l: "АВС", b: "#64748b", lo: 120, hi: 900 } ] },
    { name: "Квитки на поїзд", color: "#5856D6", icon: "icons/train-tickets", w: 2, f: 0.6, m: [
      { n: "Укрзалізниця", l: "УЗ", b: "#5856D6", lo: 300, hi: 2400 },
      { n: "Каса вокзалу", l: "КВ", b: "#0f766e", lo: 200, hi: 1600 } ] },
    { name: "Оренда авто", color: "#5856D6", icon: "icons/car-rental", w: 2, f: 0.4, m: [
      { n: "Getmancar", l: "GMC", b: "#5856D6", lo: 300, hi: 2600 },
      { n: "Narscars", l: "NRS", b: "#1e3a8a", lo: 900, hi: 6400 } ] },
    { name: "Duty Free", color: "#1B5AA8", icon: "Duty Free", w: 2, f: 0.3, m: [
      { n: "Duty Free Ukraine", l: "DFU", b: "#1B5AA8", lo: 400, hi: 4200 },
      { n: "Heinemann", l: "HEI", b: "#616060", lo: 600, hi: 5400 } ] },
    { name: "Годинники та ювелірні вироби", color: "#8637B9", icon: "Годинники та ювелірні вироби", w: 2, f: 0.3, m: [
      { n: "Zarina", l: "ZAR", b: "#8637B9", lo: 1200, hi: 9800 },
      { n: "SOVA", l: "SOV", b: "#f59e0b", lo: 1600, hi: 12000 },
      { n: "Swatch", l: "SWA", b: "#c11c3a", lo: 2400, hi: 8600 } ] },
    { name: "Ломбарди", color: "#F3AF00", icon: "icons/pawnshops", w: 1, f: 0.3, m: [
      { n: "Ломбард Скарбниця", l: "ЛСК", b: "#F3AF00", lo: 500, hi: 6000 },
      { n: "Ломбард Благо", l: "ЛБЛ", b: "#f59e0b", lo: 400, hi: 4200 } ] },
  ];

  // kept as an alias so older call sites keep working
  static get RADIAL_CATS() { return AnalyticsScreen.POOL; }

  // 1×1 transparent pixel: a valid src while the template is still resolving holes
  static BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  iconUrl(cat) {
    if (!cat.icon) return "";
    return "/uploads/" + cat.icon.split("/").map(encodeURIComponent).join("/") + ".svg";
  }

  iconBg(cat) {
    const u = this.iconUrl(cat);
    return u ? "url('" + u + "')" : "none";
  }

  initialsOf(name) {
    const w = name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 3)).toUpperCase();
  }

  txWord(n) {
    const t = n % 100, o = n % 10;
    if (t > 10 && t < 20) return "транзакцій";
    if (o === 1) return "транзакція";
    if (o >= 2 && o <= 4) return "транзакції";
    return "транзакцій";
  }

  // a stable number out of the period key, so every period draws its own line-up
  seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 100000 / 7.13;
  }

  periodKey(tf, page, custom) { return custom ? "c" + custom.start + custom.end : tf + ":" + page; }

  // Weighted sampling without replacement (Efraimidis–Spirakis): a heavy category
  // usually lands near the front, but not always — so the order really moves
  // between periods and the tail rotates in and out of the visible slots.
  catSet(tf, page, custom) {
    const key = this.periodKey(tf, page, custom);
    this._catSets = this._catSets || {};
    if (this._catSets[key]) return this._catSets[key];
    const seed = this.seedOf(key);
    const N = this.radialCount(tf, custom);
    const ranked = AnalyticsScreen.POOL.map((c, i) => {
      const u = Math.max(1e-6, this.noise(seed + i * 7.77));
      const swing = 0.55 + this.noise(seed * 1.31 + i * 3.13) * 1.15; // luck of the month
      return { i: i, k: Math.pow(u, 1 / (c.w * swing)) };
    }).sort((a, b) => b.k - a.k);
    const out = ranked.slice(0, N).map((x) => x.i);
    // the biggest wedge carries the ring's colour: never let a grey utility
    // category (transfers, cash, "Інше") lead — push it a few slots down
    if (AnalyticsScreen.POOL[out[0]] && AnalyticsScreen.POOL[out[0]].dull) {
      const j = out.findIndex((pi, k) => k > 0 && !AnalyticsScreen.POOL[pi].dull);
      if (j > 0) { const t = out[0]; out[0] = out[j]; out[j] = t; }
    }
    this._catSets[key] = out;
    return out;
  }

  radialCount(tf, custom) {
    if (custom) {
      const d = this.rangeDays(custom).length;
      return d <= 14 ? 8 : d <= 90 ? 14 : 22;
    }
    return tf === 0 ? 8 : tf === 1 ? 14 : 24;
  }

  // The generated line-up for a period: order, shares, amounts and transaction
  // counts, all deterministic per period but different from every other period.
  catsFor(tf, page, custom, total) {
    const key = this.periodKey(tf, page, custom) + "|" + Math.round(total);
    this._catRows = this._catRows || {};
    if (this._catRows[key]) return this._catRows[key];
    const idx = this.catSet(tf, page, custom);
    const shares = this.radialShares(tf, page, false, custom);
    const seed = this.seedOf(key);
    // how many months the visible window covers — transaction counts come from the
    // category's own rhythm (f per month), not from the synthetic totals
    const months = custom ? Math.max(0.25, this.rangeDays(custom).length / 30.4) : tf === 0 ? 7 / 30.4 : tf === 1 ? 6 : 12;
    const rows = idx.map((pi, i) => {
      const c = AnalyticsScreen.POOL[pi];
      const share = shares[i];
      const amount = total * share;
      const n = Math.max(1, Math.round((c.f || 2) * months * (0.65 + this.noise(seed + pi * 4.4) * 0.7)));
      return {
        key: key + "-" + pi, pool: pi, name: c.name, color: c.color,
        icon: this.iconUrl(c), iconBg: this.iconBg(c),
        share: share, amount: amount, count: n,
      };
    });
    this._catRows[key] = rows;
    return rows;
  }

  // Largest share shrinks as the ring gets busier; ~10 minimum-size slivers sit at
  // the tail, the rest decays geometrically between them.
  radialShares(tf, page, income, custom) {
    if (income) return [0.95, 0.05];
    const N = this.radialCount(tf, custom);
    const minCount = Math.min(10, Math.max(2, N - 5));
    const top = tf === 0 ? 0.3 : tf === 1 ? 0.235 : 0.17;
    const minShare = tf === 2 ? 0.011 : 0.015;
    const seed = this.seedOf(this.periodKey(tf, page, custom));
    const w = [];
    for (let i = 1; i < N - minCount; i++) w.push(Math.pow(0.8, i) * (0.85 + this.noise(seed + i) * 0.3));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    const budget = 1 - minCount * minShare - top;
    // per-period jitter on top of the tuned curve: the leader's lead widens or
    // narrows, the middle reshuffles slightly, the tail stays a row of slivers
    const raw = [top * (0.86 + this.noise(seed + 91) * 0.26)]
      .concat(w.map((x, i) => (x / sum) * budget * (0.82 + this.noise(seed + 200 + i * 2.7) * 0.36)))
      .concat(new Array(minCount).fill(0).map((_, i) => minShare * (0.8 + this.noise(seed + 400 + i * 1.9) * 0.5)));
    const tot = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((x) => x / tot).sort((a, b) => b - a);
  }

  // donut wedge, 0° at the top, clockwise — same radii as the original ring
  donutPath(a0, a1) {
    const R = 144, r = 122, C = 144;
    const f = (n) => Math.round(n * 100) / 100;
    const pt = (a, rad) => [f(C + rad * Math.sin(a)), f(C - rad * Math.cos(a))];
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const o0 = pt(a0, R), o1 = pt(a1, R), i1 = pt(a1, r), i0 = pt(a0, r);
    return "M " + o0[0] + " " + o0[1] + " A " + R + " " + R + " 0 " + big + " 1 " + o1[0] + " " + o1[1] +
      " L " + i1[0] + " " + i1[1] + " A " + r + " " + r + " 0 " + big + " 0 " + i0[0] + " " + i0[1] + " Z";
  }

  radialGeometry(shares) {
    const gap = (Math.min(1.6, 26 / shares.length) * Math.PI) / 180;
    let a = 0;
    return shares.map((s) => {
      const span = Math.max(gap * 1.4, s * Math.PI * 2 - gap);
      const d = this.donutPath(a + gap / 2, a + gap / 2 + span);
      a += s * Math.PI * 2;
      return d;
    });
  }

  // slot i of the current period's line-up
  poolAt(i, tf, page, custom) {
    const set = this.catSet(tf, page, custom);
    return AnalyticsScreen.POOL[set[i % set.length]];
  }

  radialCat(i, tf, page, custom) {
    const base = this.poolAt(i, tf, page, custom);
    return { name: base.name, color: base.color, icon: this.iconUrl(base), base: base, pool: this.catSet(tf, page, custom)[i] };
  }

  synthTx(i, amount, tf, page, custom) {
    const base = this.poolAt(i, tf, page, custom);
    const seed = this.seedOf(this.periodKey(tf, page, custom)) + i * 13.7;
    const n = 2 + Math.floor(this.noise(seed * 1.07) * 2.6);
    const rows = [];
    let left = amount;
    for (let k = 0; k < n; k++) {
      const part = k === n - 1 ? left : Math.round(amount * (0.26 + this.noise(seed + k * 1.7) * 0.34));
      left -= part;
      const mr = base.m[Math.floor(this.noise(seed * 1.37 + k * 19.7) * base.m.length) % base.m.length];
      const day = 3 + Math.floor(this.noise(seed + k * 2.3) * 25);
      const hh = 8 + Math.floor(this.noise(seed + k * 4.1) * 13);
      rows.push({
        key: i + "-" + k, logo: (mr.n || "").trim().charAt(0).toUpperCase(), logoBg: mr.b, logoColor: "#ffffff", name: mr.n,
        date: day + " вересня, " + String(hh).padStart(2, "0") + ":" + String(Math.floor(this.noise(seed + k * 9.1) * 59)).padStart(2, "0"),
        amount: "-" + this.money(Math.max(20, part)) + " UAH",
      });
    }
    return rows;
  }

  // the exact string the ring centre shows for a given page — the counter's trigger
  // and its dedupe guard both measure this, never the bar badge's amount
  radialAmount(tf, page, income, custom, sel) {
    const spec = this.specFor(tf, page, income, custom, 1, 0);
    const total = spec.values.reduce((a, b) => a + b, 0);
    const shares = this.radialShares(tf, page, income, custom);
    const on = sel !== null && sel !== undefined && sel < shares.length && !income;
    return this.fmt(on ? total * shares[sel] : total);
  }

  radialPage(o) {
    const spec = this.specFor(o.tf, o.page, o.income, o.custom, 1, 0);
    const total = spec.values.reduce((a, b) => a + b, 0);
    const shares = this.radialShares(o.tf, o.page, o.income, o.custom);
    const isCur = o.page === o.curPage;
    const sel = isCur ? o.sel : null;
    const on = sel !== null && sel !== undefined && sel < shares.length && !o.income;
    const paths = this.radialGeometry(shares);
    const set = o.income ? [] : this.catSet(o.tf, o.page, o.custom);
    const segColor = (i) => (AnalyticsScreen.POOL[set[i % set.length]] || AnalyticsScreen.POOL[0]).color;
    return {
      key: "r" + o.tf + "-" + o.page + (o.income ? "i" : "e"),
      offset: (o.curPage - o.page) * AnalyticsScreen.PAGE + "px",
      isIncomeRing: o.income,
      sweep: o.noGrow ? "none" : "ringSweep 390ms linear both",
      mask: o.noGrow ? "none" : "conic-gradient(from 0deg at 50% 50%, #000 0 var(--sweep), transparent var(--sweep) 360deg)",
      centreAnim: o.noGrow ? "none" : "centreIn 285ms cubic-bezier(0.32, 0.72, 0, 1) 150ms both",
      showSel: isCur && on,
      amount: this.fmt(on ? total * shares[sel] : total),
      amountChars: this.amountChars(this.fmt(on ? total * shares[sel] : total), isCur && !!o.countUp, this._radialTick),
      periodFade: isCur && o.countUp ? ["labelFadeA", "labelFadeB"][(this._radialTick || 0) % 2] + " 320ms ease both" : "none",
      period: spec.range,
      segs: paths.map((d, i) => ({
        key: i,
        d: d,
        fill: o.income ? (i === 0 ? "var(--income)" : "var(--seg-off)") : on ? (sel === i ? segColor(i) : "var(--seg-off)") : segColor(i),
        glow: on && sel === i ? "url(#segGlow)" : "none",
        select: (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!isCur || o.income || (this._noClick && Date.now() - this._noClick < 320)) return;
          this.startSwap(this.state.segment === i ? null : i);
        },
      })),
    };
  }

  // ── Chart paging ────────────────────────────────────────────────────
  // Bars tile the 336.203px plot area, so a pitch of exactly that width makes the
  // gap across a page boundary equal to the gap between neighbouring bars.
  static PAGE = 336.203;
  // One <page> per dataset, laid out side by side inside a clipped viewport.
  // Dragging moves the track directly on the DOM node (no re-render per frame);
  // the data only changes once the snap has landed.
  plotPage(o) {
    const PLOT = 233;
    const spec = this.specFor(o.tf, o.page, o.income, o.custom, o.mult, o.seedShift);
    const n = spec.values.length;
    const isCur = o.page === o.curPage;
    const sel = isCur && o.sel !== null && o.sel !== undefined && o.sel < n ? o.sel : null;
    const axisMax = this.niceMax(Math.max.apply(null, spec.values));
    const avg = spec.values.reduce((a, b) => a + b, 0) / n;
    const h = (v) => Math.max(6, Math.round((v / axisMax) * PLOT));
    const lab = (v) => (o.small ? this.axisLabel(v, axisMax) : this.thousands(v));
    return {
      key: o.tf + "-" + o.page + "-" + (o.income ? "i" : "e") + "-" + (o.tag || ""),
      // higher page = earlier period, and it enters from the left on a rightward drag
      offset: (o.curPage - o.page) * AnalyticsScreen.PAGE + "px",
      axis0: lab(0), axis1: lab(axisMax / 2), axis2: lab(axisMax),
      showAverage: sel === null,
      avgBottom: Math.round((avg / axisMax) * PLOT) + "px",
      avgLabel: "Сер. " + lab(avg),
      activeFill: o.color,
      bars: spec.values.map((v, i) => ({
        key: o.page + "-" + i,
        label: spec.labels[i],
        w: spec.width + "px",
        h: h(v) + "px",
        scale: sel === null || sel === i ? 1 : 0,
        labelColor: sel === i ? "var(--text-hi)" : "var(--text3)",
        labelWeight: sel === i ? 600 : 400,
        trackBg: sel === null || sel === i ? "transparent" : "color-mix(in srgb, " + o.color + " 34%, transparent)",
        growAnim: !isCur || o.noGrow ? "none"
          : sel === null ? ["growUpA", "growUpB", "growUpC"][(o.tf + o.page + i) % 3]
          : sel === i ? ["growUpA", "growUpB", "growUpC"][this.state.animTick % 3]
          : "none",
        select: (e) => {
          if (e && e.stopPropagation) e.stopPropagation();
          if (!isCur || (this._noClick && Date.now() - this._noClick < 320)) return;
          o.onSelect(i);
        },
      })),
    };
  }

  pager(kind) {
    this._pagers = this._pagers || {};
    return this._pagers[kind] || (this._pagers[kind] = this.makePager(kind));
  }

  makePager(kind) {
    const self = this;
    const store = "_pg_" + kind, trackKey = "_tr_" + kind;
    const cur = () => (kind === "cat" ? (self.state.cat ? self.state.cat.page : 0) : self.state.page);
    const locked = () => (kind === "cat" ? !!(self.state.cat && self.state.cat.custom) : !!self.state.custom);
    const commit = (p) => (kind === "cat" ? self.catPatch({ page: p, selectedBar: null, noGrow: true }) : self.bump({ page: p, selectedBar: null, noGrow: true }));
    // the connector points at a bar on the page being dragged away — fade it out
    // for the duration of the gesture rather than leaving it stranded
    const connector = (o) => {
      const c = self["_cn_" + kind] || document.querySelector('[data-screen-label="' + (kind === "cat" ? "Категорія" : "Аналітика") + '"] div[style*="border-left: 1.5px"]');
      // no transition: React re-applies the node's inline transition, which would
      // swallow the change — hide it outright for the gesture instead
      if (c) { c.style.setProperty("visibility", o === "0" ? "hidden" : "visible", "important"); }
    };
    // the average belongs to the page being dragged away — fade it for the gesture
    // and let it fade back in once the next page has snapped into place
    const average = (on) => {
      const scope = document.querySelector('[data-screen-label="' + (kind === "cat" ? "Категорія" : "Аналітика") + '"]');
      if (scope) scope.setAttribute("data-dragging", on ? "0" : "1");
    };
    return {
      ref: (el) => { self[trackKey] = el; },
      connRef: (el) => { self["_cn_" + kind] = el; },
      down: (e) => {
        if (locked()) return;
        self[store] = { x: e.clientX, y: e.clientY, t: Date.now(), active: false, dx: 0, el: e.currentTarget, id: e.pointerId };
      },
      move: (e) => {
        const d = self[store];
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.active) {
          if (Math.abs(dx) < 6) return;
          if (Math.abs(dx) <= Math.abs(dy)) { self[store] = null; return; }
          d.active = true;
          self._noClick = Date.now();
          if (d.el && d.el.setPointerCapture) { try { d.el.setPointerCapture(d.id); } catch (err) {} }
          connector("0");
          average(false);
          if (kind === "cat") {
            if (self.state.cat && self.state.cat.selectedBar !== null) self.setState((s) => ({ cat: Object.assign({}, s.cat, { selectedBar: null }) }));
          } else if (self.state.selectedBar !== null || self.state.segment !== null) {
            self.setState((s) => ({ selectedBar: null, segment: null, segEntered: false, listPhase: "in", animTick: s.animTick + 1 }));
          }
        }
        const p = cur();
        // page 3 is the oldest period, page 0 the newest — resist past either end
        d.dx = (p === 3 && dx > 0) || (p === 0 && dx < 0) ? dx * 0.32 : dx;
        const el = self[trackKey];
        if (el) { el.style.transition = "none"; el.style.transform = "translateX(" + d.dx + "px)"; }
      },
      up: () => {
        const d = self[store];
        self[store] = null;
        if (!d || !d.active) return;
        self._noClick = Date.now();
        const dx = d.dx, v = Math.abs(dx) / Math.max(1, Date.now() - d.t);
        const p = cur();
        const dir = Math.abs(dx) > AnalyticsScreen.PAGE * 0.25 || v > 0.45 ? (dx > 0 ? 1 : -1) : 0;
        const target = Math.min(3, Math.max(0, p + dir));
        const to = target === p ? 0 : target > p ? AnalyticsScreen.PAGE : -AnalyticsScreen.PAGE;
        const el = self[trackKey];
        if (!el) { connector("1"); average(true); if (target !== p) commit(target); return; }
        el.style.transition = "transform 360ms cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = "translateX(" + to + "px)";
        clearTimeout(self[store + "T"]);
        self[store + "T"] = setTimeout(() => {
          el.style.transition = "none";
          el.style.transform = "translateX(0px)";
          connector("1");
          average(true);
          if (target !== p) commit(target);
        }, to === 0 ? 240 : 360);
      },
    };
  }

  // prev / current / next — the only pages that can be on screen at once
  pageWindow(curPage, custom) {
    if (custom) return [curPage];
    const out = [];
    for (let p = curPage - 1; p <= curPage + 1; p++) if (p >= 0 && p <= 3) out.push(p);
    return out;
  }

  // ── Dates & custom ranges ────────────────────────────────────────────
  parseISO(iso) { const p = iso.split("-"); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  isoOf(y, m, d) { return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
  money(v) { const s = Math.abs(v).toFixed(2).split("."); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + s[1]; }
  axisLabel(v, max) { return max >= 10000 ? this.thousands(v) : Math.round(v).toLocaleString("uk-UA").replace(/\u00a0/g, " "); }

  // one day's amount — the single source the week view and every custom range share
  dayValue(y, m, d, income) {
    if (income) {
      const pay = this.paySplit(this.monthIncome(y, m), y * 12 + m);
      if (d === 5) return pay[0];
      if (d === 15) return pay[1];
      if (d === 25) return pay[2];
      return Math.round((this.noise(y * 400 + m * 40 + d) < 0.65 ? 0 : 200 + this.noise(d * 3.1) * 900) / 10) * 10;
    }
    const share = 0.9 + this.noise(y * 500 + m * 50 + d) * 1.4;
    return Math.round((this.monthExpense(y, m) / 30) * share / 10) * 10;
  }

  rangeDays(range) {
    const a = this.parseISO(range.start), b = this.parseISO(range.end);
    const cur = new Date(a.y, a.m, a.d), end = new Date(b.y, b.m, b.d), out = [];
    while (cur <= end && out.length < 400) {
      out.push({ y: cur.getFullYear(), m: cur.getMonth(), d: cur.getDate() });
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  rangeLabel(range) {
    const a = this.parseISO(range.start), b = this.parseISO(range.end);
    const showY = a.y !== b.y;
    if (a.y === b.y && a.m === b.m && a.d === b.d) return a.d + " " + AnalyticsScreen.MONTH_GEN[a.m];
    return a.d + " " + AnalyticsScreen.monY(a.m, a.y, showY, true) + " – " + b.d + " " + AnalyticsScreen.monY(b.m, b.y, showY, true);
  }

  // The granularity follows the length of the range — day, week, month, quarter
  // or year buckets — so the plot always lands around 6–12 readable columns and
  // the labels say what each column actually covers.
  customSpec(range, income) {
    const days = this.rangeDays(range);
    const n = days.length;
    const months = (days[n - 1].y * 12 + days[n - 1].m) - (days[0].y * 12 + days[0].m) + 1;
    const unit = n <= 14 ? "day" : n <= 90 ? "week" : months <= 24 ? "month" : months <= 60 ? "quarter" : "year";
    const groups = [];
    const push = (key, cells) => groups.push({ key: key, cells: cells });

    if (unit === "day") {
      days.forEach((d) => push(d.d, [d]));
    } else if (unit === "week") {
      for (let i = 0; i < n; i += 7) push(i, days.slice(i, i + 7));
    } else if (unit === "month") {
      days.forEach((d) => {
        const k = d.y * 12 + d.m;
        const g = groups[groups.length - 1];
        if (g && g.key === k) g.cells.push(d); else push(k, [d]);
      });
    } else if (unit === "quarter") {
      days.forEach((d) => {
        const k = d.y * 4 + Math.floor(d.m / 3);
        const g = groups[groups.length - 1];
        if (g && g.key === k) g.cells.push(d); else push(k, [d]);
      });
    } else {
      days.forEach((d) => {
        const g = groups[groups.length - 1];
        if (g && g.key === d.y) g.cells.push(d); else push(d.y, [d]);
      });
    }

    const first = (g) => g.cells[0];
    const last = (g) => g.cells[g.cells.length - 1];
    const label = (g) => {
      if (unit === "day") return String(first(g).d);
      if (unit === "week") return first(g).d + "–" + last(g).d;
      if (unit === "month") return AnalyticsScreen.MONTH_ABBR[first(g).m];
      if (unit === "quarter") return "Q" + (Math.floor(first(g).m / 3) + 1);
      return String(first(g).y);
    };
    const name = (g) => {
      if (unit === "day") return first(g).d + " " + AnalyticsScreen.MONTH_GEN[first(g).m];
      if (unit === "week") return first(g).d + " " + AnalyticsScreen.MONTH_GEN[first(g).m] + " – " + last(g).d + " " + AnalyticsScreen.MONTH_GEN[last(g).m];
      if (unit === "month") return AnalyticsScreen.monY(first(g).m, first(g).y, true);
      if (unit === "quarter") return (Math.floor(first(g).m / 3) + 1) + " квартал " + first(g).y;
      return String(first(g).y) + " рік";
    };
    return {
      width: groups.length <= 7 ? 22 : groups.length <= 9 ? 18 : 14,
      axisMax: 0,
      axisUnit: 1000,
      labels: groups.map(label),
      names: groups.map(name),
      values: groups.map((g) => Math.round(g.cells.reduce((s, x) => s + this.dayValue(x.y, x.m, x.d, income), 0) / 10) * 10),
      range: this.rangeLabel(range),
    };
  }

  // ── Calendar screen ─────────────────────────────────────────────────
  static CAL_MONTHS = [{ y: 2025, m: 6 }, { y: 2025, m: 7 }, { y: 2025, m: 8 }];
  static MONTH_TITLE = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
  static TINT = "var(--accent-tint)";

  openCalendar(ctx) {
    const cur = ctx === "cat" ? (this.state.cat && this.state.cat.custom) : this.state.custom;
    this.nav("calendar", 1, { calCtx: ctx, calDraft: cur ? { start: cur.start, end: cur.end } : { start: null, end: null } });
  }

  // tap 1 → start, tap 2 → close the range, tap 3 → clear and start again
  pickDay(iso) {
    this.setState((s) => {
      const d = s.calDraft;
      if (!d.start || d.end) return { calDraft: { start: iso, end: null } };
      if (iso < d.start) return { calDraft: { start: iso, end: d.start } };
      return { calDraft: { start: d.start, end: iso } };
    });
  }

  applyCalendar() {
    const r = this.state.calDraft;
    if (!r.start || !r.end) return;
    if (this.state.calCtx === "cat") {
      this.nav("category", -1, { cat: Object.assign({}, this.state.cat, { custom: r, selectedBar: null, page: 0 }), animTick: this.state.animTick + 1 });
    } else {
      this.nav("main", -1, { custom: r, selectedBar: null, page: 0, animTick: this.state.animTick + 1, segment: null, listPhase: "in" });
    }
  }

  dmy(iso) { const p = this.parseISO(iso); return String(p.d).padStart(2, "0") + "." + String(p.m + 1).padStart(2, "0") + "." + p.y; }

  calVals() {
    const d = this.state.calDraft;
    const months = AnalyticsScreen.CAL_MONTHS.map((mo) => {
      const dim = new Date(mo.y, mo.m + 1, 0).getDate();
      const lead = (new Date(mo.y, mo.m, 1).getDay() + 6) % 7;
      const cells = [];
      const blank = (k) => ({ key: k, isDay: false, band: "none", bg: "transparent", shadow: "none", color: "transparent", weight: 400, cursor: "default", day: "", pick: () => {} });
      for (let i = 0; i < lead; i++) cells.push(blank("b" + mo.m + i));
      for (let day = 1; day <= dim; day++) {
        const iso = this.isoOf(mo.y, mo.m, day);
        const isStart = iso === d.start, isEnd = iso === d.end;
        const endpoint = isStart || isEnd;
        const inside = !!(d.start && d.end && iso > d.start && iso < d.end);
        const band = d.end && d.start !== d.end
          ? (inside ? "full" : isStart ? "right" : isEnd ? "left" : "none")
          : "none";
        cells.push({
          key: iso,
          isDay: true,
          day: day,
          band: band === "full" ? AnalyticsScreen.TINT
            : band === "right" ? "linear-gradient(90deg, rgba(0,0,0,0) 0 50%, " + AnalyticsScreen.TINT + " 50% 100%)"
            : band === "left" ? "linear-gradient(90deg, " + AnalyticsScreen.TINT + " 0 50%, rgba(0,0,0,0) 50% 100%)"
            : "none",
          bg: endpoint ? "var(--accent)" : inside ? AnalyticsScreen.TINT : "var(--surface)",
          shadow: endpoint || !inside ? "0px 1px 1.5px var(--sh), 0px 1px 1px var(--sh)" : "none",
          color: endpoint ? "#000000" : "var(--text)",
          weight: endpoint ? 600 : 500,
          cursor: "pointer",
          pick: () => this.pickDay(iso),
        });
      }
      while (cells.length % 7) cells.push(blank("t" + mo.m + cells.length));
      const rows = [];
      for (let i = 0; i < cells.length; i += 7) rows.push({ key: mo.m + "-r" + i, cells: cells.slice(i, i + 7) });
      return { key: mo.y + "-" + mo.m, label: AnalyticsScreen.MONTH_SHORT[mo.m] + " " + mo.y, rows: rows };
    });
    const ready = !!(d.start && d.end);
    return {
      calOpen: this.screenLive("calendar"),
      calAnim: this.screenAnim("calendar"),
      calMonths: months,
      calWeekdays: AnalyticsScreen.WEEK_LABELS.map((l) => ({ key: l, label: l })),
      calHasRange: ready,
      calRangeText: ready ? this.dmy(d.start) + " - " + this.dmy(d.end) : "",
      calPadTop: ready ? "24px" : "16px",
      applyCalendar: () => this.applyCalendar(),
      closeCalendar: () => this.nav(this.state.calCtx === "cat" ? "category" : "main", -1),
    };
  }

  // ── Category detail ─────────────────────────────────────────────────
  static CAT_DETAIL = [
    { title: "Аптеки", monthly: 12200, merchants: [
      { name: "Аптека Доброго Дня", logo: "АДД", bg: "#ec3d96", min: 120, max: 1200 },
      { name: "ANC", logo: "ANC", bg: "#1f7a4d", min: 200, max: 1400 },
      { name: "Подорожник", logo: "ПОД", bg: "#4b45e0", min: 150, max: 2200 } ] },
    { title: "Таксі", monthly: 9540, merchants: [
      { name: "Bolt", logo: "Bolt", bg: "#1f9b6a", min: 80, max: 620 },
      { name: "Uber", logo: "Uber", bg: "var(--brand-black)", min: 95, max: 540 },
      { name: "Uklon", logo: "Ukl", bg: "#f2b21b", min: 70, max: 480 } ] },
    { title: "Одяг та взуття", monthly: 6100, merchants: [
      { name: "Zara", logo: "ZARA", bg: "var(--brand-black)", min: 700, max: 3400 },
      { name: "Reserved", logo: "RSV", bg: "#1e3a8a", min: 450, max: 2100 },
      { name: "Intertop", logo: "INT", bg: "#c11c3a", min: 900, max: 3600 } ] },
    { title: "Дім та ремонт", monthly: 4240, merchants: [
      { name: "Епіцентр", logo: "EPI", bg: "#f26a11", min: 250, max: 2400 },
      { name: "Leroy Merlin", logo: "LM", bg: "#2ea836", min: 300, max: 2600 },
      { name: "JYSK", logo: "JYS", bg: "#1e86c8", min: 180, max: 1500 } ] },
  ];

  // Income counterparties — same shape as POOL so one detail screen serves both.
  static INCOME_POOL = [
    { name: "Зарахування переказу", color: "var(--income)", icon: "icons/transfer-received", m: [
      { n: "ТОВ «Аркада Груп»", l: "АГ", b: "var(--income)", lo: 24000, hi: 32000 },
      { n: "Ірина Ковальчук", l: "ІК", b: "#1e86c8", lo: 1500, hi: 9000 },
      { n: "Андрій Мельник", l: "АМ", b: "#8637B9", lo: 800, hi: 6500 },
      { n: "ФОП Гнатюк О. П.", l: "ФГ", b: "#0ea5a4", lo: 3000, hi: 14000 } ] },
    { name: "Інше", color: "#6B7077", icon: "icons/other", m: [
      { n: "Кешбек", l: "КБ", b: "#6B7077", lo: 60, hi: 900 },
      { n: "Відсотки на залишок", l: "ВЗ", b: "#64748b", lo: 40, hi: 700 },
      { n: "Повернення покупки", l: "ПП", b: "#8e8e93", lo: 150, hi: 2400 } ] },
  ];

  // Opening a category clones the main screen's timeframe; from then on the two
  // are independent, so going back restores exactly what the main screen had.
  openCategory(pool, amount, income) {
    const s = this.state;
    this.nav("category", 1, {
      animTick: s.animTick + 1,
      cat: {
        pool: pool, index: pool, amount: amount, income: !!income,
        openPeriod: s.activePeriod, openPage: s.page, openCustom: s.custom,
        period: s.activePeriod, page: s.page, selectedBar: s.initialSel ? null : s.selectedBar, custom: s.custom,
      },
    });
  }

  catPatch(patch) {
    this.setState((s) => ({ animTick: s.animTick + 1, cat: Object.assign({}, s.cat, { noGrow: false }, patch) }));
  }

  // Anchored so the current month always equals the amount the category row on
  // Analytics shows — one scale per category, constant across pages.
  // One scale per opened category: whatever the row on Analytics showed becomes
  // the total of the period it was opened from; every other period keeps that scale.
  catMult(c) {
    const seedShift = c.income ? 0 : (c.pool + 1) * 211;
    const base = this.specFor(c.openPeriod, c.openPage, !!c.income, c.openCustom, 1, seedShift);
    const sum = base.values.reduce((a, b) => a + b, 0) || 1;
    return (c.amount || sum) / sum;
  }

  catGroups(idx, tf, page, custom, income) {
    if (income) return this.incomeGroups(idx, tf, page, custom);
    const p = AnalyticsScreen.POOL[idx] || AnalyticsScreen.POOL[0];
    const cat = { merchants: p.m.map((x) => ({ name: x.n, logo: x.l, bg: x.b, min: x.lo, max: x.hi })) };
    let dates = [];
    if (custom) {
      dates = this.rangeDays(custom).reverse();
    } else if (tf === 0) {
      const start = 1 + (3 - Math.min(page, 3)) * 7;
      for (let i = 6; i >= 0; i--) dates.push({ y: 2025, m: 8, d: start + i });
    } else {
      const cur = tf === 2 ? new Date(2025 - page, 11, 28) : new Date(2025, 8, 30);
      for (let i = 0; i < 16; i++) { dates.push({ y: cur.getFullYear(), m: cur.getMonth(), d: cur.getDate() }); cur.setDate(cur.getDate() - 2); }
    }
    const groups = [];
    for (const dt of dates) {
      if (groups.length >= 6) break;
      const seed = (idx + 1) * 77 + dt.y * 13 + dt.m * 29 + dt.d * 7;
      if (this.noise(seed) < 0.28) continue; // quiet days keep the list uneven
      const count = 1 + Math.floor(this.noise(seed + 5) * 3.4);
      const items = [];
      for (let k = 0; k < count; k++) {
        const mr = cat.merchants[Math.floor(this.noise(seed * 1.37 + k * 19.7 + 11) * cat.merchants.length) % cat.merchants.length];
        const amt = mr.min + this.noise(seed + k * 5.3 + 23) * (mr.max - mr.min);
        const hh = 7 + Math.floor(this.noise(seed + k * 2.1 + 31) * 15);
        const mm = Math.floor(this.noise(seed + k * 4.9 + 41) * 60);
        items.push({
          key: dt.m + "-" + dt.d + "-" + k,
          logo: (mr.name || "").trim().charAt(0).toUpperCase(), logoBg: mr.bg, name: mr.name,
          time: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"),
          amount: "-" + this.money(amt) + " ₴",
          divider: k < count - 1,
        });
      }
      groups.push({
        key: dt.y + "-" + dt.m + "-" + dt.d,
        date: AnalyticsScreen.WEEK_LABELS[(new Date(dt.y, dt.m, dt.d).getDay() + 6) % 7] + ", " + dt.d + " " + AnalyticsScreen.MONTH_GEN[dt.m],
        items: items,
      });
    }
    return groups;
  }

  // Salary on the 5th/15th/25th for the main stream; the "Інше" stream trickles.
  incomeGroups(idx, tf, page, custom) {
    const p = AnalyticsScreen.INCOME_POOL[idx] || AnalyticsScreen.INCOME_POOL[0];
    const main = idx === 0;
    let dates = [];
    if (custom) dates = this.rangeDays(custom).reverse();
    else if (tf === 0) { const st = 1 + (3 - Math.min(page, 3)) * 7; for (let i = 6; i >= 0; i--) dates.push({ y: 2025, m: 8, d: st + i }); }
    else {
      const cur = tf === 2 ? new Date(2025 - page, 11, 28) : new Date(2025, 8, 30);
      for (let i = 0; i < 90; i++) { dates.push({ y: cur.getFullYear(), m: cur.getMonth(), d: cur.getDate() }); cur.setDate(cur.getDate() - 1); }
    }
    const groups = [];
    for (const dt of dates) {
      if (groups.length >= 6) break;
      const seed = (idx + 1) * 313 + dt.y * 13 + dt.m * 29 + dt.d * 7;
      const payday = dt.d === 5 || dt.d === 15 || dt.d === 25;
      if (main ? !payday : this.noise(seed) < 0.62) continue;
      const count = main ? 1 : 1 + Math.floor(this.noise(seed + 5) * 2.2);
      const items = [];
      for (let k = 0; k < count; k++) {
        const mr = main && dt.d === 5 ? p.m[0] : p.m[Math.floor(this.noise(seed * 1.37 + k * 19.7 + 11) * p.m.length) % p.m.length];
        const amt = mr.lo + this.noise(seed + k * 5.3 + 23) * (mr.hi - mr.lo);
        const hh = 8 + Math.floor(this.noise(seed + k * 2.1 + 31) * 12);
        const mm = Math.floor(this.noise(seed + k * 4.9 + 41) * 60);
        items.push({
          key: dt.m + "-" + dt.d + "-" + k,
          logo: (mr.n || "").trim().charAt(0).toUpperCase(), logoBg: mr.b, name: mr.n,
          time: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"),
          amount: "+" + this.money(amt) + " ₴",
          divider: k < count - 1,
        });
      }
      groups.push({
        key: dt.y + "-" + dt.m + "-" + dt.d,
        date: AnalyticsScreen.WEEK_LABELS[(new Date(dt.y, dt.m, dt.d).getDay() + 6) % 7] + ", " + dt.d + " " + AnalyticsScreen.MONTH_GEN[dt.m],
        items: items,
      });
    }
    return groups;
  }

  catVals() {
    const c = this.state.cat;
    const open = this.screenLive("category") && !!c;
    const opens = {
      openCat0: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCategory(0); },
      openCat1: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCategory(1); },
      openCat2: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCategory(2); },
      openCat3: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCategory(3); },
    };
    if (!c) return Object.assign({ catOpen: false, catAnim: "none", catTitle: "", catBars: [], catGroups: [], catShowTabs: true, catHasCustom: false, catCustomLabel: "", openCatCalendar: () => {}, clearCatCustom: () => {}, catBack: () => {}, catSelectPeriod0: () => {}, catSelectPeriod1: () => {}, catSelectPeriod2: () => {}, catSwipeStart: () => {}, catSwipeEnd: () => {}, catClearSelection: () => {} }, opens);
    const inc = !!c.income;
    const def = (inc ? AnalyticsScreen.INCOME_POOL : AnalyticsScreen.POOL)[c.pool] || AnalyticsScreen.POOL[0];
    const PLOT = 233;
    const mult = this.catMult(c);
    const spec = this.specFor(c.period, c.page, inc, c.custom, mult, inc ? 0 : (c.pool + 1) * 211);
    const n = spec.values.length;
    const sel = c.selectedBar !== null && c.selectedBar !== undefined && c.selectedBar < n ? c.selectedBar : null;
    const axisMax = this.niceMax(Math.max.apply(null, spec.values));
    const total = spec.values.reduce((a, b) => a + b, 0);
    const avg = total / n;
    const h = (v) => Math.max(6, Math.round((v / axisMax) * PLOT));
    const plotW = 380 - 43.797;
    const center = ((sel === null ? 0 : sel) + 0.5) * (plotW / n);
    const color = inc ? "var(--income)" : "#f4470b";
    const idle = "var(--text)";
    const accent = this.props.accentColor ?? "var(--accent)";

    return {
      catOpen: open,
      catAnim: this.screenAnim("category"),
      catTitle: def.name,
      catIcon: this.iconUrl(def),
      catIconBg: this.iconBg(def),
      catColor: def.color,
      catBars: spec.values.map((v, i) => ({
        key: c.pool + "-" + c.period + "-" + c.page + "-" + i,
        label: spec.labels[i],
        w: spec.width + "px",
        h: h(v) + "px",
        scale: sel === null || sel === i ? 1 : 0,
        labelColor: sel === i ? "var(--text-hi)" : "var(--text3)",
        labelWeight: sel === i ? 600 : 400,
        trackBg: sel === null || sel === i ? "transparent" : "color-mix(in srgb, " + color + " 34%, transparent)",
        growAnim: sel === null ? ["growUpA", "growUpB", "growUpC"][(c.period + c.page + i) % 3]
          : sel === i ? ["growUpA", "growUpB", "growUpC"][this.state.animTick % 3] : "none",
        select: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.catPatch({ selectedBar: i }); },
      })),
      catChartPages: this.pageWindow(c.page, c.custom).map((pg) => this.plotPage({
        tf: c.period, page: pg, curPage: c.page, income: inc, custom: c.custom,
        mult: mult, seedShift: inc ? 0 : (c.pool + 1) * 211, sel: sel, color: color, small: true, tag: "c" + c.pool, noGrow: c.noGrow,
        onSelect: (i) => this.catPatch({ selectedBar: i }),
      })),
      catPagerDown: this.pager("cat").down,
      catPagerMove: this.pager("cat").move,
      catPagerUp: this.pager("cat").up,
      catConnRef: this.pager("cat").connRef,
      catTrackRef: this.pager("cat").ref,
      catActiveFill: color,
      catAmount: this.fmt(sel === null ? total : spec.values[sel]),
      catAmountChars: this.amountChars(this.fmt(sel === null ? total : spec.values[sel]), this.catPeriodChanged(c), this._catPeriodTick),
      catPeriodFade: this._catPeriodChanged ? ["labelFadeA", "labelFadeB"][this._catPeriodTick % 2] + " 320ms ease both" : "none",
      catPeriod: sel === null ? spec.range : spec.names[sel],
      catAxis0: this.axisLabel(0, axisMax),
      catAxis1: this.axisLabel(axisMax / 2, axisMax),
      catAxis2: this.axisLabel(axisMax, axisMax),
      catShowAverage: sel === null,
      catAvgBottom: Math.round((avg / axisMax) * PLOT) + "px",
      catAvgLabel: "Сер. " + this.axisLabel(avg, axisMax),
      catBadgeLeft: (sel === null ? (this.state.catBadgeW || 0) / 2 : this.clampBadge(center, "cat")) + "px",
      catBadgeBg: sel === null ? "transparent" : "var(--badge)",
      catBadgeShadow: sel === null ? "none" : "0px 2px 2px var(--sh2)",
      catBadgePadding: sel === null ? "2px 0 2px" : "2px 14px 2px",
      catBadgeMove: this._badgeReady && !c.noGrow ? "left 420ms cubic-bezier(0.25, 0.8, 0.25, 1)" : "none",
      catBadgeAnim: c.noGrow && sel === null ? "none" : ["badgeFadeA", "badgeFadeB"][this.state.animTick % 2],
      catShowConnector: sel !== null,
      catConnectorLeft: center + "px",
      catConnectorHeight: sel !== null ? (247 - h(spec.values[sel])) + "px" : "0px",
      catDrawAnim: ["drawDownA", "drawDownB", "drawDownC"][this.state.animTick % 3],
      catPer0Color: c.period === 0 ? accent : idle,
      catPer1Color: c.period === 1 ? accent : idle,
      catPer2Color: c.period === 2 ? accent : idle,
      catPeriodPillX: c.period * 100 + "%",
      catShowTabs: !c.custom,
      catHasCustom: !!c.custom,
      catCustomLabel: c.custom ? this.rangeLabel(c.custom) : "",
      catGroups: this.catGroups(c.pool, c.period, c.page, c.custom, inc),
      catBack: () => this.nav("main", -1),
      openCatCalendar: () => this.openCalendar("cat"),
      clearCatCustom: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.catPatch({ custom: null, selectedBar: null, page: 0 }); },
      catSelectPeriod0: () => this.catPatch({ period: 0, selectedBar: null, page: 0 }),
      catSelectPeriod1: () => this.catPatch({ period: 1, selectedBar: null, page: 0 }),
      catSelectPeriod2: () => this.catPatch({ period: 2, selectedBar: null, page: 0 }),
      catClearSelection: () => this.catPatch({ selectedBar: null }),
      catSwipeStart: (e) => { this._cx = e.clientX; this._cy = e.clientY; },
      catSwipeEnd: (e) => {
        if (this._cx == null || c.custom) { this._cx = null; return; }
        const dx = e.clientX - this._cx, dy = e.clientY - this._cy;
        this._cx = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        const next = Math.min(3, Math.max(0, c.page + (dx > 0 ? 1 : -1)));
        if (next !== c.page) this.catPatch({ page: next, selectedBar: null });
      },
      openCat0: opens.openCat0, openCat1: opens.openCat1, openCat2: opens.openCat2, openCat3: opens.openCat3,
    };
  }

  renderVals() {
    const PLOT = 233; // px between the top of the plot and the label row
    const spec = this.spec();
    const sel = this.state.selectedBar;
    const bars = this.state.chartType === "bars";
    const frame = this.props.showDeviceFrame ?? true;
    const color = this.color();
    const n = spec.values.length;
    const inSel = sel !== null && sel < n;

    const accent = this.props.accentColor ?? "var(--accent)";
    const periodAccent = this.props.accentColor ?? "var(--accent)";
    const pillBg = "var(--surface)";
    const pillShadow = "0px 1px 1.5px var(--sh), 0px 1px 1px var(--sh)";
    const idle = "var(--text)";
    const t = this.state.activeTab;
    const p = this.state.activePeriod;
    const seg = (on, activeColor) => ({ color: on ? activeColor : idle });
    const pillX = (i) => i * 100 + "%";

    const axisMax = this.niceMax(Math.max.apply(null, spec.values));
    const total = spec.values.reduce((a, b) => a + b, 0);
    const avg = total / n;
    const amountText = inSel && bars
      ? this.fmt(spec.values[sel])
      : (this.state.segment !== null && !bars && t === 0
        ? this.fmt(total * (AnalyticsScreen.CATS[this.state.segment] || { share: 1 }).share)
        : this.fmt(total));
    const h = (v) => Math.max(6, Math.round((v / axisMax) * PLOT));

    const barList = spec.values.map((v, i) => ({
      key: p + "-" + this.state.page + "-" + t + "-" + i,
      label: spec.labels[i],
      w: spec.width + "px",
      h: h(v) + "px",
      scale: sel === null || sel === i ? 1 : 0,
      labelColor: sel === i ? "var(--text-hi)" : "var(--text3)",
      labelWeight: sel === i ? 600 : 400,
      // the selected bar (and the all-active state) carries no 24% track: it grows
      // in full colour from zero, exactly like the initial load
      trackBg: sel === null || sel === i ? "transparent" : "color-mix(in srgb, " + color + " 34%, transparent)",
      growAnim: sel === null
        ? ["growUpA", "growUpB", "growUpC"][(p + this.state.page + t) % 3]
        : sel === i
          ? ["growUpA", "growUpB", "growUpC"][this.state.animTick % 3]
          : "none",
      select: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.bump({ selectedBar: i }); },
    }));

    // badge sits over the selected column: plot spans 16 → 340 inside the 380 card
    const plotW = 380 - 43.797;
    const center = ((inSel ? sel : 0) + 0.5) * (plotW / n);

    return {
      tab0Color: seg(t === 0, accent).color, tab1Color: seg(t === 1, accent).color,
      per0Color: seg(p === 0, periodAccent).color, per1Color: seg(p === 1, periodAccent).color, per2Color: seg(p === 2, periodAccent).color,
      tabPillX: pillX(t), periodPillX: pillX(p), chartPillX: pillX(bars ? 0 : 1),

      ...this.segmentVals(total),
      ...this.pickerVals(),
      ...this.calVals(),
      ...this.catVals(),
      chartPages: this.pageWindow(this.state.page, this.state.custom).map((pg) => this.plotPage({
        tf: p, page: pg, curPage: this.state.page, income: t === 1, custom: this.state.custom,
        mult: 1, seedShift: 0, sel: sel, color: color, tag: "m" + t, noGrow: this.state.noGrow,
        onSelect: (i) => this.bump({ selectedBar: i }),
      })),
      radialPages: (() => {
        const ringText = this.radialAmount(p, this.state.page, t === 1, this.state.custom, this.state.segment);
        const countUp = this.radialChanged(t, p, ringText, this.state.noGrow, bars);
        return this.pageWindow(this.state.page, this.state.custom).map((pg) => this.radialPage({
          tf: p, page: pg, curPage: this.state.page, income: t === 1, custom: this.state.custom,
          sel: this.state.segment, noGrow: this.state.noGrow, countUp: countUp,
        }));
      })(),
      pagerDown: this.pager("main").down,
      pagerMove: this.pager("main").move,
      pagerUp: this.pager("main").up,
      connRef: this.pager("main").connRef,
      trackRef: this.pager("main").ref,
      showPeriodTabs: !this.state.custom,
      hasCustom: !!this.state.custom,
      customLabel: this.state.custom ? this.rangeLabel(this.state.custom) : "",
      openMainCalendar: () => this.openCalendar("main"),
      clearCustom: (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        this.bump({ custom: null, selectedBar: null, page: 0 });
      },
      mainAnim: this.screenAnim("main"),
      topBarOpacity: this.state.screen === "calendar" || this.state.scrolled ? 1 : 0,
      navTitle: this.state.screen === "calendar" ? "Період"
        : this.state.screen === "picker" ? "Картки та конверти"
        : this.state.screen === "category" && this.state.cat ? (AnalyticsScreen.POOL[this.state.cat.pool] || {}).name || "Категорія"
        : "Аналітика",
      navBack: () => {
        const sc = this.state.screen;
        if (sc === "calendar") this.nav(this.state.calCtx === "cat" ? "category" : "main", -1);
        else if (sc === "category" || sc === "picker") this.nav("main", -1);
      },
      theme: this.state.theme,
      themeOpacity: this.state.themeFade ? 0.06 : 1,
      toggleTheme: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.toggleTheme(); },
      isBars: bars, isRadial: !bars, isExpenses: t === 0, isIncome: t === 1,
      barsIconFill: bars ? "var(--accent)" : "var(--glyph)",
      radialIconFill: bars ? "var(--glyph)" : "var(--accent)",

      bars: barList,
      activeFill: color,
      inactiveFill: "color-mix(in srgb, " + color + " 34%, transparent)",
      axis0: "0 тис",
      axis1: this.thousands(axisMax / 2),
      axis2: this.thousands(axisMax),
      avgBottom: Math.round((avg / axisMax) * PLOT) + "px",
      avgLabel: "Сер. " + this.thousands(avg),
      showAverage: bars && !inSel,
      growAnim: sel !== null || this.state.noGrow ? "none" : ((p + this.state.page + t) % 2 ? "growUpA" : "growUpB"),
      // monotonic token: every selection / period / dataset change picks a different
      // keyframe name, so the draw always restarts
      drawAnim: ["drawDownA", "drawDownB", "drawDownC"][this.state.animTick % 3],
      // one stable name: it runs on mount and when the bar chart remounts (returning
      // from radial), and is never restarted by a bar switch
      // returning to the total re-plays the fade so the text appears at the left
      // edge instead of visibly travelling there
      badgeAnim: this.state.noGrow && !inSel ? "none" : inSel && bars ? "badgeFadeA" : ["badgeFadeA", "badgeFadeB"][this.state.animTick % 2],

      amountChars: this.amountChars(amountText, bars && this.periodChanged(t, p)),
      periodFade: bars && this._periodChanged ? ["labelFadeA", "labelFadeB"][this._periodTick % 2] + " 320ms ease both" : "none",
      amount: amountText,
      period: inSel && bars ? spec.names[sel] : spec.range,
      // centre over the bar, but never let the badge cross the chart card's edges
      // (the card already sits 16px inside the screen) — same rule in all timeframes
      badgeLeft: (inSel && bars ? this.clampBadge(center) : (this.state.badgeW || 0) / 2) + "px",
      // no-selection → first pick: fade into place instead of sliding from x=0
      // bar → bar slides horizontally; entering from (or leaving to) the no-selection
      // state places the badge directly, so there is no travel from the total's position
      // a swipe changes the text width, so the centring offset must not animate —
      // that sideways drift is what read as shaking
      badgeMove: this._badgeReady && !this.state.noGrow ? "left 420ms cubic-bezier(0.25, 0.8, 0.25, 1)" : "none",
      badgeBg: inSel && bars ? "var(--badge)" : "transparent",
      badgeShadow: inSel && bars ? "0px 2px 2px var(--sh2)" : "none",
      badgePadding: inSel && bars ? "2px 14px 2px" : "2px 0 2px",
      showConnector: inSel && bars && (this.props.showConnectorLine ?? true),
      connectorLeft: center + "px",
      connectorHeight: inSel ? (247 - h(spec.values[sel])) + "px" : "0px",

      // Transparent at rest; the page ground plus a blur once anything scrolls under it.
      topBarBg: this.state.scrolled ? "var(--bgA)" : "transparent",
      topBarBlur: this.state.scrolled ? "blur(22px) saturate(120%)" : "none",
      onScroll: (e) => {
        const on = e.currentTarget.scrollTop > 2;
        const key = this.state.screen;
        if (on !== this.state.scrolled || (this.state.scrollMap || {})[key] !== on) {
          this.setState((s) => ({ scrolled: on, scrollMap: Object.assign({}, s.scrollMap, { [key]: on }) }));
        }
      },

      // Purely decorative bezel — collapses to nothing when the frame is off,
      // so the 412px app viewport and its layout are unaffected either way.
      bezelPad: frame ? "13px" : "0px",
      bezelRadius: frame ? "58px" : "40px",
      bezelBg: frame ? "linear-gradient(150deg, #4a4f57 0%, #1b1d21 18%, #2c3037 50%, #14161a 82%, #43484f 100%)" : "transparent",
      bezelShadow: frame ? "0 60px 120px rgba(0,0,0,0.72), 0 30px 60px rgba(0,0,0,0.52), 0 10px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.06)" : "none",
      screenRadius: frame ? "45px" : "40px",
      islandTop: frame ? "11px" : "-100px",
      islandW: frame ? "124px" : "0px",
      buttonSide: frame ? "-2px" : "-100px",
      buttonFill: frame ? "linear-gradient(90deg, #14161a, #4a4f57)" : "transparent",

      showHomeIndicator: this.props.showHomeIndicator ?? true,
      clearSelection: () => this.clear(),
      backgroundClick: (e) => {
        if (e.target.closest && e.target.closest('button, a, input, [data-bar], [data-seg]')) return;
        if (this.state.segment !== null) { this.startSwap(null); return; }
        if (this.state.selectedBar !== null) this.bump({ selectedBar: null });
      },
      swipeStart: (e) => { this._x = e.clientX; this._y = e.clientY; },
      swipeEnd: (e) => {
        if (this._x == null) return;
        const dx = e.clientX - this._x, dy = e.clientY - this._y;
        this._x = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        this.swipe(dx > 0 ? 1 : -1); // drag right → earlier period
      },
      selectTab0: () => this.bump({ activeTab: 0, selectedBar: null }),
      selectTab1: () => this.bump({ activeTab: 1, selectedBar: null }),
      selectPeriod0: () => this.bump({ activePeriod: 0, selectedBar: null, page: 0 }),
      selectPeriod1: () => this.bump({ activePeriod: 1, selectedBar: null, page: 0 }),
      selectPeriod2: () => this.bump({ activePeriod: 2, selectedBar: null, page: 0 }),
      showBars: () => this.bump({ chartType: "bars", selectedBar: null }),
      showRadial: () => this.bump({ chartType: "radial", selectedBar: null }),
      onBack: () => {},
    };
  }

  render() {
    const V = { ...AnalyticsScreen.defaultProps, ...this.props, ...(this.renderVals() || {}) };
    return (
      <>
        <div style={{position: "relative", padding: V.bezelPad, borderRadius: V.bezelRadius, background: V.bezelBg, boxShadow: V.bezelShadow, transform: "scale(0.865)", transformOrigin: "center center", flexShrink: "0"}}>
          <div style={{position: "absolute", left: V.buttonSide, top: "168px", width: "3px", height: "62px", borderRadius: "2px", background: V.buttonFill, pointerEvents: "none"}} />
          <div style={{position: "absolute", left: V.buttonSide, top: "252px", width: "3px", height: "62px", borderRadius: "2px", background: V.buttonFill, pointerEvents: "none"}} />
          <div style={{position: "absolute", right: V.buttonSide, top: "214px", width: "3px", height: "96px", borderRadius: "2px", background: V.buttonFill, pointerEvents: "none"}} />
          <div style={{position: "relative", borderRadius: V.screenRadius, overflow: "hidden", background: "#000000"}}>
            <div style={{position: "absolute", left: "50%", top: V.islandTop, transform: "translateX(-50%)", width: V.islandW, height: "36px", borderRadius: "20px", background: "#050505", zIndex: "200", pointerEvents: "none"}} />
            <div data-screen-label="Аналітика" data-theme={V.theme} onClick={V.backgroundClick} style={{opacity: V.themeOpacity, transition: "opacity 150ms linear", position: "relative", width: "412px", height: "894px", boxSizing: "border-box", overflow: "hidden", flexShrink: "0", borderRadius: "40px", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", fontFamily: "'Pryvat Sans UI', sans-serif", color: "var(--text)", WebkitFontSmoothing: "antialiased"}}>
              <div onScroll={V.onScroll} style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", width: "100%", animation: V.mainAnim, padding: "113px 16px 50px", boxSizing: "border-box", flex: "1 1 auto", minHeight: "0", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", overflowX: "hidden", scrollbarWidth: "none", msOverflowStyle: "none"}}>
                <div style={{position: "absolute", left: "0", top: "0", width: "100%", height: "321px", backgroundImage: "var(--header)", backgroundSize: "100% 100%, 100% 100%, 100% 100%", backgroundRepeat: "no-repeat", pointerEvents: "none"}} />
                <div style={{position: "relative", display: "flex", height: "40px", alignItems: "center", justifyContent: "center", padding: "2px", boxSizing: "border-box", width: "100%", borderRadius: "20px", background: "var(--ctrl)", flexShrink: "0"}}>
                  <div style={{position: "absolute", top: "2px", bottom: "2px", left: "2px", width: "calc((100% - 4px) / 2)", borderRadius: "20px", background: "var(--thumb)", boxShadow: "0px 1px 1.5px var(--sh), 0px 1px 1px var(--sh)", transform: `translateX(${V.tabPillX})`, transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)", pointerEvents: "none"}} />
                  <button className="ps0" type="button" onClick={V.selectTab0} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", gap: "4px", height: "100%", alignItems: "center", justifyContent: "center", padding: "4px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                    <span style={{fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.tab0Color}}>
                      {"Витрати"}
                    </span>
                  </button>
                  <button className="ps0" type="button" onClick={V.selectTab1} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", gap: "4px", height: "100%", alignItems: "center", justifyContent: "center", padding: "4px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                    <span style={{fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.tab1Color}}>
                      {"Доходи"}
                    </span>
                  </button>
                </div>
                <div style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px", width: "380px", flexShrink: "0"}}>
                  <div style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px", flexShrink: "0"}}>
                    <div style={{position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "380px", flexShrink: "0"}}>
                      <button className="ps1" type="button" onClick={V.openPicker} style={{position: "relative", display: "flex", gap: "8px", alignItems: "center", padding: "7px 12px 7px 16px", border: "none", borderRadius: "999px", background: "var(--ctrl)", flex: "0 1 auto", minWidth: "0", marginRight: "16px", cursor: "pointer", textAlign: "left", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                        <span style={{position: "relative", display: "block", width: "22px", height: "22px", flexShrink: "0"}}>
                          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{position: "absolute", inset: "0"}}>
                            <path d="M20.1668 5.49996V16.5C20.1668 17.0041 19.9835 17.435 19.626 17.7925C19.2685 18.15 18.8377 18.3333 18.3335 18.3333H3.66683C3.16266 18.3333 2.73183 18.15 2.37433 17.7925C2.01683 17.435 1.8335 17.0041 1.8335 16.5V5.49996C1.8335 4.99579 2.01683 4.56496 2.37433 4.20746C2.73183 3.84996 3.16266 3.66663 3.66683 3.66663H18.3335C18.8377 3.66663 19.2685 3.84996 19.626 4.20746C19.9835 4.56496 20.1668 4.99579 20.1668 5.49996ZM3.66683 7.33329H18.3335V5.49996H3.66683V7.33329ZM3.66683 11V16.5H18.3335V11H3.66683Z" fill="var(--glyph)" fillOpacity="0.87" />
                          </svg>
                        </span>
                        <span style={{position: "relative", display: "block", flex: "0 1 auto", minWidth: "0", overflow: "hidden"}}>
                          <span onScroll={V.onChipScroll} style={{display: "block", maxWidth: "100%", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch"}}>
                            <span style={{display: "inline-block", fontSize: "14px", lineHeight: "22px", fontWeight: "400", letterSpacing: "0px", color: "var(--text)", whiteSpace: "nowrap"}}>
                              {V.chipLabel}
                            </span>
                          </span>
                          <span style={{position: "absolute", left: "0", top: "0", bottom: "0", width: "16px", pointerEvents: "none", opacity: V.chipFadeLeft, transition: "opacity 160ms ease", background: "linear-gradient(90deg, var(--ctrl) 0%, var(--ctrl0) 100%)"}} />
                          <span style={{position: "absolute", right: "0", top: "0", bottom: "0", width: "16px", pointerEvents: "none", opacity: V.chipFadeRight, transition: "opacity 160ms ease", background: "linear-gradient(270deg, var(--ctrl) 0%, var(--ctrl0) 100%)"}} />
                        </span>
                        <span style={{position: "relative", display: "block", width: "18px", height: "18px", flexShrink: "0"}}>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{position: "absolute", inset: "0"}}>
                            <path d="M5 7.2l4 4 4-4" />
                          </svg>
                        </span>
                      </button>
                      <div style={{position: "relative", display: "flex", height: "36px", width: "84px", alignItems: "center", padding: "2px", boxSizing: "border-box", borderRadius: "20px", background: "var(--ctrl)", flexShrink: "0"}}>
                        <div style={{position: "absolute", top: "2px", bottom: "2px", left: "2px", width: "calc((100% - 4px) / 2)", borderRadius: "20px", background: "var(--thumb)", boxShadow: "0px 1px 1.5px var(--sh), 0px 1px 1px var(--sh)", transform: `translateX(${V.chartPillX})`, transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)", pointerEvents: "none"}} />
                        <button className="ps0" type="button" onClick={V.showBars} aria-label="Стовпчикова діаграма" style={{position: "relative", flex: "1 0 0", minWidth: "1px", height: "100%", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
                            <path d="M13.3335 16.6667V11.8334C13.3335 11.2811 13.7812 10.8334 14.3335 10.8334H15.6668C16.2191 10.8334 16.6668 11.2811 16.6668 11.8334V16.6667H13.3335ZM8.3335 16.6667V4.33337C8.3335 3.78109 8.78121 3.33337 9.3335 3.33337H10.6668C11.2191 3.33337 11.6668 3.78109 11.6668 4.33337V16.6667H8.3335ZM3.3335 16.6667V8.50004C3.3335 7.94776 3.78121 7.50004 4.3335 7.50004H5.66683C6.21911 7.50004 6.66683 7.94776 6.66683 8.50004V16.6667H3.3335Z" fill={V.barsIconFill} />
                          </svg>
                        </button>
                        <button className="ps0" type="button" onClick={V.showRadial} aria-label="Кругова діаграма" style={{position: "relative", flex: "1 0 0", minWidth: "1px", height: "100%", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
                            <path d="M9.1875 18.2917C7.04861 18.0834 5.26389 17.1875 3.83333 15.6042C2.40278 14.0209 1.6875 12.1528 1.6875 10C1.6875 7.84726 2.40278 5.97921 3.83333 4.39587C5.26389 2.81254 7.04861 1.91671 9.1875 1.70837V4.20837C7.74306 4.40282 6.54861 5.04865 5.60417 6.14587C4.65972 7.2431 4.1875 8.52782 4.1875 10C4.1875 11.4723 4.65972 12.757 5.60417 13.8542C6.54861 14.9514 7.74306 15.5973 9.1875 15.7917V18.2917ZM10.8542 18.2917V15.7917C12.1597 15.625 13.2639 15.0834 14.1667 14.1667C15.0694 13.25 15.6181 12.1389 15.8125 10.8334H18.3125C18.1181 12.8195 17.3229 14.5105 15.9271 15.9063C14.5313 17.3021 12.8403 18.0973 10.8542 18.2917ZM15.8125 9.16671C15.6181 7.86115 15.0694 6.75004 14.1667 5.83337C13.2639 4.91671 12.1597 4.37504 10.8542 4.20837V1.70837C12.8403 1.90282 14.5313 2.69796 15.9271 4.09379C17.3229 5.48962 18.1181 7.1806 18.3125 9.16671H15.8125Z" fill={V.radialIconFill} />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0", flexShrink: "0"}}>
                      {V.isBars ? (
                        <>
                        <div style={{position: "relative", width: "380px", height: "334px", flexShrink: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "8px"}}>
                          <div style={{position: "relative", height: "62px", width: "380px", flexShrink: "0"}}>
                            <div data-badge="main" style={{position: "absolute", left: V.badgeLeft, transform: "translateX(-50%)", top: "4px", transition: V.badgeMove}}>
                              <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", padding: V.badgePadding, borderRadius: "8px", background: V.badgeBg, boxShadow: V.badgeShadow, letterSpacing: "0px", transition: "background 260ms ease, box-shadow 260ms ease, padding 380ms cubic-bezier(0.2, 0.7, 0.2, 1)"}}>
                                <p style={{margin: "0 0 -4px", display: "flex", fontSize: "28px", lineHeight: "36px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                  {(V.amountChars || []).map((ch, $index) => (
                                    <React.Fragment key={(ch && ch.key) ?? $index}>
                                    <span style={{display: "inline-block", whiteSpace: "pre", animation: ch.anim}}>
                                      {ch.c}
                                    </span>
                                    </React.Fragment>
                                  ))}
                                </p>
                                <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "400", color: "var(--text3)", whiteSpace: "nowrap", animation: V.periodFade}}>
                                  {V.period}
                                </p>
                              </div>
                            </div>
                            {V.showConnector ? (
                              <>
                              <div ref={V.connRef} style={{position: "absolute", top: "64px", height: V.connectorHeight, left: V.connectorLeft, width: "0", transition: "left 380ms cubic-bezier(0.2, 0.7, 0.2, 1), height 380ms cubic-bezier(0.2, 0.7, 0.2, 1)", borderLeft: "1.5px solid var(--div3)", transformOrigin: "top", animationName: V.drawAnim, animationDuration: "460ms", animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationFillMode: "backwards"}} />
                              </>
                            ) : null}
                          </div>
                          <div onPointerDown={V.pagerDown} onPointerMove={V.pagerMove} onPointerUp={V.pagerUp} onPointerCancel={V.pagerUp} onClick={V.clearSelection} style={{position: "relative", height: "264px", width: "380px", flexShrink: "0", overflow: "hidden", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none"}}>
                            <div style={{position: "absolute", left: "0", right: "0", top: "50%", transform: "translateY(-50%)", height: "264px", zIndex: "0", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "0 43.797px 16px 0", boxSizing: "border-box"}}>
                              <div style={{height: "14px", display: "flex", alignItems: "center"}}>
                                <div style={{width: "100%", height: "0", borderTop: "0.5px solid var(--div)"}} />
                              </div>
                              <div style={{height: "14px", display: "flex", alignItems: "center"}}>
                                <div style={{width: "100%", height: "0", borderTop: "0.5px solid var(--div)"}} />
                              </div>
                              <div style={{height: "14px", display: "flex", alignItems: "center"}}>
                                <div style={{width: "100%", height: "0", borderTop: "0.5px solid var(--div)"}} />
                              </div>
                            </div>
                            <div style={{position: "absolute", left: "0", top: "0", bottom: "0", right: "44px", overflow: "hidden"}}>
                              <div ref={V.trackRef} style={{position: "absolute", inset: "0", willChange: "transform"}}>
                                {(V.chartPages || []).map((pg, $index) => (
                                  <React.Fragment key={(pg && pg.key) ?? $index}>
                                  <div style={{position: "absolute", top: "0", bottom: "0", left: pg.offset, width: "380px"}}>
                                    <div style={{position: "absolute", inset: "0", padding: "0 40px 0 16px", boxSizing: "border-box"}}>
                                      <div style={{position: "absolute", inset: "0", display: "flex", alignItems: "center", padding: "0 43.797px 0 0", boxSizing: "border-box"}}>
                                        {(pg.bars || []).map((bar, $index) => (
                                          <React.Fragment key={(bar && bar.key) ?? $index}>
                                          <div data-bar="1" onClick={bar.select} style={{position: "relative", height: "100%", flex: "1 0 0", minWidth: "1px", cursor: "pointer"}}>
                                            <div style={{position: "absolute", top: "8px", bottom: "23px", left: "0", right: "0"}}>
                                              <div style={{position: "absolute", bottom: "0", left: "50%", transform: "translateX(-50%)", width: bar.w, height: bar.h, borderRadius: "999px", overflow: "hidden", background: bar.trackBg, transformOrigin: "bottom", animationName: bar.growAnim, animationDuration: "460ms", animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationFillMode: "backwards", transition: "height 380ms cubic-bezier(0.2, 0.7, 0.2, 1)"}}>
                                                <div style={{position: "absolute", inset: "0", borderRadius: "999px", background: pg.activeFill, transformOrigin: "bottom", transition: "transform 300ms cubic-bezier(0.2, 0.7, 0.2, 1)", transform: `scaleY(${bar.scale})`}} />
                                              </div>
                                            </div>
                                            <p style={{position: "absolute", bottom: "6.76px", left: "0", right: "0", transform: "translateY(50%)", margin: "0", fontSize: "10px", lineHeight: "14px", fontWeight: bar.labelWeight, textAlign: "center", color: bar.labelColor}}>
                                              {bar.label}
                                            </p>
                                          </div>
                                          </React.Fragment>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                            <div style={{position: "absolute", right: "-2px", top: "-2px", bottom: "-2px", left: "334px", zIndex: "5", pointerEvents: "none", background: "var(--bg)"}} />
                            <div style={{position: "absolute", right: "0", width: "43.797px", top: "50%", transform: "translateY(-50%)", height: "264px", zIndex: "6", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: "16px", boxSizing: "border-box"}}>
                              <p style={{margin: "0", width: "35.797px", alignSelf: "flex-end", fontSize: "10px", lineHeight: "14px", fontWeight: "400", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap"}}>
                                {V.axis2}
                              </p>
                              <p style={{margin: "0", width: "35.797px", alignSelf: "flex-end", fontSize: "10px", lineHeight: "14px", fontWeight: "400", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap"}}>
                                {V.axis1}
                              </p>
                              <p style={{margin: "0", width: "35.797px", alignSelf: "flex-end", fontSize: "10px", lineHeight: "14px", fontWeight: "400", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap"}}>
                                {V.axis0}
                              </p>
                            </div>
                            {V.showAverage ? (
                              <>
                              <div data-avg="1" style={{position: "absolute", left: "0", right: "43.797px", top: "8px", bottom: "23px", zIndex: "7", pointerEvents: "none", transition: "opacity 200ms ease"}}>
                                <div style={{position: "absolute", left: "0", right: "0", bottom: V.avgBottom, height: "0", borderTop: "1px dashed var(--text4)", transition: "bottom 380ms cubic-bezier(0.2, 0.7, 0.2, 1)"}}>
                                  <div style={{position: "absolute", right: "-43.797px", top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", padding: "1px 0 1px 4px", borderRadius: "4px", background: "var(--bg)"}}>
                                    <p style={{margin: "0", fontSize: "10px", lineHeight: "14px", fontWeight: "500", color: "var(--text-hi)", whiteSpace: "nowrap"}}>
                                      {V.avgLabel}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                        </>
                      ) : null}
                      {V.isRadial ? (
                        <>
                        <div onPointerDown={V.pagerDown} onPointerMove={V.pagerMove} onPointerUp={V.pagerUp} onPointerCancel={V.pagerUp} style={{position: "relative", width: "380px", height: "334px", flexShrink: "0", overflow: "hidden", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none"}}>
                          <svg width="0" height="0" style={{position: "absolute", pointerEvents: "none"}}>
                            <defs>
                              <filter id="segGlow" x="-30%" y="-30%" width="160%" height="160%">
                                <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={V.glowColor} floodOpacity="0.55" />
                              </filter>
                            </defs>
                          </svg>
                          <div ref={V.trackRef} style={{position: "absolute", inset: "0", willChange: "transform"}}>
                            {(V.radialPages || []).map((rp, $index) => (
                              <React.Fragment key={(rp && rp.key) ?? $index}>
                              <div style={{position: "absolute", top: "0", bottom: "0", left: rp.offset, width: "380px", paddingTop: "8px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center"}}>
                                <div style={{width: "288px", height: "288px", padding: "16px", boxSizing: "content-box", animation: rp.sweep, WebkitMaskImage: rp.mask, maskImage: rp.mask}}>
                                  <svg width="288" height="288" viewBox="0 0 288 288" fill="none" style={{display: "block", overflow: "visible"}}>
                                    {(rp.segs || []).map((seg, $index) => (
                                      <React.Fragment key={(seg && seg.key) ?? $index}>
                                      <path d={seg.d} fill={seg.fill} filter={seg.glow} data-seg="1" onClick={seg.select} style={{cursor: "pointer", transition: "fill 320ms cubic-bezier(0.32, 0.72, 0, 1)"}} />
                                      </React.Fragment>
                                    ))}
                                  </svg>
                                </div>
                                <div style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 16px 4px", letterSpacing: "0px", animation: rp.centreAnim}}>
                                  {rp.showSel ? (
                                    <>
                                    <div role="img" style={{position: "absolute", left: "50%", bottom: "100%", transform: "translateX(-50%)", marginBottom: "10px", width: "48px", height: "48px", borderRadius: "100px", backgroundImage: V.segIconBg, backgroundSize: "cover", backgroundRepeat: "no-repeat", animationName: V.iconAnim, animationDuration: "460ms", animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationFillMode: "backwards"}} />
                                    </>
                                  ) : null}
                                  <p style={{margin: "0 0 -4px", display: "flex", fontSize: "28px", lineHeight: "36px", fontWeight: "600", color: "var(--text)", textAlign: "center", whiteSpace: "nowrap"}}>
                                    {(rp.amountChars || []).map((ch, $index) => (
                                      <React.Fragment key={(ch && ch.key) ?? $index}>
                                      <span style={{display: "inline-block", whiteSpace: "pre", animation: ch.anim}}>
                                        {ch.c}
                                      </span>
                                      </React.Fragment>
                                    ))}
                                  </p>
                                  <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "400", color: "var(--text3)", textAlign: "center", whiteSpace: "nowrap", animation: rp.periodFade}}>
                                    {rp.period}
                                  </p>
                                  {rp.showSel ? (
                                    <>
                                    <p style={{position: "absolute", left: "50%", top: "100%", transform: "translateX(-50%)", margin: "10px 0 0", fontSize: "20px", lineHeight: "28px", fontWeight: "600", color: "var(--text)", textAlign: "center", whiteSpace: "nowrap", animationName: V.pctAnim, animationDuration: "460ms", animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationFillMode: "backwards"}}>
                                      {V.segPct}
                                    </p>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {V.showPeriodTabs ? (
                    <>
                    <div style={{position: "relative", display: "flex", gap: "8px", alignItems: "flex-start", justifyContent: "center", width: "380px", flexShrink: "0"}}>
                      <div style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", height: "36px", alignItems: "center", justifyContent: "center", padding: "2px", boxSizing: "border-box", borderRadius: "20px", background: "var(--ctrl)"}}>
                        <div style={{position: "absolute", top: "2px", bottom: "2px", left: "2px", width: "calc((100% - 4px) / 3)", borderRadius: "20px", background: "var(--thumb)", boxShadow: "0px 1px 1.5px var(--sh), 0px 1px 1px var(--sh)", transform: `translateX(${V.periodPillX})`, transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)", pointerEvents: "none"}} />
                        <button className="ps0" type="button" onClick={V.selectPeriod0} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", gap: "4px", height: "100%", alignItems: "center", justifyContent: "center", padding: "2px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                          <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.per0Color}}>
                            {"Тижні"}
                          </span>
                        </button>
                        <button className="ps0" type="button" onClick={V.selectPeriod1} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", gap: "4px", height: "100%", alignItems: "center", justifyContent: "center", padding: "2px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                          <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.per1Color}}>
                            {"Місяці"}
                          </span>
                        </button>
                        <button className="ps0" type="button" onClick={V.selectPeriod2} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", gap: "4px", height: "100%", alignItems: "center", justifyContent: "center", padding: "2px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "color 240ms cubic-bezier(0.32, 0.72, 0, 1)", WebkitTapHighlightColor: "transparent"}}>
                          <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.per2Color}}>
                            {"Роки"}
                          </span>
                        </button>
                      </div>
                      <button type="button" onClick={V.openMainCalendar} aria-label="Обрати період" style={{position: "relative", width: "36px", height: "36px", flexShrink: "0", border: "none", borderRadius: "100px", background: "var(--ctrl)", cursor: "pointer", WebkitTapHighlightColor: "transparent"}}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
                          <path d="M10 17.5C9.76667 17.5 9.56667 17.4167 9.40833 17.2583C9.25 17.1 9.16667 16.9 9.16667 16.6667V13.3333C9.16667 13.1 9.25 12.9 9.40833 12.7417C9.56667 12.5833 9.76667 12.5 10 12.5C10.2333 12.5 10.4333 12.5833 10.5917 12.7417C10.75 12.9 10.8333 13.1 10.8333 13.3333V14.1667H16.6667C16.9 14.1667 17.1 14.25 17.2583 14.4083C17.4167 14.5667 17.5 14.7667 17.5 15C17.5 15.2333 17.4167 15.4333 17.2583 15.5917C17.1 15.75 16.9 15.8333 16.6667 15.8333H10.8333V16.6667C10.8333 16.9 10.75 17.1 10.5917 17.2583C10.4333 17.4167 10.2333 17.5 10 17.5ZM3.33333 15.8333C3.1 15.8333 2.9 15.75 2.74167 15.5917C2.58333 15.4333 2.5 15.2333 2.5 15C2.5 14.7667 2.58333 14.5667 2.74167 14.4083C2.9 14.25 3.1 14.1667 3.33333 14.1667H6.66667C6.9 14.1667 7.1 14.25 7.25833 14.4083C7.41667 14.5667 7.5 14.7667 7.5 15C7.5 15.2333 7.41667 15.4333 7.25833 15.5917C7.1 15.75 6.9 15.8333 6.66667 15.8333H3.33333ZM6.66667 12.5C6.43333 12.5 6.23333 12.4167 6.075 12.2583C5.91667 12.1 5.83333 11.9 5.83333 11.6667V10.8333H3.33333C3.1 10.8333 2.9 10.75 2.74167 10.5917C2.58333 10.4333 2.5 10.2333 2.5 10C2.5 9.76667 2.58333 9.56667 2.74167 9.40833C2.9 9.25 3.1 9.16667 3.33333 9.16667H5.83333V8.33333C5.83333 8.1 5.91667 7.9 6.075 7.74167C6.23333 7.58333 6.43333 7.5 6.66667 7.5C6.9 7.5 7.1 7.58333 7.25833 7.74167C7.41667 7.9 7.5 8.1 7.5 8.33333V11.6667C7.5 11.9 7.41667 12.1 7.25833 12.2583C7.1 12.4167 6.9 12.5 6.66667 12.5ZM10 10.8333C9.76667 10.8333 9.56667 10.75 9.40833 10.5917C9.25 10.4333 9.16667 10.2333 9.16667 10C9.16667 9.76667 9.25 9.56667 9.40833 9.40833C9.56667 9.25 9.76667 9.16667 10 9.16667H16.6667C16.9 9.16667 17.1 9.25 17.2583 9.40833C17.4167 9.56667 17.5 9.76667 17.5 10C17.5 10.2333 17.4167 10.4333 17.2583 10.5917C17.1 10.75 16.9 10.8333 16.6667 10.8333H10ZM13.3333 7.5C13.1 7.5 12.9 7.41667 12.7417 7.25833C12.5833 7.1 12.5 6.9 12.5 6.66667V3.33333C12.5 3.1 12.5833 2.9 12.7417 2.74167C12.9 2.58333 13.1 2.5 13.3333 2.5C13.5667 2.5 13.7667 2.58333 13.925 2.74167C14.0833 2.9 14.1667 3.1 14.1667 3.33333V4.16667H16.6667C16.9 4.16667 17.1 4.25 17.2583 4.40833C17.4167 4.56667 17.5 4.76667 17.5 5C17.5 5.23333 17.4167 5.43333 17.2583 5.59167C17.1 5.75 16.9 5.83333 16.6667 5.83333H14.1667V6.66667C14.1667 6.9 14.0833 7.1 13.925 7.25833C13.7667 7.41667 13.5667 7.5 13.3333 7.5ZM3.33333 5.83333C3.1 5.83333 2.9 5.75 2.74167 5.59167C2.58333 5.43333 2.5 5.23333 2.5 5C2.5 4.76667 2.58333 4.56667 2.74167 4.40833C2.9 4.25 3.1 4.16667 3.33333 4.16667H10C10.2333 4.16667 10.4333 4.25 10.5917 4.40833C10.75 4.56667 10.8333 4.76667 10.8333 5C10.8333 5.23333 10.75 5.43333 10.5917 5.59167C10.4333 5.75 10.2333 5.83333 10 5.83333H3.33333Z" fill="var(--text)" />
                        </svg>
                      </button>
                    </div>
                    </>
                  ) : null}
                  {V.hasCustom ? (
                    <>
                    <div style={{position: "relative", display: "flex", gap: "8px", alignItems: "flex-start", justifyContent: "center", width: "380px", flexShrink: "0"}}>
                      <button className="ps2" type="button" onClick={V.openMainCalendar} style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", height: "36px", alignItems: "center", justifyContent: "center", padding: "2px 12px", boxSizing: "border-box", border: "none", borderRadius: "20px", background: "var(--ctrl)", cursor: "pointer", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                        <span style={{fontSize: "16px", lineHeight: "22px", fontWeight: "500", letterSpacing: "0px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                          {V.customLabel}
                        </span>
                      </button>
                      <button type="button" onClick={V.clearCustom} aria-label="Скинути період" style={{position: "relative", width: "36px", height: "36px", flexShrink: "0", border: "none", borderRadius: "100px", background: "var(--ctrl)", cursor: "pointer", WebkitTapHighlightColor: "transparent"}}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
                          <path d="M5 5l10 10M15 5L5 15" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                    </>
                  ) : null}
                </div>
                <div style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "8px", width: "380px", flexShrink: "0"}}>
                  <div style={{display: "flex", alignItems: "center", padding: "0 8px", flexShrink: "0"}}>
                    <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", color: "var(--text)", whiteSpace: "nowrap"}}>
                      {V.listTitle}
                    </p>
                  </div>
                  <div style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "0", width: "100%", padding: "8px 0", boxSizing: "border-box", overflow: "hidden", borderRadius: "12px", background: "var(--surface)", flexShrink: "0", animationName: V.listAnim, animationDuration: V.listDur, animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationDelay: V.listDelay, animationFillMode: "both"}}>
                    {V.hasSegment ? (
                      <>
                      <div style={{width: "100%"}}>
                        {(V.transactions || []).map((tx, $index) => (
                          <React.Fragment key={(tx && tx.key) ?? $index}>
                          <div style={{position: "relative", display: "flex", gap: "16px", alignItems: "center", padding: "8px 16px", boxSizing: "border-box", width: "100%", flexShrink: "0"}}>
                            <div style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", flexShrink: "0", borderRadius: "100px", background: tx.logoBg}}>
                              <span style={{display: "block", fontSize: "18px", lineHeight: "18px", fontWeight: "600", letterSpacing: "0px", textAlign: "center", color: tx.logoColor}}>
                                {tx.logo}
                              </span>
                            </div>
                            <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", gap: "16px", alignItems: "center"}}>
                              <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", alignItems: "flex-start"}}>
                                <p style={{margin: "0", height: "24px", fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", color: "var(--text)", whiteSpace: "nowrap"}}>
                                  {tx.name}
                                </p>
                                <p style={{margin: "0", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text2)", whiteSpace: "nowrap"}}>
                                  {tx.date}
                                </p>
                              </div>
                              <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", textAlign: "right", whiteSpace: "nowrap"}}>
                                {tx.amount}
                              </p>
                            </div>
                          </div>
                          </React.Fragment>
                        ))}
                      </div>
                      </>
                    ) : null}
                    {V.showCategoryList ? (
                      <>
                      <div style={{width: "100%"}}>
                        {V.isExpenses ? (
                          <>
                          {(V.categories || []).map((c, $index) => (
                            <React.Fragment key={(c && c.key) ?? $index}>
                            <div onClick={c.open} style={{position: "relative", display: "flex", gap: "16px", alignItems: "center", padding: "8px 16px", boxSizing: "border-box", width: "100%", flexShrink: "0", cursor: "pointer"}}>
                              <div role="img" style={{display: "block", width: "40px", height: "40px", flexShrink: "0", borderRadius: "100px", backgroundImage: c.iconBg, backgroundSize: "cover", backgroundRepeat: "no-repeat"}} />
                              <div style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", gap: "8px", alignItems: "flex-start"}}>
                                <div style={{display: "flex", gap: "16px", alignItems: "center", width: "100%", flexShrink: "0"}}>
                                  <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", alignItems: "flex-start"}}>
                                    <p style={{margin: "0", width: "100%", height: "24px", fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                      {c.name}
                                    </p>
                                    <div style={{display: "flex", flexWrap: "wrap", gap: "2px", alignItems: "flex-start", width: "100%"}}>
                                      <p style={{margin: "0", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text2)", whiteSpace: "nowrap"}}>
                                        {c.count}
                                      </p>
                                    </div>
                                  </div>
                                  <div style={{display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: "0"}}>
                                    <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", textAlign: "right", whiteSpace: "nowrap"}}>
                                      {c.amount}
                                    </p>
                                    <p style={{margin: "0", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text2)", whiteSpace: "nowrap"}}>
                                      {c.pct}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            </React.Fragment>
                          ))}
                          </>
                        ) : null}
                        {V.isIncome ? (
                          <>
                          {(V.incomeRows || []).map((c, $index) => (
                            <React.Fragment key={(c && c.key) ?? $index}>
                            <div onClick={c.open} style={{position: "relative", display: "flex", gap: "16px", alignItems: "center", padding: "8px 16px", boxSizing: "border-box", width: "100%", flexShrink: "0", cursor: "pointer"}}>
                              <div role="img" style={{display: "block", width: "40px", height: "40px", flexShrink: "0", borderRadius: "100px", backgroundImage: c.iconBg, backgroundSize: "cover", backgroundRepeat: "no-repeat"}} />
                              <div style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", gap: "8px", alignItems: "flex-start"}}>
                                <div style={{display: "flex", gap: "16px", alignItems: "center", width: "100%", flexShrink: "0"}}>
                                  <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", alignItems: "flex-start"}}>
                                    <p style={{margin: "0", width: "100%", height: "24px", fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                      {c.name}
                                    </p>
                                    <div style={{display: "flex", flexWrap: "wrap", gap: "2px", alignItems: "flex-start", width: "100%"}}>
                                      <p style={{margin: "0", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text2)", whiteSpace: "nowrap"}}>
                                        {c.count}
                                      </p>
                                    </div>
                                  </div>
                                  <div style={{display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: "0"}}>
                                    <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", textAlign: "right", whiteSpace: "nowrap"}}>
                                      {c.amount}
                                    </p>
                                    <p style={{margin: "0", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text2)", whiteSpace: "nowrap"}}>
                                      {c.pct}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            </React.Fragment>
                          ))}
                          </>
                        ) : null}
                      </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              {V.calOpen ? (
                <>
                <div data-screen-label="Період" style={{position: "absolute", inset: "0", zIndex: "90", display: "flex", flexDirection: "column", gap: "0", paddingTop: "100px", boxSizing: "border-box", background: "var(--bg)", animation: V.calAnim}}>
                  <div style={{flex: "1 1 auto", minHeight: "0", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", alignItems: "stretch", width: "100%", paddingBottom: "142px", boxSizing: "border-box", scrollbarWidth: "none"}}>
                    <div style={{position: "sticky", top: "0", zIndex: "10", display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "13px 16px 12px", boxSizing: "border-box", width: "100%", flexShrink: "0", background: "var(--surface)", borderBottom: "1px solid var(--div2)"}}>
                      {(V.calWeekdays || []).map((wd, $index) => (
                        <React.Fragment key={(wd && wd.key) ?? $index}>
                        <p style={{margin: "0", flex: "1 0 0", minWidth: "1px", fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", textAlign: "center", color: "var(--text2)", whiteSpace: "nowrap"}}>
                          {wd.label}
                        </p>
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{display: "flex", flexDirection: "column", gap: "16px", alignItems: "flex-start", width: "100%", padding: "16px", boxSizing: "border-box"}}>
                      {(V.calMonths || []).map((month, $index) => (
                        <React.Fragment key={(month && month.key) ?? $index}>
                        <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", flexShrink: "0"}}>
                          <p style={{margin: "0 0 4px", width: "100%", fontSize: "16px", lineHeight: "24px", fontWeight: "500", letterSpacing: "0px", textAlign: "right", color: "var(--text)"}}>
                            {month.label}
                          </p>
                          {(month.rows || []).map((row, $index) => (
                            <React.Fragment key={(row && row.key) ?? $index}>
                            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", width: "100%", flexShrink: "0"}}>
                              {(row.cells || []).map((cell, $index) => (
                                <React.Fragment key={(cell && cell.key) ?? $index}>
                                <div style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", height: "46px", alignItems: "center", justifyContent: "center"}}>
                                  {cell.isDay ? (
                                    <>
                                    <button className="ps3" type="button" onClick={cell.pick} style={{display: "flex", width: "46px", height: "46px", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "200px", cursor: cell.cursor, background: cell.bg, boxShadow: cell.shadow, transition: "background 180ms ease, box-shadow 180ms ease", WebkitTapHighlightColor: "transparent"}}>
                                      <span style={{fontSize: "16px", lineHeight: "24px", fontWeight: cell.weight, letterSpacing: "0px", color: cell.color, fontVariationSettings: `'wght' ${cell.weight}`}}>
                                        {cell.day}
                                      </span>
                                    </button>
                                    </>
                                  ) : null}
                                </div>
                                </React.Fragment>
                              ))}
                            </div>
                            </React.Fragment>
                          ))}
                        </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "6", width: "100%", padding: "12px 16px 0", boxSizing: "border-box", background: "var(--bgA)", backdropFilter: "blur(22px) saturate(120%)", WebkitBackdropFilter: "blur(22px) saturate(120%)", paddingTop: "8px"}}>
                    {V.calHasRange ? (
                      <>
                      <p style={{margin: "0 0 8px", width: "100%", fontSize: "16px", lineHeight: "28px", fontWeight: "500", letterSpacing: "0px", textAlign: "center", color: "var(--text)", whiteSpace: "nowrap", marginBottom: "10px"}}>
                        {V.calRangeText}
                      </p>
                      </>
                    ) : null}
                    <button className="ps1" type="button" onClick={V.applyCalendar} style={{display: "flex", height: "48px", width: "100%", alignItems: "center", justifyContent: "center", padding: "0 16px", border: "none", borderRadius: "8px", cursor: "pointer", background: "var(--accent)", paddingTop: "0px", marginTop: "0px", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                      <span style={{fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "#000000", whiteSpace: "nowrap"}}>
                        {"Обрати"}
                      </span>
                    </button>
                    <div style={{height: "34px"}}>
                      <div style={{position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)", width: "134px", height: "5px", borderRadius: "100px", background: "var(--text)"}} />
                    </div>
                  </div>
                </div>
                </>
              ) : null}
              {V.catOpen ? (
                <>
                <div data-screen-label="Категорія" style={{position: "absolute", inset: "0", zIndex: "85", display: "flex", flexDirection: "column", gap: "2px", paddingTop: "103px", boxSizing: "border-box", background: "var(--bg)", animation: V.catAnim}}>
                  <div onScroll={V.onScroll} style={{flex: "1 1 auto", minHeight: "0", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", width: "100%", padding: "8px 16px 50px", boxSizing: "border-box", scrollbarWidth: "none"}}>
                    <div style={{position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0", width: "380px", flexShrink: "0"}}>
                      <div style={{position: "relative", width: "380px", height: "334px", flexShrink: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: "8px"}}>
                        <div style={{position: "relative", height: "62px", width: "380px", flexShrink: "0"}}>
                          <div data-badge="cat" style={{position: "absolute", left: V.catBadgeLeft, transform: "translateX(-50%)", top: "4px", transition: V.catBadgeMove}}>
                            <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", padding: V.catBadgePadding, borderRadius: "8px", background: V.catBadgeBg, boxShadow: V.catBadgeShadow, letterSpacing: "0px", transition: "background 260ms ease, box-shadow 260ms ease, padding 380ms cubic-bezier(0.2, 0.7, 0.2, 1)"}}>
                              <p style={{margin: "0 0 -4px", display: "flex", fontSize: "28px", lineHeight: "36px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                {(V.catAmountChars || []).map((ch, $index) => (
                                  <React.Fragment key={(ch && ch.key) ?? $index}>
                                  <span style={{display: "inline-block", whiteSpace: "pre", animation: ch.anim}}>
                                    {ch.c}
                                  </span>
                                  </React.Fragment>
                                ))}
                              </p>
                              <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "400", color: "var(--text3)", whiteSpace: "nowrap", animation: V.catPeriodFade}}>
                                {V.catPeriod}
                              </p>
                            </div>
                          </div>
                          {V.catShowConnector ? (
                            <>
                            <div ref={V.catConnRef} style={{position: "absolute", top: "64px", height: V.catConnectorHeight, left: V.catConnectorLeft, width: "0", transition: "left 380ms cubic-bezier(0.2, 0.7, 0.2, 1), height 380ms cubic-bezier(0.2, 0.7, 0.2, 1)", borderLeft: "1.5px solid var(--div3)", transformOrigin: "top", animationName: V.catDrawAnim, animationDuration: "460ms", animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationFillMode: "backwards"}} />
                            </>
                          ) : null}
                        </div>
                        <div onPointerDown={V.catPagerDown} onPointerMove={V.catPagerMove} onPointerUp={V.catPagerUp} onPointerCancel={V.catPagerUp} onClick={V.catClearSelection} style={{position: "relative", height: "264px", width: "380px", flexShrink: "0", overflow: "hidden", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none"}}>
                          <div style={{position: "absolute", left: "0", right: "0", top: "50%", transform: "translateY(-50%)", height: "264px", zIndex: "0", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "0 43.797px 16px 0", boxSizing: "border-box"}}>
                            <div style={{height: "14px", display: "flex", alignItems: "center"}}>
                              <div style={{width: "100%", height: "0", borderTop: "0.5px solid var(--div)"}} />
                            </div>
                            <div style={{height: "14px", display: "flex", alignItems: "center"}}>
                              <div style={{width: "100%", height: "0", borderTop: "0.5px solid var(--div)"}} />
                            </div>
                            <div style={{height: "14px", display: "flex", alignItems: "center"}}>
                              <div style={{width: "100%", height: "0", borderTop: "0.5px solid var(--div)"}} />
                            </div>
                          </div>
                          <div style={{position: "absolute", left: "0", top: "0", bottom: "0", right: "44px", overflow: "hidden"}}>
                            <div ref={V.catTrackRef} style={{position: "absolute", inset: "0", willChange: "transform"}}>
                              {(V.catChartPages || []).map((pg, $index) => (
                                <React.Fragment key={(pg && pg.key) ?? $index}>
                                <div style={{position: "absolute", top: "0", bottom: "0", left: pg.offset, width: "380px"}}>
                                  <div style={{position: "absolute", inset: "0", padding: "0 40px 0 16px", boxSizing: "border-box"}}>
                                    <div style={{position: "absolute", inset: "0", display: "flex", alignItems: "center", padding: "0 43.797px 0 0", boxSizing: "border-box"}}>
                                      {(pg.bars || []).map((bar, $index) => (
                                        <React.Fragment key={(bar && bar.key) ?? $index}>
                                        <div data-bar="1" onClick={bar.select} style={{position: "relative", height: "100%", flex: "1 0 0", minWidth: "1px", cursor: "pointer"}}>
                                          <div style={{position: "absolute", top: "8px", bottom: "23px", left: "0", right: "0"}}>
                                            <div style={{position: "absolute", bottom: "0", left: "50%", transform: "translateX(-50%)", width: bar.w, height: bar.h, borderRadius: "999px", overflow: "hidden", background: bar.trackBg, transformOrigin: "bottom", animationName: bar.growAnim, animationDuration: "460ms", animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)", animationFillMode: "backwards", transition: "height 380ms cubic-bezier(0.2, 0.7, 0.2, 1)"}}>
                                              <div style={{position: "absolute", inset: "0", borderRadius: "999px", background: pg.activeFill, transformOrigin: "bottom", transition: "transform 300ms cubic-bezier(0.2, 0.7, 0.2, 1)", transform: `scaleY(${bar.scale})`}} />
                                            </div>
                                          </div>
                                          <p style={{position: "absolute", bottom: "6.76px", left: "0", right: "0", transform: "translateY(50%)", margin: "0", fontSize: "10px", lineHeight: "14px", fontWeight: bar.labelWeight, textAlign: "center", color: bar.labelColor}}>
                                            {bar.label}
                                          </p>
                                        </div>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                          <div style={{position: "absolute", right: "-2px", top: "-2px", bottom: "-2px", left: "334px", zIndex: "5", pointerEvents: "none", background: "var(--bg)"}} />
                          <div style={{position: "absolute", right: "0", width: "43.797px", top: "50%", transform: "translateY(-50%)", height: "264px", zIndex: "6", pointerEvents: "none", display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: "16px", boxSizing: "border-box"}}>
                            <p style={{margin: "0", width: "35.797px", alignSelf: "flex-end", fontSize: "10px", lineHeight: "14px", fontWeight: "400", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap"}}>
                              {V.catAxis2}
                            </p>
                            <p style={{margin: "0", width: "35.797px", alignSelf: "flex-end", fontSize: "10px", lineHeight: "14px", fontWeight: "400", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap"}}>
                              {V.catAxis1}
                            </p>
                            <p style={{margin: "0", width: "35.797px", alignSelf: "flex-end", fontSize: "10px", lineHeight: "14px", fontWeight: "400", textAlign: "right", color: "var(--text3)", whiteSpace: "nowrap"}}>
                              {V.catAxis0}
                            </p>
                          </div>
                          {V.catShowAverage ? (
                            <>
                            <div data-avg="1" style={{position: "absolute", left: "0", right: "43.797px", top: "8px", bottom: "23px", zIndex: "7", pointerEvents: "none", transition: "opacity 200ms ease"}}>
                              <div style={{position: "absolute", left: "0", right: "0", bottom: V.catAvgBottom, height: "0", borderTop: "1px dashed var(--text4)", transition: "bottom 380ms cubic-bezier(0.2, 0.7, 0.2, 1)"}}>
                                <div style={{position: "absolute", right: "-43.797px", top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", padding: "1px 0 1px 4px", borderRadius: "4px", background: "var(--bg)"}}>
                                  <p style={{margin: "0", fontSize: "10px", lineHeight: "14px", fontWeight: "500", color: "var(--text-hi)", whiteSpace: "nowrap"}}>
                                    {V.catAvgLabel}
                                  </p>
                                </div>
                              </div>
                            </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {V.catShowTabs ? (
                      <>
                      <div style={{position: "relative", display: "flex", gap: "8px", alignItems: "flex-start", justifyContent: "center", width: "380px", flexShrink: "0"}}>
                        <div style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", height: "36px", alignItems: "center", justifyContent: "center", padding: "2px", boxSizing: "border-box", borderRadius: "20px", background: "var(--ctrl)"}}>
                          <div style={{position: "absolute", top: "2px", bottom: "2px", left: "2px", width: "calc((100% - 4px) / 3)", borderRadius: "20px", background: "var(--thumb)", boxShadow: "0px 1px 1.5px var(--sh), 0px 1px 1px var(--sh)", transform: `translateX(${V.catPeriodPillX})`, transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)", pointerEvents: "none"}} />
                          <button className="ps0" type="button" onClick={V.catSelectPeriod0} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", height: "100%", alignItems: "center", justifyContent: "center", padding: "2px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                            <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.catPer0Color}}>
                              {"Тижні"}
                            </span>
                          </button>
                          <button className="ps0" type="button" onClick={V.catSelectPeriod1} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", height: "100%", alignItems: "center", justifyContent: "center", padding: "2px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                            <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.catPer1Color}}>
                              {"Місяці"}
                            </span>
                          </button>
                          <button className="ps0" type="button" onClick={V.catSelectPeriod2} style={{position: "relative", zIndex: "1", display: "flex", flex: "1 0 0", minWidth: "1px", height: "100%", alignItems: "center", justifyContent: "center", padding: "2px 8px", border: "none", borderRadius: "20px", cursor: "pointer", background: "transparent", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                            <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", whiteSpace: "nowrap", color: V.catPer2Color}}>
                              {"Роки"}
                            </span>
                          </button>
                        </div>
                        <button type="button" onClick={V.openCatCalendar} aria-label="Обрати період" style={{position: "relative", width: "36px", height: "36px", flexShrink: "0", border: "none", borderRadius: "100px", background: "var(--ctrl)", cursor: "pointer", WebkitTapHighlightColor: "transparent"}}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
                            <path d="M10 17.5C9.76667 17.5 9.56667 17.4167 9.40833 17.2583C9.25 17.1 9.16667 16.9 9.16667 16.6667V13.3333C9.16667 13.1 9.25 12.9 9.40833 12.7417C9.56667 12.5833 9.76667 12.5 10 12.5C10.2333 12.5 10.4333 12.5833 10.5917 12.7417C10.75 12.9 10.8333 13.1 10.8333 13.3333V14.1667H16.6667C16.9 14.1667 17.1 14.25 17.2583 14.4083C17.4167 14.5667 17.5 14.7667 17.5 15C17.5 15.2333 17.4167 15.4333 17.2583 15.5917C17.1 15.75 16.9 15.8333 16.6667 15.8333H10.8333V16.6667C10.8333 16.9 10.75 17.1 10.5917 17.2583C10.4333 17.4167 10.2333 17.5 10 17.5ZM3.33333 15.8333C3.1 15.8333 2.9 15.75 2.74167 15.5917C2.58333 15.4333 2.5 15.2333 2.5 15C2.5 14.7667 2.58333 14.5667 2.74167 14.4083C2.9 14.25 3.1 14.1667 3.33333 14.1667H6.66667C6.9 14.1667 7.1 14.25 7.25833 14.4083C7.41667 14.5667 7.5 14.7667 7.5 15C7.5 15.2333 7.41667 15.4333 7.25833 15.5917C7.1 15.75 6.9 15.8333 6.66667 15.8333H3.33333ZM6.66667 12.5C6.43333 12.5 6.23333 12.4167 6.075 12.2583C5.91667 12.1 5.83333 11.9 5.83333 11.6667V10.8333H3.33333C3.1 10.8333 2.9 10.75 2.74167 10.5917C2.58333 10.4333 2.5 10.2333 2.5 10C2.5 9.76667 2.58333 9.56667 2.74167 9.40833C2.9 9.25 3.1 9.16667 3.33333 9.16667H5.83333V8.33333C5.83333 8.1 5.91667 7.9 6.075 7.74167C6.23333 7.58333 6.43333 7.5 6.66667 7.5C6.9 7.5 7.1 7.58333 7.25833 7.74167C7.41667 7.9 7.5 8.1 7.5 8.33333V11.6667C7.5 11.9 7.41667 12.1 7.25833 12.2583C7.1 12.4167 6.9 12.5 6.66667 12.5ZM10 10.8333C9.76667 10.8333 9.56667 10.75 9.40833 10.5917C9.25 10.4333 9.16667 10.2333 9.16667 10C9.16667 9.76667 9.25 9.56667 9.40833 9.40833C9.56667 9.25 9.76667 9.16667 10 9.16667H16.6667C16.9 9.16667 17.1 9.25 17.2583 9.40833C17.4167 9.56667 17.5 9.76667 17.5 10C17.5 10.2333 17.4167 10.4333 17.2583 10.5917C17.1 10.75 16.9 10.8333 16.6667 10.8333H10ZM13.3333 7.5C13.1 7.5 12.9 7.41667 12.7417 7.25833C12.5833 7.1 12.5 6.9 12.5 6.66667V3.33333C12.5 3.1 12.5833 2.9 12.7417 2.74167C12.9 2.58333 13.1 2.5 13.3333 2.5C13.5667 2.5 13.7667 2.58333 13.925 2.74167C14.0833 2.9 14.1667 3.1 14.1667 3.33333V4.16667H16.6667C16.9 4.16667 17.1 4.25 17.2583 4.40833C17.4167 4.56667 17.5 4.76667 17.5 5C17.5 5.23333 17.4167 5.43333 17.2583 5.59167C17.1 5.75 16.9 5.83333 16.6667 5.83333H14.1667V6.66667C14.1667 6.9 14.0833 7.1 13.925 7.25833C13.7667 7.41667 13.5667 7.5 13.3333 7.5ZM3.33333 5.83333C3.1 5.83333 2.9 5.75 2.74167 5.59167C2.58333 5.43333 2.5 5.23333 2.5 5C2.5 4.76667 2.58333 4.56667 2.74167 4.40833C2.9 4.25 3.1 4.16667 3.33333 4.16667H10C10.2333 4.16667 10.4333 4.25 10.5917 4.40833C10.75 4.56667 10.8333 4.76667 10.8333 5C10.8333 5.23333 10.75 5.43333 10.5917 5.59167C10.4333 5.75 10.2333 5.83333 10 5.83333H3.33333Z" fill="var(--text)" />
                          </svg>
                        </button>
                      </div>
                      </>
                    ) : null}
                    {V.catHasCustom ? (
                      <>
                      <div style={{position: "relative", display: "flex", gap: "8px", alignItems: "flex-start", justifyContent: "center", width: "380px", flexShrink: "0"}}>
                        <button className="ps2" type="button" onClick={V.openCatCalendar} style={{position: "relative", display: "flex", flex: "1 0 0", minWidth: "1px", height: "36px", alignItems: "center", justifyContent: "center", padding: "2px 12px", boxSizing: "border-box", border: "none", borderRadius: "20px", background: "var(--ctrl)", cursor: "pointer", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                          <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                            {V.catCustomLabel}
                          </span>
                        </button>
                        <button type="button" onClick={V.clearCatCustom} aria-label="Скинути період" style={{position: "relative", width: "36px", height: "36px", flexShrink: "0", border: "none", borderRadius: "100px", background: "var(--ctrl)", cursor: "pointer", WebkitTapHighlightColor: "transparent"}}>
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)"}}>
                            <path d="M5 5l10 10M15 5L5 15" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      </>
                    ) : null}
                    <div style={{display: "flex", flexDirection: "column", gap: "24px", alignItems: "flex-start", width: "380px", flexShrink: "0"}}>
                      {(V.catGroups || []).map((group, $index) => (
                        <React.Fragment key={(group && group.key) ?? $index}>
                        <div style={{display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", width: "100%", flexShrink: "0"}}>
                          <p style={{margin: "0", width: "100%", fontSize: "14px", lineHeight: "22px", fontWeight: "600", letterSpacing: "0px", color: "var(--text3)"}}>
                            {group.date}
                          </p>
                          <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", padding: "0 16px", boxSizing: "border-box", borderRadius: "8px", background: "var(--surface)"}}>
                            {(group.items || []).map((tx, $index) => (
                              <React.Fragment key={(tx && tx.key) ?? $index}>
                              <div style={{display: "flex", gap: "16px", alignItems: "center", width: "100%", padding: "12px 0", boxSizing: "border-box", flexShrink: "0"}}>
                                <div style={{display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", flexShrink: "0", borderRadius: "100px", background: tx.logoBg}}>
                                  <span style={{display: "block", fontSize: "18px", lineHeight: "18px", fontWeight: "600", letterSpacing: "0px", textAlign: "center", color: "#ffffff"}}>
                                    {tx.logo}
                                  </span>
                                </div>
                                <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", alignItems: "flex-start"}}>
                                  <p style={{margin: "0", width: "100%", fontSize: "16px", lineHeight: "24px", fontWeight: "600", letterSpacing: "0px", color: "var(--text)"}}>
                                    {tx.name}
                                  </p>
                                  <p style={{margin: "0", width: "100%", fontSize: "12px", lineHeight: "16px", fontWeight: "400", color: "var(--text3)"}}>
                                    {tx.time}
                                  </p>
                                </div>
                                <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", textAlign: "right", whiteSpace: "nowrap"}}>
                                  {tx.amount}
                                </p>
                              </div>
                              {tx.divider ? (
                                <>
                                <div style={{width: "100%", height: "1px", background: "var(--div4)"}} />
                                </>
                              ) : null}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "34px", background: "linear-gradient(180deg, var(--bgA0) 0%, var(--bgA94) 60%)", pointerEvents: "none"}}>
                    <div style={{position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)", width: "134px", height: "5px", borderRadius: "100px", background: "var(--text)"}} />
                  </div>
                </div>
                </>
              ) : null}
              {V.pickerOpen ? (
                <>
                <div style={{position: "absolute", inset: "0", zIndex: "80", display: "flex", flexDirection: "column", gap: "2px", paddingTop: "103px", boxSizing: "border-box", background: "var(--bg)", animation: V.pickAnim}}>
                  <div onScroll={V.onScroll} style={{flex: "1 1 auto", minHeight: "0", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: "12px 16px 122px", boxSizing: "border-box", scrollbarWidth: "none"}}>
                    <div style={{display: "flex", flexDirection: "column", gap: "16px", alignItems: "flex-start", width: "100%", padding: "16px 0", boxSizing: "border-box", borderRadius: "8px", background: "var(--surface)"}}>
                      <div style={{display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start", width: "100%", padding: "0 16px", boxSizing: "border-box"}}>
                        <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                          {"Валюта"}
                        </p>
                        <div style={{display: "flex", gap: "8px", alignItems: "flex-start", width: "100%"}}>
                          {(V.currencyChips || []).map((chip, $index) => (
                            <React.Fragment key={(chip && chip.key) ?? $index}>
                            <button className="ps4" type="button" onClick={chip.select} style={{display: "flex", gap: "4px", height: "32px", alignItems: "center", padding: "4px 8px", borderRadius: "8px", cursor: "pointer", background: chip.bg, border: chip.border, transition: "background 160ms ease, border-color 160ms ease", WebkitTapHighlightColor: "transparent"}}>
                              <span style={{fontSize: "14px", lineHeight: "22px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                {chip.code}
                              </span>
                            </button>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", padding: "0 16px", boxSizing: "border-box"}}>
                        <div style={{display: "flex", flexDirection: "column", gap: "16px", alignItems: "flex-start", width: "100%"}}>
                          <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%"}}>
                            <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                              {"Картки"}
                            </p>
                            <button className="ps2" type="button" onClick={V.toggleAllCards} aria-label="Обрати всі: Картки" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", flexShrink: "0", borderRadius: "3px", cursor: "pointer", background: V.cardsBoxBg, border: V.cardsBoxBorder, transition: "background 160ms ease, border-color 160ms ease", WebkitTapHighlightColor: "transparent"}}>
                              {V.cardsAllChecked ? (
                                <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{display: "block", overflow: "visible"}}>
                                  <path d="M2.4 8.6L6.2 12.4L13.6 4.2" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" style={{animation: "tickDraw 320ms cubic-bezier(0.32, 0.72, 0, 1) both"}} />
                                </svg>
                                </>
                              ) : null}
                            </button>
                          </div>
                          <div style={{height: "1px", width: "100%", background: "var(--div)"}} />
                        </div>
                        <div style={{height: "4px", width: "100%", flexShrink: "0"}} />
                        {(V.pickCards || []).map((row, $index) => (
                          <React.Fragment key={(row && row.key) ?? $index}>
                          <div style={{display: "flex", gap: "16px", alignItems: "flex-start", width: "100%", padding: "12px 0", boxSizing: "border-box"}}>
                            <div style={{width: "60px", height: "72px", flexShrink: "0", backgroundImage: row.artUrl, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat"}} />
                            <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", gap: "8px", alignItems: "flex-start"}}>
                              <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", gap: "2px", alignItems: "flex-start"}}>
                                <div style={{display: "flex", alignItems: "center", gap: "12px", width: "100%"}}>
                                  <img alt="" src="/assets/mastercard.svg" style={{display: "block", width: "28px", height: "24px", flexShrink: "0"}} />
                                  <p style={{margin: "0", flex: "1 0 0", minWidth: "1px", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)"}}>
                                    {row.name}
                                  </p>
                                </div>
                                <p style={{margin: "0", height: "24px", display: "flex", alignItems: "center", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text)", overflow: "hidden"}}>
                                  {row.masked}
                                </p>
                                <div style={{display: "flex", gap: "4px", alignItems: "flex-end", width: "100%"}}>
                                  <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                    {row.amount}
                                  </p>
                                  <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                    {row.currency}
                                  </p>
                                </div>
                              </div>
                              <button className="ps2" type="button" onClick={row.toggle} aria-label={row.name} style={{display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", flexShrink: "0", borderRadius: "3px", cursor: "pointer", background: row.boxBg, border: row.boxBorder, transition: "background 160ms ease, border-color 160ms ease", WebkitTapHighlightColor: "transparent"}}>
                                {row.checked ? (
                                  <>
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{display: "block", overflow: "visible"}}>
                                    <path d="M2.4 8.6L6.2 12.4L13.6 4.2" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" style={{animation: "tickDraw 320ms cubic-bezier(0.32, 0.72, 0, 1) both"}} />
                                  </svg>
                                  </>
                                ) : null}
                              </button>
                            </div>
                          </div>
                          {row.divider ? (
                            <>
                            <div style={{width: "100%", paddingLeft: "76px", boxSizing: "border-box"}}>
                              <div style={{height: "1px", background: "var(--div)"}} />
                            </div>
                            </>
                          ) : null}
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", padding: "0 16px", boxSizing: "border-box"}}>
                        <div style={{display: "flex", flexDirection: "column", gap: "16px", alignItems: "flex-start", width: "100%"}}>
                          <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%"}}>
                            <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                              {"Конверти"}
                            </p>
                            <button className="ps2" type="button" onClick={V.toggleAllEnvelopes} aria-label="Обрати всі: Конверти" style={{display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", flexShrink: "0", borderRadius: "3px", cursor: "pointer", background: V.envsBoxBg, border: V.envsBoxBorder, transition: "background 160ms ease, border-color 160ms ease", WebkitTapHighlightColor: "transparent"}}>
                              {V.envsAllChecked ? (
                                <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{display: "block", overflow: "visible"}}>
                                  <path d="M2.4 8.6L6.2 12.4L13.6 4.2" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" style={{animation: "tickDraw 320ms cubic-bezier(0.32, 0.72, 0, 1) both"}} />
                                </svg>
                                </>
                              ) : null}
                            </button>
                          </div>
                          <div style={{height: "1px", width: "100%", background: "var(--div)"}} />
                        </div>
                        <div style={{height: "4px", width: "100%", flexShrink: "0"}} />
                        {(V.pickEnvelopes || []).map((row, $index) => (
                          <React.Fragment key={(row && row.key) ?? $index}>
                          <div style={{display: "flex", gap: "16px", alignItems: "flex-start", width: "100%", padding: "12px 0", boxSizing: "border-box"}}>
                            <div style={{width: "60px", height: "72px", flexShrink: "0", backgroundImage: row.artUrl, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat"}} />
                            <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", gap: "8px", alignItems: "flex-start"}}>
                              <div style={{display: "flex", flex: "1 0 0", minWidth: "1px", flexDirection: "column", gap: "2px", alignItems: "flex-start"}}>
                                <div style={{display: "flex", alignItems: "center", gap: "12px", width: "100%"}}>
                                  <img alt="" src="/assets/mastercard.svg" style={{display: "block", width: "28px", height: "24px", flexShrink: "0"}} />
                                  <p style={{margin: "0", flex: "1 0 0", minWidth: "1px", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)"}}>
                                    {row.name}
                                  </p>
                                </div>
                                <p style={{margin: "0", height: "24px", display: "flex", alignItems: "center", fontSize: "14px", lineHeight: "22px", fontWeight: "400", color: "var(--text)", overflow: "hidden"}}>
                                  {row.masked}
                                </p>
                                <div style={{display: "flex", gap: "4px", alignItems: "flex-end", width: "100%"}}>
                                  <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                    {row.amount}
                                  </p>
                                  <p style={{margin: "0", fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "var(--text)", whiteSpace: "nowrap"}}>
                                    {row.currency}
                                  </p>
                                </div>
                              </div>
                              <button className="ps2" type="button" onClick={row.toggle} aria-label={row.name} style={{display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", flexShrink: "0", borderRadius: "3px", cursor: "pointer", background: row.boxBg, border: row.boxBorder, transition: "background 160ms ease, border-color 160ms ease", WebkitTapHighlightColor: "transparent"}}>
                                {row.checked ? (
                                  <>
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{display: "block", overflow: "visible"}}>
                                    <path d="M2.4 8.6L6.2 12.4L13.6 4.2" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" style={{animation: "tickDraw 320ms cubic-bezier(0.32, 0.72, 0, 1) both"}} />
                                  </svg>
                                  </>
                                ) : null}
                              </button>
                            </div>
                          </div>
                          {row.divider ? (
                            <>
                            <div style={{width: "100%", paddingLeft: "76px", boxSizing: "border-box"}}>
                              <div style={{height: "1px", background: "var(--div)"}} />
                            </div>
                            </>
                          ) : null}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "6", width: "100%", padding: "24px 16px 0", boxSizing: "border-box", background: "var(--bgA)", backdropFilter: "blur(22px) saturate(120%)", WebkitBackdropFilter: "blur(22px) saturate(120%)"}}>
                    <button className="ps1" type="button" onClick={V.savePicker} disabled={V.saveDisabled} style={{display: "flex", height: "48px", width: "100%", alignItems: "center", justifyContent: "center", padding: "0 16px", border: "none", borderRadius: "8px", cursor: V.saveCursor, background: "var(--accent)", opacity: V.saveOpacity, transition: "opacity 160ms ease", WebkitTapHighlightColor: "transparent"}}>
                      <span style={{fontSize: "16px", lineHeight: "24px", fontWeight: "600", color: "#000000", whiteSpace: "nowrap"}}>
                        {"Застосувати"}
                      </span>
                    </button>
                    <div style={{height: "34px"}}>
                      <div style={{position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)", width: "134px", height: "5px", borderRadius: "100px", background: "var(--text)"}} />
                    </div>
                  </div>
                </div>
                </>
              ) : null}
              <div style={{position: "absolute", left: "0", right: "0", top: "0", zIndex: "100", height: "101px", pointerEvents: "none"}}>
                <div style={{position: "absolute", left: "-1px", right: "-1px", top: "-1px", bottom: "0", backdropFilter: "blur(22px) saturate(120%)", WebkitBackdropFilter: "blur(22px) saturate(120%)", WebkitBackdropFilter: "blur(22px) saturate(120%)", opacity: V.topBarOpacity, transition: "opacity 220ms linear", willChange: "opacity", transform: "translateZ(0)", backgroundColor: "#0E0E10E0"}} />
                <div style={{position: "relative"}}>
                  <StatusBar />
                </div>
                <div style={{position: "relative", display: "flex", alignItems: "center", padding: "2px", width: "100%", height: "48px", boxSizing: "border-box", pointerEvents: "auto"}}>
                  <div style={{position: "relative", display: "flex", alignItems: "center", flexShrink: "0", marginLeft: "4px"}}>
                    <button className="ps2" type="button" onClick={V.navBack} aria-label="Back" style={{display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", border: "none", background: "transparent", borderRadius: "100px", cursor: "pointer", transition: "transform 140ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 140ms ease, background 140ms ease", WebkitTapHighlightColor: "transparent"}}>
                      <span style={{position: "relative", display: "block", width: "24px", height: "24px"}}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-hi)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position: "absolute", inset: "0"}}>
                          <path d="M20 12H5" />
                          <path d="M11 5l-7 7 7 7" />
                        </svg>
                      </span>
                    </button>
                  </div>
                  <p style={{position: "absolute", left: "12.56%", right: "12.49%", top: "50%", transform: "translateY(-50%)", margin: "0", fontSize: "20px", lineHeight: "28px", fontWeight: "600", letterSpacing: "0px", textAlign: "center", color: "var(--text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default", userSelect: "none", WebkitUserSelect: "none"}} onClick={V.toggleTheme}>
                    {V.navTitle}
                  </p>
                </div>
              </div>
              {V.showHomeIndicator ? (
                <>
                <div style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "34px", zIndex: "110", background: "transparent", pointerEvents: "none"}}>
                  <div style={{position: "absolute", bottom: "8px", left: "calc(50% + 0.5px)", transform: "translateX(-50%)", width: "134px", height: "5px", borderRadius: "100px", background: "var(--text)"}} />
                </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );
  }
}

AnalyticsScreen.defaultProps = {
  "showDeviceFrame": true,
  "accentColor": "var(--accent)",
  "barColor": "#f4470b",
  "showConnectorLine": true,
  "showHomeIndicator": true
};

export default AnalyticsScreen;
