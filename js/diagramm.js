/*
 * Kapitalverlauf als SVG-Diagramm (ohne externe Bibliotheken).
 *  - Fläche: Kapital (Stand jeweils zu Jahresbeginn bzw. am Ende)
 *  - gestrichelte Linie: Summe der eigenen Einzahlungen (inkl. Anfangskapital)
 *  - Linie: Summe der Auszahlungen (inkl. Teilauszahlung)
 *  - Hintergrundbänder für Ruhe- und Auszahlphase, Markierung bei Auszahlbeginn
 *  - Fadenkreuz mit Tooltip (Maus, Touch, Pfeiltasten)
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const fmtEuro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtKurz = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

  const SERIEN = [
    { key: 'kapital', name: 'Kapital', farbe: '--series-kapital', art: 'flaeche' },
    { key: 'ein', name: 'Summe Einzahlungen', farbe: '--series-ein', art: 'linie', gestrichelt: true },
    { key: 'aus', name: 'Summe Auszahlungen', farbe: '--series-aus', art: 'linie' },
  ];

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  function euroKurz(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return `${fmtKurz.format(v / 1e6)} Mio €`;
    if (a >= 1e3) return `${fmtKurz.format(v / 1e3)} T€`;
    return `${fmtKurz.format(v)} €`;
  }

  function schoeneSchritte(max, anzahl) {
    if (!(max > 0)) return { max: 1, schritt: 1 };
    const roh = max / anzahl;
    const pot = Math.pow(10, Math.floor(Math.log10(roh)));
    const n = roh / pot;
    const schritt = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
    return { max: Math.ceil(max / schritt) * schritt, schritt };
  }

  function aufbereiten(erg) {
    const p = erg.params;
    const rows = erg.rows;
    const punkte = [];
    let ein = p.anfangskapital;
    let aus = 0;
    punkte.push({
      alter: p.alterHeute, jahr: p.startJahr, kapital: rows.length ? rows[0].kapitalAnfang : p.anfangskapital,
      ein, aus, phase: rows.length ? rows[0].phase : 'anspar',
    });
    for (const r of rows) {
      if (r.einmalzahlung > 0) {
        // Teilauszahlung als senkrechten Sprung zu Beginn der Auszahlphase darstellen
        aus += r.einmalzahlung;
        punkte.push({
          alter: r.alter, jahr: r.jahr, kapital: r.kapitalAnfang - r.einmalzahlung,
          ein, aus, phase: r.phase, nachTeilauszahlung: true,
        });
        aus -= r.einmalzahlung;
      }
      ein += r.einzahlung;
      aus += r.einmalzahlung + r.auszahlung;
      punkte.push({ alter: r.alter + 1, jahr: r.jahr + 1, kapital: r.kapitalEnde, ein, aus, phase: r.phase });
    }
    return {
      punkte,
      sparEnde: p.sparEndeAlter,
      auszahlBeginn: p.auszahlBeginnAlter,
      kapitalAuszahlbeginn: erg.anspar.kapitalAuszahlbeginn,
    };
  }

  function Diagramm(container, legende) {
    this.container = container;
    this.legende = legende;
    this.daten = null;
    this.idx = null;
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.hidden = true;
    container.appendChild(this.tooltip);
    this.baueLegende();
    let breite = 0;
    const ro = new ResizeObserver(() => {
      if (container.clientWidth !== breite) {
        breite = container.clientWidth;
        this.render();
      }
    });
    ro.observe(container);
  }

  Diagramm.prototype.baueLegende = function () {
    if (!this.legende) return;
    this.legende.textContent = '';
    for (const s of SERIEN) {
      const li = document.createElement('li');
      const key = document.createElement('span');
      if (s.art === 'flaeche') {
        key.className = 'schluessel-flaeche';
        key.style.background = `var(${s.farbe})`;
      } else {
        key.className = 'schluessel-linie' + (s.gestrichelt ? ' gestrichelt' : '');
        key.style.borderTopColor = `var(${s.farbe})`;
      }
      li.appendChild(key);
      li.appendChild(document.createTextNode(s.name));
      this.legende.appendChild(li);
    }
    const li = document.createElement('li');
    const band = document.createElement('span');
    band.className = 'schluessel-band';
    band.style.background = 'var(--band-entnahme)';
    li.appendChild(band);
    li.appendChild(document.createTextNode('Auszahlphase'));
    this.legende.appendChild(li);
  };

  Diagramm.prototype.setze = function (ergebnis) {
    this.daten = ergebnis && !ergebnis.fehler && ergebnis.rows.length ? aufbereiten(ergebnis) : null;
    this.render();
  };

  Diagramm.prototype.render = function () {
    const c = this.container;
    if (this.svg) this.svg.remove();
    this.tooltip.hidden = true;
    const d = this.daten;
    if (!d) {
      c.classList.add('leer');
      return;
    }
    c.classList.remove('leer');

    const W = Math.max(c.clientWidth, 280);
    const H = Math.round(Math.min(440, Math.max(280, W * 0.42)));
    const schmal = W < 520;
    const m = { l: schmal ? 52 : 68, r: 16, t: 28, b: 34 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const P = d.punkte;
    const x0 = P[0].alter;
    const x1 = P[P.length - 1].alter;
    const yMaxRoh = Math.max(...P.map((p) => Math.max(p.kapital, p.ein, p.aus)));
    const { max: yMax, schritt } = schoeneSchritte(yMaxRoh, schmal ? 4 : 5);
    const sx = (a) => m.l + (x1 === x0 ? iw / 2 : ((a - x0) / (x1 - x0)) * iw);
    const sy = (v) => m.t + ih - (Math.max(v, 0) / yMax) * ih;
    this.sx = sx;

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, tabindex: '0', role: 'img',
      'aria-label': 'Kapitalverlauf über die Jahre. Pfeiltasten zeigen die Werte einzelner Jahre.',
    });
    this.svg = svg;

    // Phasenbänder
    const bandY = m.t;
    if (d.auszahlBeginn > d.sparEnde) {
      el('rect', { x: sx(d.sparEnde), y: bandY, width: sx(d.auszahlBeginn) - sx(d.sparEnde), height: ih, fill: 'var(--band-ruhe)' }, svg);
    }
    el('rect', { x: sx(d.auszahlBeginn), y: bandY, width: sx(x1) - sx(d.auszahlBeginn), height: ih, fill: 'var(--band-entnahme)' }, svg);
    const bandLabel = (text, a, b) => {
      if (sx(b) - sx(a) < text.length * 7 + 12) return;
      const t = el('text', { x: sx(a) + 8, y: m.t - 10, class: 'band-label' }, svg);
      t.textContent = text;
    };
    bandLabel('Ansparphase', x0, d.sparEnde);
    if (d.auszahlBeginn > d.sparEnde) bandLabel('Ruhe', d.sparEnde, d.auszahlBeginn);
    bandLabel('Auszahlphase', d.auszahlBeginn, x1);

    // Gitter + y-Achse
    const gitter = el('g', { class: 'gitter' }, svg);
    const achseY = el('g', { class: 'achse' }, svg);
    for (let v = 0; v <= yMax + 1e-9; v += schritt) {
      const y = sy(v);
      if (v > 0) el('line', { x1: m.l, x2: m.l + iw, y1: y, y2: y }, gitter);
      const t = el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end' }, achseY);
      t.textContent = euroKurz(v);
    }
    el('line', { x1: m.l, x2: m.l + iw, y1: sy(0), y2: sy(0), class: 'nulllinie' }, svg);

    // x-Achse (Alter)
    const achseX = el('g', { class: 'achse' }, svg);
    const spanne = x1 - x0;
    const xSchritt = spanne <= 12 ? 1 : spanne <= 30 ? (schmal ? 5 : 2) : spanne <= 60 ? 5 : 10;
    for (let a = Math.ceil(x0 / xSchritt) * xSchritt; a <= x1; a += xSchritt) {
      const t = el('text', { x: sx(a), y: m.t + ih + 20, 'text-anchor': 'middle' }, achseX);
      t.textContent = String(a);
    }
    const tAlter = el('text', { x: m.l + iw, y: H - 1, 'text-anchor': 'end', class: 'beschriftung' }, svg);
    tAlter.textContent = 'Alter';

    // Kapital-Fläche
    const linie = (key, von = 0) => P.slice(von).map((p, i) => `${i ? 'L' : 'M'}${sx(p.alter).toFixed(1)},${sy(p[key]).toFixed(1)}`).join('');
    const flaeche = `${linie('kapital')}L${sx(x1).toFixed(1)},${sy(0)}L${sx(x0).toFixed(1)},${sy(0)}Z`;
    el('path', { d: flaeche, fill: 'var(--series-kapital)', 'fill-opacity': '0.16' }, svg);
    el('path', { d: linie('kapital'), fill: 'none', stroke: 'var(--series-kapital)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);

    // Summe Einzahlungen
    el('path', {
      d: linie('ein'), fill: 'none', stroke: 'var(--series-ein)', 'stroke-width': 2,
      'stroke-dasharray': '6 4', 'stroke-linejoin': 'round',
    }, svg);

    // Summe Auszahlungen (ab Auszahlbeginn)
    const iStart = P.findIndex((p) => p.alter >= d.auszahlBeginn);
    if (iStart >= 0 && iStart < P.length - 1) {
      el('path', { d: linie('aus', iStart), fill: 'none', stroke: 'var(--series-aus)', 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    }

    // Markierung Auszahlbeginn mit Direktbeschriftung
    const xa = sx(d.auszahlBeginn);
    el('line', { x1: xa, x2: xa, y1: m.t, y2: m.t + ih, class: 'markierung' }, svg);
    const ya = sy(d.kapitalAuszahlbeginn);
    el('circle', { cx: xa, cy: ya, r: 5, fill: 'var(--series-kapital)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    const links = xa - m.l > 150 || xa > m.l + iw - 150;
    const lbl = el('text', {
      x: links ? xa - 10 : xa + 10, y: Math.max(ya - 10, m.t + 14),
      'text-anchor': links ? 'end' : 'start', class: 'direkt-label',
    }, svg);
    lbl.textContent = fmtEuro.format(d.kapitalAuszahlbeginn);

    // Interaktion
    const hover = el('g', { visibility: 'hidden' }, svg);
    el('line', { y1: m.t, y2: m.t + ih, class: 'fadenkreuz' }, hover);
    const punkte = SERIEN.map((s) => el('circle', { r: 4.5, fill: `var(${s.farbe})`, stroke: 'var(--surface)', 'stroke-width': 2 }, hover));
    const treffer = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' }, svg);

    const zeige = (i) => {
      i = Math.max(0, Math.min(P.length - 1, i));
      this.idx = i;
      const p = P[i];
      const x = sx(p.alter);
      hover.setAttribute('visibility', 'visible');
      hover.firstChild.setAttribute('x1', x);
      hover.firstChild.setAttribute('x2', x);
      SERIEN.forEach((s, k) => {
        const sichtbar = s.key !== 'aus' || p.alter >= d.auszahlBeginn;
        punkte[k].setAttribute('visibility', sichtbar ? 'visible' : 'hidden');
        punkte[k].setAttribute('cx', x);
        punkte[k].setAttribute('cy', sy(p[s.key]));
      });
      this.fuelleTooltip(p, i === P.length - 1);
      // Tooltip neben das Fadenkreuz auf die freie Seite legen
      const tw = this.tooltip.offsetWidth || 200;
      const wunsch = x > m.l + iw / 2 ? x - tw / 2 - 16 : x + tw / 2 + 16;
      this.tooltip.style.left = `${Math.max(tw / 2, Math.min(W - tw / 2, wunsch))}px`;
      this.tooltip.style.top = `${m.t + 4}px`;
    };
    const verstecke = () => {
      hover.setAttribute('visibility', 'hidden');
      this.tooltip.hidden = true;
    };
    const naechster = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      const a = x0 + ((px - m.l) / iw) * (x1 - x0);
      let best = 0;
      for (let i = 1; i < P.length; i++) if (Math.abs(P[i].alter - a) < Math.abs(P[best].alter - a)) best = i;
      return best;
    };
    treffer.addEventListener('pointermove', (e) => zeige(naechster(e)));
    treffer.addEventListener('pointerdown', (e) => zeige(naechster(e)));
    treffer.addEventListener('pointerleave', verstecke);
    svg.addEventListener('focus', () => zeige(this.idx == null ? P.findIndex((p) => p.alter >= d.auszahlBeginn) : this.idx));
    svg.addEventListener('blur', verstecke);
    svg.addEventListener('keydown', (e) => {
      const i = this.idx == null ? 0 : this.idx;
      if (e.key === 'ArrowRight') { zeige(i + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { zeige(i - 1); e.preventDefault(); }
      else if (e.key === 'Home') { zeige(0); e.preventDefault(); }
      else if (e.key === 'End') { zeige(P.length - 1); e.preventDefault(); }
      else if (e.key === 'Escape') verstecke();
    });

    c.insertBefore(svg, this.tooltip);
  };

  Diagramm.prototype.fuelleTooltip = function (p, letzter) {
    const t = this.tooltip;
    t.textContent = '';
    const kopf = document.createElement('div');
    kopf.className = 'tooltip-kopf';
    kopf.textContent = p.nachTeilauszahlung
      ? `Alter ${p.alter} · nach Teilauszahlung`
      : `Alter ${p.alter} · ${letzter ? 'Ende' : 'Anfang'} ${letzter ? p.jahr - 1 : p.jahr}`;
    t.appendChild(kopf);
    for (const s of SERIEN) {
      if (s.key === 'aus' && p.alter < this.daten.auszahlBeginn) continue;
      const z = document.createElement('div');
      z.className = 'tooltip-zeile';
      const k = document.createElement('span');
      k.className = 'schluessel' + (s.gestrichelt ? ' gestrichelt' : '');
      k.style.borderTopColor = `var(${s.farbe})`;
      const n = document.createElement('span');
      n.className = 'name';
      n.textContent = s.name;
      const w = document.createElement('strong');
      w.textContent = fmtEuro.format(p[s.key]);
      z.append(k, n, w);
      t.appendChild(z);
    }
    t.hidden = false;
  };

  root.Diagramm = Diagramm;
})(typeof self !== 'undefined' ? self : this);
