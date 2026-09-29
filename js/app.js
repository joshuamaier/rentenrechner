/*
 * Oberfläche des Rentenrechners: liest Eingaben, ruft den Rechenkern auf und
 * stellt Ergebnis-Kacheln, Diagramm und Jahrestabelle dar.
 */
(function () {
  'use strict';

  const R = window.Rentenrechner;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ---------- Formatierung ----------
  const nf = (min, max) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
  const f0 = nf(0, 0);
  const f2 = nf(2, 2);
  const fProz = nf(0, 2);

  const euro = (v, nachkomma = 0) => `${(nachkomma ? f2 : f0).format(v)}\u00a0€`;
  const prozent = (v) => `${fProz.format(v * 100)} %`;
  const RHYTHMUS = { 12: 'Monat', 4: 'Quartal', 2: 'Halbjahr', 1: 'Jahr' };
  const RHYTHMUS_ADV = { 12: 'monatlich', 4: 'vierteljährlich', 2: 'halbjährlich', 1: 'jährlich' };
  const RHYTHMUS_ADJ = { 12: 'monatliche', 4: 'vierteljährliche', 2: 'halbjährliche', 1: 'jährliche' };

  function zahlText(v) {
    const ganz = Math.abs(v - Math.round(v)) < 0.005;
    return (ganz ? f0 : f2).format(v);
  }

  function jahreText(y) {
    if (!Number.isFinite(y)) return 'unbegrenzt';
    let j = Math.floor(y + 1e-9);
    let mo = Math.round((y - j) * 12);
    if (mo === 12) { j += 1; mo = 0; }
    const teile = [`${j} ${j === 1 ? 'Jahr' : 'Jahre'}`];
    if (mo) teile.push(`${mo} ${mo === 1 ? 'Monat' : 'Monate'}`);
    return teile.join(' ');
  }

  function parseZahl(s) {
    s = String(s).trim().replace(/[\s€%]/g, '').replace(/−/g, '-');
    if (s === '') return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
  }

  // ---------- Zustand ----------
  const TEXTFELDER = $$('input[data-typ]').map((input) => ({ input, feld: input.id.slice(2), typ: input.dataset.typ }));
  const standard = () => Object.assign({}, R.STANDARD, { startJahr: new Date().getFullYear() });

  let zustand = { ziel: 'rente', werte: standard() };
  let letztesErgebnis = null;

  // Liefert true, wenn der Hash Rechnerwerte enthielt (ein Sprunglink wie #rechner zählt nicht).
  function ausHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return false;
    const q = new URLSearchParams(h);
    const werte = standard();
    let gefunden = q.has('ziel');
    for (const [k, v] of q) {
      if (k === 'ziel') continue;
      if (!(k in werte)) continue;
      gefunden = true;
      if (k === 'entnahmeModus') werte[k] = v === 'ewig' ? 'ewig' : 'dauer';
      else if (k === 'vorschuessig') werte[k] = v !== 'false';
      else if (Number.isFinite(Number(v))) werte[k] = Number(v);
    }
    if (!gefunden) return false;
    zustand = { ziel: R.ZIELE[q.get('ziel')] ? q.get('ziel') : 'rente', werte };
    return true;
  }

  function inHash() {
    const q = new URLSearchParams();
    q.set('ziel', zustand.ziel);
    const feld = R.ZIELE[zustand.ziel].feld;
    for (const [k, v] of Object.entries(zustand.werte)) {
      if (k === feld) continue;
      q.set(k, typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v));
    }
    history.replaceState(null, '', `#${q.toString()}`);
  }

  // ---------- Eingabefelder ----------
  function anzeigeWert(typ, v) {
    if (!Number.isFinite(v)) return '';
    if (typ === 'prozent') return fProz.format(v * 100);
    if (typ === 'euro') return zahlText(v);
    return String(Math.round(v));
  }

  function leseFeld(typ, text) {
    const n = parseZahl(text);
    if (!Number.isFinite(n)) return NaN;
    if (typ === 'prozent') return n / 100;
    if (typ === 'euro') return n;
    return Math.round(n);
  }

  function schreibeAlleFelder() {
    const ausgabe = R.ZIELE[zustand.ziel].feld;
    for (const { input, feld, typ } of TEXTFELDER) {
      if (feld === ausgabe) continue;
      input.value = anzeigeWert(typ, zustand.werte[feld]);
      input.closest('.feld, .option')?.classList.remove('ungueltig');
    }
    $('#f-sparIntervall').value = String(zustand.werte.sparIntervall);
    $('#f-rentenIntervall').value = String(zustand.werte.rentenIntervall);
    $('#f-vorschuessig').value = String(zustand.werte.vorschuessig);
    $(`input[name="ziel"][value="${zustand.ziel}"]`).checked = true;
    $(`input[name="entnahmeModus"][value="${zustand.werte.entnahmeModus}"]`).checked = true;
  }

  const LABELS = {
    rente: { rente: 'Rente', reichweite: 'Gewünschte Rente', sonst: 'Wunschrente' },
    entnahmeDauer: { reichweite: 'Reichweite des Kapitals', sonst: 'Dauer der Auszahlung' },
    sparrate: { sparrate: 'Benötigter Sparbeitrag', sonst: 'Sparbeitrag' },
    anfangskapital: { anfangskapital: 'Benötigtes Anfangskapital', sonst: 'Anfangskapital' },
    zinsAnspar: { zinsAnspar: 'Benötigter Zinssatz', sonst: 'Zinssatz' },
  };

  function aktualisiereFeldZustand() {
    const ziel = zustand.ziel;
    const ausgabe = R.ZIELE[ziel].feld;
    const modus = ziel === 'reichweite' ? 'dauer' : zustand.werte.entnahmeModus;
    const versteckt = {
      entnahmeModus: ziel === 'reichweite',
      entnahmeDauer: modus === 'ewig',
      restkapital: modus === 'ewig' || ziel === 'reichweite',
      rentenDynamik: modus === 'ewig',
    };
    for (const box of $$('.phase .feld')) {
      const feld = box.dataset.feld;
      box.hidden = !!versteckt[feld];
      const istAusgabe = feld === ausgabe;
      box.classList.toggle('berechnet', istAusgabe);
      const input = $(`#f-${feld}`);
      if (input && input.tagName === 'INPUT') {
        input.readOnly = istAusgabe;
        if (istAusgabe) box.classList.remove('ungueltig');
      }
      const label = $(':scope > label', box);
      if (label && LABELS[feld]) label.textContent = LABELS[feld][ziel] || LABELS[feld].sonst;
    }
  }

  // ---------- Berechnung & Darstellung ----------
  const diagramm = new window.Diagramm($('#diagramm'), $('#legende'));

  // Die Werte landen erst nach der ersten Eingabe im URL-Hash, damit ein eingebetteter
  // Rechner die Adresse der Seite beim Laden nicht verändert.
  function berechnen(mitHash = true) {
    aktualisiereFeldZustand();
    const erg = R.berechne(zustand.werte, zustand.ziel);
    zeigeMeldungen(erg);
    const veraltet = !!erg.fehler;
    for (const el of [$('#kacheln'), $('#ergebnis-text'), $('#kennzahl-anspar'), $('#kennzahl-entnahme')]) {
      el.classList.toggle('veraltet', veraltet);
    }
    if (erg.fehler) {
      const ausgabe = $(`#f-${R.ZIELE[zustand.ziel].feld}`);
      ausgabe.value = '–';
      return;
    }
    letztesErgebnis = erg;
    schreibeAusgabe(erg);
    schreibeHilfen(erg);
    zeigeKennzahlen(erg);
    zeigeText(erg);
    zeigeKacheln(erg);
    diagramm.setze(erg);
    zeigeTabelle(erg);
    if (mitHash) inHash();
  }

  function schreibeAusgabe(erg) {
    const { feld, wert } = erg.geloest;
    const input = $(`#f-${feld}`);
    if (feld === 'entnahmeDauer') {
      input.value = Number.isFinite(wert) ? nf(0, 1).format(wert) : 'unbegrenzt';
    } else if (feld === 'zinsAnspar') {
      input.value = nf(2, 2).format(wert * 100);
    } else {
      input.value = f2.format(wert);
    }
  }

  function setzeHilfe(name, text) {
    const el = $(`[data-hilfe="${name}"]`);
    if (el) el.textContent = text || '';
  }

  function schreibeHilfen(erg) {
    const p = erg.params;
    const a = erg.anspar;
    const e = erg.entnahme;
    setzeHilfe('sparEndeAlter', `${a.sparJahre} ${a.sparJahre === 1 ? 'Jahr' : 'Jahre'} Ansparzeit`);
    setzeHilfe('auszahlBeginnAlter', a.ruheJahre > 0
      ? `${a.ruheJahre} ${a.ruheJahre === 1 ? 'Jahr' : 'Jahre'} Ruhephase ohne Sparbeitrag`
      : 'direkt nach dem Sparende');

    let spar = '';
    if (p.sparIntervall === 1) spar = `≈ ${euro(p.sparrate / 12)} pro Monat`;
    else spar = `= ${euro(p.sparrate * p.sparIntervall)} pro Jahr`;
    if (p.sparDynamik && a.sparJahre > 1) spar += ` · letzter Beitrag ${euro(p.sparrate * Math.pow(1 + p.sparDynamik, a.sparJahre - 1), 2)}`;
    setzeHilfe('sparrate', spar);
    setzeHilfe('anfangskapital', zustand.ziel === 'anfangskapital' ? 'heute einmalig anzulegen' : '');
    setzeHilfe('zinsAnspar', zustand.ziel === 'zinsAnspar' ? 'nötige Rendite in der Anspar- und Ruhephase' : '');

    setzeHilfe('teilauszahlung', p.teilauszahlung > 0 && a.kapitalAuszahlbeginn > 0
      ? `= ${fProz.format((p.teilauszahlung / a.kapitalAuszahlbeginn) * 100)} % des Kapitals zu Auszahlbeginn`
      : '');

    if (zustand.ziel === 'reichweite') {
      setzeHilfe('entnahmeDauer', Number.isFinite(e.reichweiteJahre)
        ? `${jahreText(e.reichweiteJahre)} – bis Alter ${nf(0, 1).format(e.endeAlter)}`
        : 'Das Kapital wird nicht aufgebraucht');
    } else {
      setzeHilfe('entnahmeDauer', `bis Alter ${p.auszahlBeginnAlter + p.entnahmeDauer}`);
    }

    let rente = p.rentenIntervall === 1
      ? `≈ ${euro(p.rente / 12, 2)} pro Monat`
      : `= ${euro(p.rente * p.rentenIntervall, 2)} pro Jahr`;
    if (e.modus === 'ewig') rente += ' · Kapital bleibt erhalten';
    else if (p.rentenDynamik && e.anzeigeJahre > 1) {
      rente += ` · letzte Rate ${euro(p.rente * Math.pow(1 + p.rentenDynamik, e.anzeigeJahre - 1), 2)}`;
    }
    setzeHilfe('rente', rente);
  }

  function zeigeMeldungen(erg) {
    const box = $('#meldungen');
    box.textContent = '';
    const neu = (text, fehler) => {
      const m = document.createElement('p');
      m.className = 'meldung' + (fehler ? ' fehler' : '');
      const s = document.createElement('strong');
      s.textContent = fehler ? 'Nicht berechenbar:' : 'Hinweis:';
      m.append(s, document.createTextNode(text));
      box.appendChild(m);
    };
    if (erg.fehler) neu(erg.fehler, true);
    for (const h of erg.hinweise || []) neu(h, false);
  }

  // ---------- Kennzahlen in den Kopfzeilen der Phasen ----------
  function kennzahl(box, titel, wert, einheit, zusatz) {
    box.textContent = '';
    const t = document.createElement('div');
    t.className = 'kennzahl-titel';
    t.textContent = titel;
    const w = document.createElement('div');
    w.className = 'kennzahl-wert';
    w.textContent = wert;
    if (einheit) {
      const e = document.createElement('span');
      e.className = 'kachel-einheit';
      e.textContent = ` ${einheit}`;
      w.appendChild(e);
    }
    const z = document.createElement('div');
    z.className = 'kennzahl-zusatz';
    z.textContent = zusatz;
    box.append(t, w, z);
  }

  function zeigeKennzahlen(erg) {
    const p = erg.params;
    const a = erg.anspar;
    const e = erg.entnahme;
    kennzahl($('#kennzahl-anspar'), `Kapital mit ${p.sparEndeAlter} Jahren`, euro(a.kapitalSparende), '',
      a.ruheJahre > 0
        ? `${euro(a.kapitalAuszahlbeginn)} bei Auszahlbeginn`
        : `nach ${a.sparJahre} ${a.sparJahre === 1 ? 'Jahr' : 'Jahren'} (${p.startJahr + a.sparJahre})`);

    // Bei der Reichweite ist das Ergebnis das Alter, bis zu dem die Rente reicht – sonst die Rente selbst.
    if (zustand.ziel === 'reichweite') {
      const endlich = Number.isFinite(e.reichweiteJahre);
      kennzahl($('#kennzahl-entnahme'), 'Rente reicht bis',
        endlich ? `Alter ${f0.format(Math.floor(e.endeAlter + 1e-9))}` : 'unbegrenzt', '',
        endlich ? `${jahreText(e.reichweiteJahre)} lang` : 'Kapital wird nicht aufgebraucht');
      return;
    }
    let zusatz;
    if (e.modus === 'ewig') zusatz = 'ewige Rente – Kapital bleibt erhalten';
    else if (!Number.isFinite(e.reichweiteJahre)) zusatz = 'Kapital wird nicht aufgebraucht';
    else zusatz = `${jahreText(e.reichweiteJahre)}, bis Alter ${nf(0, 1).format(e.endeAlter)}`;
    const titel = RHYTHMUS_ADJ[p.rentenIntervall];
    kennzahl($('#kennzahl-entnahme'), `${titel.charAt(0).toUpperCase()}${titel.slice(1)} Rente`,
      euro(p.rente, 2), '', zusatz);
  }

  // ---------- Ergebnis als Fließtext ----------
  // Wiederholt die Eingaben und beschreibt das Ergebnis in Alltagssprache, ohne Fachbegriffe.
  // Absätze bestehen aus Textteilen; { b: '…' } wird fett dargestellt.
  function zeigeText(erg) {
    const p = erg.params;
    const a = erg.anspar;
    const e = erg.entnahme;
    const ziel = zustand.ziel;
    const B = (s) => ({ b: s });
    const pz = (v) => `${fProz.format(v * 100)} %`;
    const jahre = (n) => `${n} ${n === 1 ? 'Jahr' : 'Jahre'}`;
    const jahrenDativ = (n) => `${n} ${n === 1 ? 'Jahr' : 'Jahren'}`;
    const renteText = `${RHYTHMUS_ADV[p.rentenIntervall]} ${euro(p.rente, 2)}`;
    const sparText = `${RHYTHMUS_ADV[p.sparIntervall]} ${euro(p.sparrate, 2)}`;
    const absaetze = [];

    // Rückwärtsrechnung: Ziel und Lösung vorneweg
    if (R.ZIELE[ziel].richtung === 'rueckwaerts') {
      const dauer = e.modus === 'ewig' ? 'dauerhaft' : `${jahre(p.entnahmeDauer)} lang`;
      const t = [
        `Ihr Ziel: Ab ${p.auszahlBeginnAlter} Jahren möchten Sie ${dauer} `, B(renteText),
        ' Rente bekommen. Dafür brauchen Sie zum Rentenbeginn ein Vermögen von ', B(euro(erg.kapitalBedarf)), '. ',
      ];
      const nichtNoetig = (erg.hinweise || []).length && erg.geloest.wert === 0;
      if (ziel === 'sparrate') {
        t.push(...(nichtNoetig
          ? ['Das erreichen Sie schon ohne weitere Sparbeiträge – Ihr Startbetrag reicht bereits aus.']
          : ['Das erreichen Sie, wenn Sie bis dahin ', B(sparText), ' zur Seite legen.']));
      } else if (ziel === 'anfangskapital') {
        t.push(...(nichtNoetig
          ? ['Ein Startbetrag ist dafür nicht nötig – Ihre regelmäßigen Sparbeiträge reichen bereits aus.']
          : ['Das erreichen Sie, wenn Sie heute einmalig ', B(euro(p.anfangskapital)), ' anlegen.']));
      } else {
        t.push('Das klappt, wenn sich Ihr Geld beim Sparen jedes Jahr um durchschnittlich ',
          B(`${nf(2, 2).format(p.zinsAnspar * 100)} %`), ' vermehrt.');
      }
      absaetze.push(t);
    }

    // Ansparphase
    const an = [`Sie sind heute ${p.alterHeute} Jahre alt`];
    if (p.anfangskapital > 0) an.push(' und haben bereits ', B(euro(p.anfangskapital)), ' angelegt');
    an.push('. ');
    if (a.sparJahre > 0 && p.sparrate > 0) {
      an.push(`Bis Sie ${p.sparEndeAlter} sind, legen Sie `, B(sparText), ' zur Seite');
      if (p.sparDynamik) an.push(` und erhöhen den Betrag jedes Jahr um ${pz(p.sparDynamik)}`);
      an.push('. ');
    }
    if (a.sparJahre > 0) {
      const ertraege = a.kapitalSparende - a.einzahlungen;
      an.push(`Wenn Ihr Geld dabei im Schnitt ${pz(p.zinsAnspar)} pro Jahr Ertrag bringt, sind nach ${jahrenDativ(a.sparJahre)} `,
        B(euro(a.kapitalSparende)), ' zusammengekommen. Davon haben Sie selbst ', B(euro(a.einzahlungen)), ' eingezahlt');
      if (ertraege >= 0.5) {
        an.push(' – die übrigen ', B(euro(ertraege)), ' hat Ihr Geld durch Zinsen und Zinseszinsen für Sie erwirtschaftet. ');
      } else {
        an.push('. ');
      }
    }
    if (a.ruheJahre > 0) {
      an.push(`Danach zahlen Sie nichts mehr ein, das Geld bleibt aber noch ${jahre(a.ruheJahre)} angelegt und wächst bis zum Rentenbeginn mit ${p.auszahlBeginnAlter} auf `,
        B(euro(a.kapitalAuszahlbeginn)), '.');
    } else if (a.sparJahre === 0) {
      an.push('Zum Rentenbeginn stehen Ihnen ', B(euro(a.kapitalAuszahlbeginn)), ' zur Verfügung.');
    }
    absaetze.push(an);

    // Auszahlphase
    const aus = [];
    if (p.teilauszahlung > 0) {
      aus.push(`Zum Rentenbeginn mit ${p.auszahlBeginnAlter} lassen Sie sich einmalig `, B(euro(p.teilauszahlung)),
        ' auszahlen, zum Beispiel für eine größere Anschaffung. Übrig bleiben ', B(euro(e.kapitalNachTeilauszahlung)), '. ');
    }
    const start = p.teilauszahlung > 0 ? 'Aus diesem Betrag' : `Ab ${p.auszahlBeginnAlter}`;
    const renten = e.summeAuszahlungen - e.teilauszahlung;
    const gesamt = () => {
      aus.push(' Insgesamt bekommen Sie so ', B(euro(renten)), ' ausgezahlt');
      if (e.zinsen >= 0.5) aus.push(` – ${euro(e.zinsen)} davon sind Erträge, die erst während der Rentenzeit dazukommen`);
      aus.push('.');
    };
    if (e.modus === 'ewig') {
      aus.push(`${start} bekommen Sie `, B(renteText), ' Rente – und zwar ', B('für immer'),
        `. Das funktioniert, weil Ihnen nur die Erträge ausgezahlt werden, die das Geld weiterhin abwirft (${pz(p.zinsEntnahme)} pro Jahr). Das Vermögen von `,
        B(euro(e.kapitalNachTeilauszahlung)), ' selbst wird nicht angetastet und kann später vererbt werden.');
    } else if (ziel === 'reichweite') {
      aus.push(`Wenn Sie sich ${start === 'Aus diesem Betrag' ? 'daraus' : `ab ${p.auszahlBeginnAlter}`} `, B(renteText),
        ` auszahlen lassen und das restliche Geld weiterhin ${pz(p.zinsEntnahme)} pro Jahr bringt, `);
      if (Number.isFinite(e.reichweiteJahre)) {
        aus.push('reicht Ihr Vermögen ', B(jahreText(e.reichweiteJahre)), ' – also ungefähr bis Sie ',
          B(f0.format(Math.floor(e.endeAlter + 1e-9))), ' sind. Danach ist es aufgebraucht.');
        gesamt();
      } else {
        aus.push('wird Ihr Vermögen ', B('nie aufgebraucht'), ': Die laufenden Erträge sind mindestens so hoch wie Ihre Rente.');
      }
    } else {
      aus.push(`${start} bekommen Sie `, B(jahreText(e.reichweiteJahre)), ' lang, also bis Sie ',
        B(nf(0, 1).format(e.endeAlter)), ' sind, ', B(renteText), ' Rente');
      if (p.rentenDynamik && e.anzeigeJahre > 1) {
        aus.push(`, die jedes Jahr um ${pz(p.rentenDynamik)} steigt – zuletzt sind es ${euro(p.rente * Math.pow(1 + p.rentenDynamik, e.anzeigeJahre - 1), 2)}`);
      }
      aus.push(`. Das restliche Geld bleibt so lange angelegt und bringt weiter ${pz(p.zinsEntnahme)} pro Jahr.`);
      gesamt();
      aus.push(p.restkapital > 0 ? ' Am Ende bleiben noch ' : ' Danach ist das Vermögen aufgebraucht.');
      if (p.restkapital > 0) aus.push(B(euro(e.kapitalEnde)), ' übrig.');
    }
    absaetze.push(aus);

    const box = $('#ergebnis-text');
    box.textContent = '';
    for (const teile of absaetze) {
      const el = document.createElement('p');
      for (const t of teile) {
        if (typeof t === 'string') el.appendChild(document.createTextNode(t));
        else {
          const s = document.createElement('strong');
          s.textContent = t.b;
          el.appendChild(s);
        }
      }
      box.appendChild(el);
    }
  }

  function kachel(titel, wert, zusatz, haupt, einheit) {
    const k = document.createElement('div');
    k.className = 'kachel' + (haupt ? ' haupt' : '');
    const t = document.createElement('div');
    t.className = 'kachel-titel';
    t.textContent = titel;
    const w = document.createElement('div');
    w.className = 'kachel-wert';
    w.textContent = wert;
    if (einheit) {
      const e = document.createElement('span');
      e.className = 'kachel-einheit';
      e.textContent = ` ${einheit}`;
      w.appendChild(e);
    }
    k.append(t, w);
    if (zusatz) {
      const z = document.createElement('div');
      z.className = 'kachel-zusatz';
      z.textContent = zusatz;
      k.appendChild(z);
    }
    return k;
  }

  function zeigeKacheln(erg) {
    const p = erg.params;
    const a = erg.anspar;
    const e = erg.entnahme;
    const box = $('#kacheln');
    box.textContent = '';
    const proRente = `/ ${RHYTHMUS[p.rentenIntervall]}`;
    const proSpar = `/ ${RHYTHMUS[p.sparIntervall]}`;
    const dauerText = e.modus === 'ewig'
      ? 'ewige Rente – nur Zinsen, Kapital bleibt erhalten'
      : `${jahreText(e.reichweiteJahre)}, bis Alter ${nf(0, 1).format(e.endeAlter)}`;

    // Hauptergebnis = die berechnete Zielgröße
    switch (zustand.ziel) {
      case 'rente':
        box.appendChild(kachel('Rente', euro(p.rente, 2), dauerText, true, proRente));
        break;
      case 'reichweite':
        box.appendChild(kachel('Reichweite des Kapitals', jahreText(e.reichweiteJahre),
          Number.isFinite(e.reichweiteJahre)
            ? `bei ${euro(p.rente, 2)} ${proRente}, bis Alter ${nf(0, 1).format(e.endeAlter)}`
            : `bei ${euro(p.rente, 2)} ${proRente} wird das Kapital nicht aufgebraucht`, true));
        break;
      case 'sparrate':
        box.appendChild(kachel('Benötigter Sparbeitrag', euro(p.sparrate, 2),
          `für ${euro(p.rente, 2)} ${proRente} Wunschrente`, true, proSpar));
        break;
      case 'anfangskapital':
        box.appendChild(kachel('Benötigtes Anfangskapital', euro(p.anfangskapital),
          `für ${euro(p.rente, 2)} ${proRente} Wunschrente`, true));
        break;
      case 'zinsAnspar':
        box.appendChild(kachel('Benötigter Zinssatz', `${nf(2, 2).format(p.zinsAnspar * 100)} %`,
          `für ${euro(p.rente, 2)} ${proRente} Wunschrente`, true, 'p.a.'));
        break;
    }

    box.appendChild(kachel('Kapital bei Auszahlbeginn', euro(a.kapitalAuszahlbeginn),
      `mit ${p.auszahlBeginnAlter} Jahren (${p.startJahr + a.sparJahre + a.ruheJahre})`));
    box.appendChild(kachel('Eigene Einzahlungen', euro(a.einzahlungen),
      p.anfangskapital > 0 ? `inkl. ${euro(p.anfangskapital)} Anfangskapital` : `über ${a.sparJahre} Jahre`));
    box.appendChild(kachel('Zinserträge bis Auszahlbeginn', euro(a.zinsen),
      a.kapitalAuszahlbeginn > 0 ? `${fProz.format((a.zinsen / a.kapitalAuszahlbeginn) * 100)} % des Kapitals` : ''));

    if (zustand.ziel !== 'rente') {
      box.appendChild(kachel(e.modus === 'ewig' ? 'Rente (aus Zinsen)' : 'Rente',
        euro(p.rente, 2), zustand.ziel === 'reichweite' ? 'vorgegeben' : dauerText, false, proRente));
    }
    if (p.teilauszahlung > 0) {
      box.appendChild(kachel('Teilauszahlung', euro(p.teilauszahlung), `einmalig mit ${p.auszahlBeginnAlter} Jahren`));
    }
    if (Number.isFinite(e.reichweiteJahre)) {
      box.appendChild(kachel('Summe aller Auszahlungen', euro(e.summeAuszahlungen),
        `davon ${euro(e.zinsen)} Zinsen in der Auszahlphase`));
    } else {
      box.appendChild(kachel('Kapital bleibt erhalten', euro(e.kapitalEnde),
        `Zinsertrag ${euro(p.rente * p.rentenIntervall)} pro Jahr`));
    }
  }

  // ---------- Tabelle ----------
  const PHASEN = { anspar: 'Ansparen', ruhe: 'Ruhephase', entnahme: 'Auszahlung' };

  function tabellenSpalten(erg) {
    const mitTeil = erg.params.teilauszahlung > 0;
    const spalten = [
      { titel: 'Jahr', wert: (r) => String(r.jahr) },
      { titel: 'Alter', wert: (r) => String(r.alter) },
      { titel: 'Phase', wert: (r) => PHASEN[r.phase], phase: true },
      { titel: 'Kapital Jahresbeginn', zahl: (r) => r.kapitalAnfang },
      { titel: 'Einzahlungen', zahl: (r) => r.einzahlung, summe: true },
      { titel: 'Zinsen', zahl: (r) => r.zinsen, summe: true },
    ];
    if (mitTeil) spalten.push({ titel: 'Teilauszahlung', zahl: (r) => r.einmalzahlung, summe: true });
    spalten.push(
      { titel: 'Rentenzahlungen', zahl: (r) => r.auszahlung, summe: true },
      { titel: 'Kapital Jahresende', zahl: (r) => r.kapitalEnde, ende: true },
    );
    return spalten;
  }

  function zeigeTabelle(erg) {
    const tab = $('#tabelle');
    tab.textContent = '';
    const spalten = tabellenSpalten(erg);
    const kopf = tab.createTHead().insertRow();
    for (const s of spalten) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = s.titel;
      kopf.appendChild(th);
    }
    const body = tab.createTBody();
    let vorher = null;
    for (const r of erg.rows) {
      const tr = body.insertRow();
      if (vorher && vorher !== r.phase) tr.className = 'phasenwechsel';
      vorher = r.phase;
      for (const s of spalten) {
        const td = tr.insertCell();
        if (s.phase) {
          const chip = document.createElement('span');
          chip.className = `phase-chip ${r.phase}`;
          chip.textContent = s.wert(r);
          td.appendChild(chip);
        } else if (s.zahl) {
          const v = s.zahl(r);
          if (Math.abs(v) < 0.005 && s.summe) {
            td.textContent = '–';
            td.className = 'leer';
          } else {
            td.textContent = f2.format(v);
          }
        } else {
          td.textContent = s.wert(r);
        }
      }
    }
    const fuss = tab.createTFoot().insertRow();
    spalten.forEach((s, i) => {
      const td = fuss.insertCell();
      if (i === 0) td.textContent = 'Summe';
      else if (s.summe) td.textContent = f2.format(erg.rows.reduce((acc, r) => acc + s.zahl(r), 0));
      else if (s.ende && erg.rows.length) td.textContent = f2.format(erg.rows[erg.rows.length - 1].kapitalEnde);
    });
  }

  function csvHerunterladen() {
    const erg = letztesErgebnis;
    if (!erg) return;
    const spalten = tabellenSpalten(erg);
    const zahl = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
    const zeilen = [spalten.map((s) => s.titel).join(';')];
    for (const r of erg.rows) {
      zeilen.push(spalten.map((s) => (s.zahl ? zahl.format(s.zahl(r)) : s.wert(r))).join(';'));
    }
    const blob = new Blob(['﻿' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rentenrechner.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Ereignisse ----------
  for (const { input, feld, typ } of TEXTFELDER) {
    input.addEventListener('input', () => {
      if (input.readOnly) return;
      const v = leseFeld(typ, input.value);
      const box = input.closest('.feld, .option');
      box?.classList.toggle('ungueltig', !Number.isFinite(v));
      if (!Number.isFinite(v)) return;
      zustand.werte[feld] = v;
      berechnen();
    });
    input.addEventListener('blur', () => {
      if (input.readOnly) return;
      if (Number.isFinite(leseFeld(typ, input.value))) input.value = anzeigeWert(typ, zustand.werte[feld]);
    });
  }

  $('#f-sparIntervall').addEventListener('change', (e) => { zustand.werte.sparIntervall = Number(e.target.value); berechnen(); });
  $('#f-rentenIntervall').addEventListener('change', (e) => { zustand.werte.rentenIntervall = Number(e.target.value); berechnen(); });
  $('#f-vorschuessig').addEventListener('change', (e) => { zustand.werte.vorschuessig = e.target.value === 'true'; berechnen(); });

  for (const r of $$('input[name="entnahmeModus"]')) {
    r.addEventListener('change', () => { zustand.werte.entnahmeModus = r.value; berechnen(); });
  }

  // Beim Wechsel des Ziels wird das bisherige Ergebnis zur neuen Eingabe –
  // so rechnet man z. B. aus der berechneten Rente direkt rückwärts.
  for (const r of $$('input[name="ziel"]')) {
    r.addEventListener('change', () => {
      const alt = letztesErgebnis;
      if (alt && !alt.fehler) {
        const { feld, wert } = alt.geloest;
        let v = wert;
        if (feld === 'entnahmeDauer') v = Number.isFinite(v) ? Math.max(1, Math.round(v)) : R.STANDARD.entnahmeDauer;
        else if (feld === 'zinsAnspar') v = Math.round(v * 1e4) / 1e4;
        else v = Math.round(v * 100) / 100;
        zustand.werte[feld] = v;
      }
      zustand.ziel = r.value;
      schreibeAlleFelder();
      berechnen();
    });
  }

  $('#btn-reset').addEventListener('click', () => {
    zustand = { ziel: 'rente', werte: standard() };
    schreibeAlleFelder();
    berechnen();
  });

  $('#btn-teilen').addEventListener('click', async (e) => {
    const knopf = e.currentTarget;
    try {
      await navigator.clipboard.writeText(location.href);
      knopf.textContent = 'Link kopiert ✓';
    } catch {
      knopf.textContent = 'Kopieren nicht möglich';
    }
    setTimeout(() => { knopf.textContent = 'Link kopieren'; }, 2000);
  });

  $('#btn-csv').addEventListener('click', csvHerunterladen);

  // ---------- Start ----------
  const ausLink = ausHash();
  schreibeAlleFelder();
  berechnen(ausLink);
})();
