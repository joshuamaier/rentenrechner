/*
 * Rechenkern des Rentenrechners.
 *
 * Reine Funktionen ohne DOM-Zugriff, damit sie im Browser (window.Rentenrechner)
 * und in Node (require) gleichermaßen laufen und getestet werden können.
 *
 * Modell:
 *  - Simulation in Monatsschritten mit dem konformen (effektiven) Monatszins
 *    i_m = (1 + p)^(1/12) - 1. Ein Zinssatz von 5 % p.a. ergibt damit genau
 *    5 % Rendite pro Jahr – unabhängig vom Zahlungsrhythmus.
 *  - Zahlungen (Sparbeiträge und Renten) wahlweise vorschüssig (Periodenbeginn)
 *    oder nachschüssig (Periodenende).
 *  - Phasen: Ansparphase -> optionale Ruhephase (kein Sparbeitrag, Zins der
 *    Ansparphase) -> Auszahlphase (Zins der Auszahlphase).
 *  - Alle Zinssätze/Dynamiken als Dezimalzahl (0.05 = 5 %).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rentenrechner = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_JAHRE_REICHWEITE = 100;
  const EPS = 1e-6;
  const CENT_TOLERANZ = 0.01; // Rundungsdifferenzen unter einem Cent lösen keine Erschöpfung aus

  const STANDARD = Object.freeze({
    startJahr: new Date().getFullYear(),
    alterHeute: 35,
    sparEndeAlter: 67,
    anfangskapital: 10000,
    sparrate: 300,
    sparIntervall: 12,
    sparDynamik: 0,
    zinsAnspar: 0.06,
    auszahlBeginnAlter: 67,
    teilauszahlung: 0,
    zinsEntnahme: 0.03,
    rente: 1500,
    rentenIntervall: 12,
    rentenDynamik: 0,
    entnahmeModus: 'ewig', // 'dauer' (Kapitalverzehr) | 'ewig' (nur Zinsen)
    entnahmeDauer: 25,
    restkapital: 0,
    vorschuessig: false, // Zahlungen am Periodenende; in der Oberfläche nicht einstellbar
  });

  // Was berechnet wird und welches Eingabefeld dadurch zum Ergebnis wird.
  const ZIELE = Object.freeze({
    rente: { feld: 'rente', richtung: 'vorwaerts' },
    reichweite: { feld: 'entnahmeDauer', richtung: 'vorwaerts' },
    sparrate: { feld: 'sparrate', richtung: 'rueckwaerts' },
    anfangskapital: { feld: 'anfangskapital', richtung: 'rueckwaerts' },
    zinsAnspar: { feld: 'zinsAnspar', richtung: 'rueckwaerts' },
  });

  function periodenZins(pa, proJahr) {
    return Math.pow(1 + pa, 1 / proJahr) - 1;
  }

  function istZahlmonat(monat, proJahr, vorschuessig) {
    const abstand = 12 / proJahr;
    return vorschuessig ? monat % abstand === 0 : (monat + 1) % abstand === 0;
  }

  /** Löst f(x) = ziel für eine in x lineare Funktion exakt über zwei Stützstellen. */
  function loeseLinear(f, ziel) {
    const x0 = 0;
    const x1 = 1000;
    const f0 = f(x0);
    const f1 = f(x1);
    if (Math.abs(f1 - f0) < 1e-12) return NaN;
    return x0 + ((ziel - f0) * (x1 - x0)) / (f1 - f0);
  }

  /** Bisektion für monoton steigendes f auf [lo, hi]. */
  function bisektion(f, ziel, lo, hi) {
    let flo = f(lo);
    const fhi = f(hi);
    if (ziel < flo - EPS || ziel > fhi + EPS) return NaN;
    for (let n = 0; n < 200; n++) {
      const mid = (lo + hi) / 2;
      const fmid = f(mid);
      if (fmid < ziel) {
        lo = mid;
        flo = fmid;
      } else {
        hi = mid;
      }
      if (hi - lo < 1e-12) break;
    }
    return (lo + hi) / 2;
  }

  function normalisiere(eingabe) {
    const p = Object.assign({}, STANDARD, eingabe || {});
    const ganz = ['startJahr', 'alterHeute', 'sparEndeAlter', 'auszahlBeginnAlter', 'sparIntervall', 'rentenIntervall'];
    for (const k of ganz) p[k] = Math.round(Number(p[k]));
    const zahl = [
      'anfangskapital',
      'sparrate',
      'sparDynamik',
      'zinsAnspar',
      'teilauszahlung',
      'zinsEntnahme',
      'rente',
      'rentenDynamik',
      'entnahmeDauer',
      'restkapital',
    ];
    for (const k of zahl) p[k] = Number(p[k]);
    p.vorschuessig = p.vorschuessig !== false && p.vorschuessig !== 'false';
    return p;
  }

  function pruefe(p, ziel) {
    const feld = ZIELE[ziel] && ZIELE[ziel].feld;
    for (const [k, v] of Object.entries(p)) {
      if (k === feld || typeof v !== 'number') continue;
      if (!Number.isFinite(v)) return `Ungültiger Wert im Feld „${k}“.`;
    }
    if (![1, 2, 4, 12].includes(p.sparIntervall) || ![1, 2, 4, 12].includes(p.rentenIntervall)) {
      return 'Ungültiger Zahlungsrhythmus.';
    }
    if (p.alterHeute < 0 || p.alterHeute > 100) return 'Das Alter heute muss zwischen 0 und 100 liegen.';
    if (p.sparEndeAlter < p.alterHeute) return 'Das Sparende darf nicht vor dem heutigen Alter liegen.';
    if (p.auszahlBeginnAlter < p.sparEndeAlter) return 'Die Auszahlung kann erst nach dem Sparende beginnen.';
    if (p.auszahlBeginnAlter - p.alterHeute > 100)
      return 'Der Zeitraum bis zur Auszahlung ist zu lang (max. 100 Jahre).';
    for (const k of ['zinsAnspar', 'zinsEntnahme', 'sparDynamik', 'rentenDynamik']) {
      if (k !== feld && p[k] <= -0.5) return 'Zinssätze und Dynamiken müssen größer als −50 % sein.';
    }
    if (feld !== 'anfangskapital' && p.anfangskapital < 0) return 'Das Anfangskapital darf nicht negativ sein.';
    if (feld !== 'sparrate' && p.sparrate < 0) return 'Der Sparbeitrag darf nicht negativ sein.';
    if (p.teilauszahlung < 0) return 'Die Teilauszahlung darf nicht negativ sein.';
    if (p.restkapital < 0) return 'Das Restkapital darf nicht negativ sein.';
    if (feld !== 'rente' && p.rente < 0) return 'Die Rente darf nicht negativ sein.';
    if (ziel !== 'reichweite' && p.entnahmeModus === 'dauer') {
      if (!(p.entnahmeDauer > 0) || p.entnahmeDauer > 100)
        return 'Die Auszahldauer muss zwischen 1 und 100 Jahren liegen.';
      if (Math.round(p.entnahmeDauer) !== p.entnahmeDauer)
        return 'Die Auszahldauer muss in ganzen Jahren angegeben werden.';
    }
    return null;
  }

  /** Anspar- und Ruhephase. */
  function simuliereAnspar(p) {
    const sparJahre = p.sparEndeAlter - p.alterHeute;
    const ruheJahre = p.auszahlBeginnAlter - p.sparEndeAlter;
    const im = periodenZins(p.zinsAnspar, 12);
    const rows = [];
    let K = p.anfangskapital;
    let einzahlungen = p.anfangskapital;
    let zinsen = 0;
    let kapitalSparende = K;

    for (let j = 0; j < sparJahre + ruheJahre; j++) {
      const spart = j < sparJahre;
      const rate = spart ? p.sparrate * Math.pow(1 + p.sparDynamik, j) : 0;
      const start = K;
      let e = 0;
      let z = 0;
      for (let m = 0; m < 12; m++) {
        const zahlt = spart && istZahlmonat(m, p.sparIntervall, p.vorschuessig);
        if (zahlt && p.vorschuessig) {
          K += rate;
          e += rate;
        }
        const zm = K * im;
        K += zm;
        z += zm;
        if (zahlt && !p.vorschuessig) {
          K += rate;
          e += rate;
        }
      }
      einzahlungen += e;
      zinsen += z;
      if (spart) kapitalSparende = K;
      rows.push({
        index: j,
        jahr: p.startJahr + j,
        alter: p.alterHeute + j,
        phase: spart ? 'anspar' : 'ruhe',
        kapitalAnfang: start,
        einzahlung: e,
        zinsen: z,
        einmalzahlung: 0,
        auszahlung: 0,
        kapitalEnde: K,
        sparrate: spart ? rate : 0,
        rente: 0,
      });
    }
    return { rows, kapital: K, kapitalSparende, einzahlungen, zinsen, sparJahre, ruheJahre };
  }

  /**
   * Auszahlphase.
   * opts.jahre   – Anzahl simulierter Jahre
   * opts.bisLeer – Zahlungen auf das vorhandene Kapital begrenzen und bei
   *                Erschöpfung abbrechen (für Reichweite und Anzeige)
   */
  function simuliereEntnahme(p, kapitalStart, rente, opts) {
    const jahre = opts.jahre;
    const bisLeer = !!opts.bisLeer;
    const dynamik = opts.ohneDynamik ? 0 : p.rentenDynamik;
    const im = periodenZins(p.zinsEntnahme, 12);
    const rows = [];
    let K = kapitalStart;
    let summe = 0;
    let zinsen = 0;
    let zahlungen = 0; // Anzahl Rentenzahlungen, anteilig bei der letzten
    let erschoepft = false;

    for (let j = 0; j < jahre && !erschoepft; j++) {
      const betrag = rente * Math.pow(1 + dynamik, j);
      const start = K;
      let einmal = 0;
      let a = 0;
      let z = 0;
      if (j === 0 && p.teilauszahlung > 0) {
        einmal = bisLeer ? Math.min(p.teilauszahlung, Math.max(K, 0)) : p.teilauszahlung;
        K -= einmal;
      }
      const zahle = () => {
        if (bisLeer && K < betrag - CENT_TOLERANZ) {
          const rest = Math.max(K, 0);
          a += rest;
          if (betrag > 0) zahlungen += rest / betrag;
          K = 0;
          erschoepft = true;
        } else {
          K -= betrag;
          a += betrag;
          zahlungen += 1;
        }
      };
      for (let m = 0; m < 12 && !erschoepft; m++) {
        const zahlt = istZahlmonat(m, p.rentenIntervall, p.vorschuessig);
        if (zahlt && p.vorschuessig) zahle();
        if (erschoepft) break;
        const zm = K * im;
        K += zm;
        z += zm;
        if (zahlt && !p.vorschuessig) zahle();
      }
      if (bisLeer && Math.abs(K) < CENT_TOLERANZ) K = 0;
      summe += einmal + a;
      zinsen += z;
      rows.push({
        index: j,
        jahr: 0,
        alter: p.auszahlBeginnAlter + j,
        phase: 'entnahme',
        kapitalAnfang: start,
        einzahlung: 0,
        zinsen: z,
        einmalzahlung: einmal,
        auszahlung: a,
        kapitalEnde: K,
        sparrate: 0,
        rente: betrag,
      });
    }
    return { rows, kapitalEnde: K, summe, zinsen, zahlungen, erschoepft };
  }

  /** Rente, die aus den Zinsen eines Kapitals gezahlt werden kann (Kapital bleibt konstant). */
  function ewigeRente(p, kapital) {
    const ip = periodenZins(p.zinsEntnahme, p.rentenIntervall);
    return p.vorschuessig ? (kapital * ip) / (1 + ip) : kapital * ip;
  }

  /** Kapital, das zu Auszahlbeginn für die gewünschte Rente nötig ist (inkl. Teilauszahlung). */
  function kapitalBedarf(p) {
    if (p.entnahmeModus === 'ewig') {
      const ip = periodenZins(p.zinsEntnahme, p.rentenIntervall);
      if (!(ip > 0)) return NaN;
      const barwert = p.vorschuessig ? (p.rente * (1 + ip)) / ip : p.rente / ip;
      return barwert + p.teilauszahlung;
    }
    const endKapital = (K) => simuliereEntnahme(p, K, p.rente, { jahre: p.entnahmeDauer }).kapitalEnde;
    return loeseLinear(endKapital, p.restkapital);
  }

  function anzeigeJahreEwig(p) {
    return Math.max(10, 100 - p.auszahlBeginnAlter);
  }

  /**
   * Hauptfunktion.
   * @param {object} eingabe  Parameter (siehe STANDARD)
   * @param {string} ziel     Schlüssel aus ZIELE
   */
  function berechne(eingabe, ziel) {
    ziel = ZIELE[ziel] ? ziel : 'rente';
    const p = normalisiere(eingabe);
    if (ziel === 'reichweite') p.entnahmeModus = 'dauer';
    const fehler = pruefe(p, ziel);
    if (fehler) return { ziel, fehler, params: p };

    const hinweise = [];
    let bedarf = NaN;

    // 1) Rückwärtsrechnung: Größe der Ansparphase bestimmen, die den Kapitalbedarf deckt
    if (ZIELE[ziel].richtung === 'rueckwaerts') {
      bedarf = kapitalBedarf(p);
      if (!Number.isFinite(bedarf)) {
        return { ziel, params: p, fehler: 'Für eine ewige Rente muss der Zins der Auszahlphase größer als 0 % sein.' };
      }
      const kapitalMit = (feld) => (x) => simuliereAnspar(Object.assign({}, p, { [feld]: x })).kapital;

      if (ziel === 'sparrate' || ziel === 'anfangskapital') {
        if (ziel === 'sparrate' && p.sparEndeAlter === p.alterHeute) {
          return {
            ziel,
            params: p,
            fehler: 'Ohne Ansparzeit (Sparende = Alter heute) lässt sich keine Sparrate berechnen.',
          };
        }
        let x = loeseLinear(kapitalMit(ziel), bedarf);
        if (!Number.isFinite(x))
          return { ziel, params: p, fehler: 'Die Zielgröße lässt sich mit diesen Eingaben nicht berechnen.' };
        if (x < 0) {
          hinweise.push(
            ziel === 'sparrate'
              ? 'Das Ziel wird bereits ohne Sparbeitrag erreicht – der Sparbeitrag wurde auf 0 gesetzt.'
              : 'Das Ziel wird bereits ohne Anfangskapital erreicht – das Anfangskapital wurde auf 0 gesetzt.',
          );
          x = 0;
        }
        p[ziel] = x;
      } else if (ziel === 'zinsAnspar') {
        const f = kapitalMit('zinsAnspar');
        const x = bisektion(f, bedarf, -0.49, 1);
        if (!Number.isFinite(x)) {
          const zuHoch = bedarf > f(1);
          return {
            ziel,
            params: p,
            fehler: zuHoch
              ? 'Selbst mit 100 % Zins p.a. wird das benötigte Kapital nicht erreicht.'
              : 'Das Ziel wird bereits mit jedem sinnvollen Zinssatz erreicht.',
          };
        }
        p.zinsAnspar = x;
      }
    }

    // 2) Ansparphase simulieren
    const anspar = simuliereAnspar(p);
    const kapitalStart = anspar.kapital;
    if (!Number.isFinite(bedarf)) bedarf = kapitalBedarf(p);

    if (p.teilauszahlung > kapitalStart + EPS) {
      return {
        ziel,
        params: p,
        anspar,
        fehler: 'Die Teilauszahlung ist höher als das Kapital zu Beginn der Auszahlphase.',
      };
    }

    // 3) Auszahlphase
    let entnahme;
    let reichweiteJahre;
    if (ziel === 'rente') {
      if (p.entnahmeModus === 'ewig') {
        p.rente = ewigeRente(p, kapitalStart - p.teilauszahlung);
      } else {
        const end = (R) => simuliereEntnahme(p, kapitalStart, R, { jahre: p.entnahmeDauer }).kapitalEnde;
        const R = loeseLinear(end, p.restkapital);
        if (!(R >= 0)) {
          return {
            ziel,
            params: p,
            anspar,
            fehler: 'Das gewünschte Restkapital ist höher als das verfügbare Kapital.',
          };
        }
        p.rente = R;
      }
    }

    if (ziel === 'reichweite') {
      entnahme = simuliereEntnahme(p, kapitalStart, p.rente, { jahre: MAX_JAHRE_REICHWEITE, bisLeer: true });
      if (entnahme.erschoepft) {
        reichweiteJahre = entnahme.zahlungen / p.rentenIntervall;
        p.entnahmeDauer = reichweiteJahre;
      } else {
        reichweiteJahre = Infinity;
        p.entnahmeDauer = Infinity;
        hinweise.push(
          `Das Kapital reicht länger als ${MAX_JAHRE_REICHWEITE} Jahre – die Rente wird praktisch dauerhaft aus den Erträgen bezahlt.`,
        );
        entnahme = simuliereEntnahme(p, kapitalStart, p.rente, { jahre: anzeigeJahreEwig(p), bisLeer: true });
      }
    } else if (p.entnahmeModus === 'ewig') {
      reichweiteJahre = Infinity;
      entnahme = simuliereEntnahme(p, kapitalStart, p.rente, {
        jahre: anzeigeJahreEwig(p),
        bisLeer: true,
        ohneDynamik: true,
      });
    } else {
      reichweiteJahre = p.entnahmeDauer;
      entnahme = simuliereEntnahme(p, kapitalStart, p.rente, { jahre: p.entnahmeDauer, bisLeer: true });
      if (entnahme.erschoepft) {
        const tatsaechlich = entnahme.zahlungen / p.rentenIntervall;
        reichweiteJahre = tatsaechlich;
        hinweise.push(`Das Kapital ist bereits nach ${tatsaechlich.toFixed(1).replace('.', ',')} Jahren aufgebraucht.`);
      }
    }

    // 4) Jahrestabelle zusammensetzen
    const offset = anspar.rows.length;
    const rows = anspar.rows.concat(
      entnahme.rows.map((r, j) =>
        Object.assign(r, {
          index: offset + j,
          jahr: p.startJahr + offset + j,
        }),
      ),
    );

    return {
      ziel,
      fehler: null,
      hinweise,
      params: p,
      geloest: { feld: ZIELE[ziel].feld, wert: p[ZIELE[ziel].feld] },
      kapitalBedarf: bedarf,
      anspar: {
        sparJahre: anspar.sparJahre,
        ruheJahre: anspar.ruheJahre,
        kapitalSparende: anspar.kapitalSparende,
        kapitalAuszahlbeginn: kapitalStart,
        einzahlungen: anspar.einzahlungen,
        zinsen: anspar.zinsen,
      },
      entnahme: {
        kapitalNachTeilauszahlung: kapitalStart - p.teilauszahlung,
        teilauszahlung: p.teilauszahlung,
        rente: p.rente,
        rentenIntervall: p.rentenIntervall,
        modus: p.entnahmeModus,
        reichweiteJahre,
        endeAlter: Number.isFinite(reichweiteJahre) ? p.auszahlBeginnAlter + reichweiteJahre : Infinity,
        summeAuszahlungen: entnahme.summe,
        zinsen: entnahme.zinsen,
        kapitalEnde: entnahme.kapitalEnde,
        anzeigeJahre: entnahme.rows.length,
      },
      rows,
    };
  }

  return {
    STANDARD,
    ZIELE,
    berechne,
    periodenZins,
    ewigeRente,
    kapitalBedarf,
    simuliereAnspar,
    simuliereEntnahme,
    normalisiere,
  };
});
