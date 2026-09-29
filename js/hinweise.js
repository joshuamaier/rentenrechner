/*
 * Plausibilitätshinweise zum Rentenrechner.
 *
 * Prüft ein Rechenergebnis (Rentenrechner.berechne) auf Eingaben, die zwar rechnerisch
 * möglich, aber für eine realistische Planung fragwürdig sind – etwa sehr hohe Renditen
 * oder eine Rente, die vor der Lebenserwartung endet. Reine Funktionen ohne DOM-Zugriff,
 * im Browser als window.Hinweise und in Node per require nutzbar.
 *
 * Jeder Hinweis: { feld, stufe, kurz, titel, text }
 *  - feld:  Eingabefeld, das markiert wird (data-feld)
 *  - stufe: 'hinweis' (ungewöhnlich) oder 'warnung' (unrealistisch/kritisch)
 *  - kurz:  Kurztext direkt am Eingabefeld
 *  - titel, text: ausführliche Erklärung für den Ergebnistext
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Hinweise = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Grenzwerte (Dezimalzahlen: 0.07 = 7 %)
  const GRENZEN = {
    zinsAnsparNiedrig: 0.01,       // darunter: Geld wächst real nicht
    zinsAnsparHoch: 0.07,          // darüber: nur mit hohem Aktienanteil
    zinsAnsparUnrealistisch: 0.13, // darüber: langfristig unrealistisch
    kurzeAnlageJahre: 10,          // kürzere Anlagedauer ...
    kurzeAnlageZins: 0.05,         // ... mit mehr Rendite ist riskant
    sparDynamikHoch: 0.05,         // Löhne steigen im Schnitt um 2–3 %
    sparDynamikUnrealistisch: 0.15,
    fruehrenteAlter: 60,           // gesetzliche Altersrente frühestens mit 63
    zinsEntnahmeHoch: 0.04,        // im Ruhestand eher risikoarm anlegen
    zinsEntnahmeKritisch: 0.06,
    lebenserwartungAlter: 85,      // Durchschnitt für 65-Jährige: Männer ~83, Frauen ~86
    sicheresEndeAlter: 90,         // viele werden deutlich älter als der Durchschnitt
    rentenDynamikHoch: 0.03,       // Inflationsziel der EZB: 2 %
    rentenDynamikUnrealistisch: 0.06,
    inflation: 0.02,
    kaufkraftAbJahren: 20,         // ohne Dynamik spürbarer Kaufkraftverlust
    teilauszahlungAnteil: 0.5,
  };

  const f0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const f1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  const fP = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const euro = (v) => `${f0.format(v)} €`;
  const pz = (v) => `${fP.format(v * 100)} %`;
  const EPS = 1e-9;

  function pruefe(erg) {
    if (!erg || erg.fehler) return [];
    const p = erg.params;
    const a = erg.anspar;
    const e = erg.entnahme;
    const liste = [];
    const neu = (feld, stufe, kurz, titel, text) => liste.push({ feld, stufe, kurz, titel, text });

    // ---------- Ansparphase ----------
    const anlageJahre = a.sparJahre + a.ruheJahre;
    if (anlageJahre > 0) {
      const z = p.zinsAnspar;
      if (z > GRENZEN.zinsAnsparUnrealistisch + EPS) {
        neu('zinsAnspar', 'warnung', 'Unrealistisch hoch – so viel bringt kaum eine Anlage dauerhaft',
          'Die Rendite beim Sparen ist unrealistisch hoch',
          `${pz(z)} pro Jahr über ${anlageJahre} Jahre hat kaum eine Geldanlage je geschafft. Selbst ein weltweit breit ` +
          'gestreuter Aktienfonds kam langfristig auf etwa 6 bis 8 % pro Jahr – vor Kosten und Steuern und mit ' +
          'zwischenzeitlichen Einbrüchen von 30 % und mehr. Mit dieser Annahme wird dein späteres Vermögen deutlich ' +
          'überschätzt. Rechne lieber mit 4 bis 6 %.');
      } else if (z > GRENZEN.zinsAnsparHoch + EPS) {
        neu('zinsAnspar', 'hinweis', 'Sehr hoch – nur mit hohem Aktienanteil erreichbar',
          'Die Rendite beim Sparen ist sehr hoch angesetzt',
          `${pz(z)} pro Jahr sind nur mit einem hohen Aktienanteil über viele Jahre erreichbar – und selbst dann eher ` +
          'das obere Ende. Unterwegs schwankt der Wert stark. Für eine vorsichtige Planung sind 4 bis 6 % üblich; ' +
          'probier ruhig aus, wie sich das Ergebnis damit verändert.');
      } else if (z < GRENZEN.zinsAnsparNiedrig - EPS) {
        neu('zinsAnspar', 'hinweis', 'Sehr niedrig – nach Inflation schrumpft dein Geld',
          'Die Rendite beim Sparen ist sehr niedrig',
          `Bei ${pz(z)} pro Jahr wächst dein Geld kaum. Weil die Preise im Schnitt um rund 2 % pro Jahr steigen, ` +
          'verliert es real sogar an Wert. Je nach Zinsumfeld bringen schon Tagesgeld oder Anleihen mehr, ' +
          'breit gestreute Aktienfonds bieten langfristig deutlich höhere Chancen.');
      }
      if (anlageJahre < GRENZEN.kurzeAnlageJahre && z > GRENZEN.kurzeAnlageZins + EPS &&
          z <= GRENZEN.zinsAnsparUnrealistisch + EPS) {
        neu('zinsAnspar', 'hinweis', `Riskant bei nur ${anlageJahre} ${anlageJahre === 1 ? 'Jahr' : 'Jahren'} Anlagedauer`,
          'Hohe Rendite bei kurzer Anlagedauer',
          `Bis zum Rentenbeginn bleiben nur ${anlageJahre} ${anlageJahre === 1 ? 'Jahr' : 'Jahre'}. Renditen über 5 % ` +
          'gibt es nur mit Aktien, und die können in wenigen Jahren auch deutlich im Minus liegen. Wenn du das Geld ' +
          'zu einem festen Zeitpunkt brauchst, rechne bei so kurzer Zeit lieber mit 2 bis 4 %.');
      }
    }

    if (a.sparJahre > 1 && p.sparrate > 0 && p.sparDynamik > GRENZEN.sparDynamikHoch + EPS) {
      const faktor = Math.pow(1 + p.sparDynamik, a.sparJahre - 1);
      const letzte = p.sparrate * faktor;
      if (p.sparDynamik > GRENZEN.sparDynamikUnrealistisch + EPS) {
        neu('sparDynamik', 'warnung', `Kaum durchzuhalten – der Beitrag steigt auf ${euro(letzte)}`,
          'Der Sparbeitrag steigt unrealistisch stark',
          `Mit ${pz(p.sparDynamik)} Steigerung pro Jahr wächst dein Sparbeitrag von ${euro(p.sparrate)} auf ` +
          `${euro(letzte)} im letzten Sparjahr – das ${f1.format(faktor)}-Fache. So stark steigt kein Einkommen über ` +
          'lange Zeit. Löhne wachsen im Schnitt um etwa 2 bis 3 % pro Jahr; eine Dynamik in dieser Größenordnung ist ' +
          'realistischer.');
      } else {
        neu('sparDynamik', 'hinweis', `Ehrgeizig – der Beitrag steigt auf ${euro(letzte)}`,
          'Der Sparbeitrag steigt stark',
          `Mit ${pz(p.sparDynamik)} Steigerung pro Jahr wächst dein Sparbeitrag von ${euro(p.sparrate)} auf ` +
          `${euro(letzte)} im letzten Sparjahr. Das klappt nur, wenn dein Einkommen ähnlich stark wächst. Üblich sind ` +
          '2 bis 3 % pro Jahr, etwa im Takt der Lohnentwicklung.');
      }
    }

    // ---------- Auszahlphase ----------
    if (p.auszahlBeginnAlter < GRENZEN.fruehrenteAlter) {
      neu('auszahlBeginnAlter', 'hinweis', 'Sehr früher Rentenbeginn', 'Sehr früher Rentenbeginn',
        `Ab ${p.auszahlBeginnAlter} muss dein Vermögen sehr lange reichen. Die gesetzliche Altersrente gibt es ` +
        'frühestens mit 63 Jahren und dann nur mit Abschlägen. Bis dahin musst du deinen Lebensunterhalt – ' +
        'einschließlich der Krankenversicherung – vollständig selbst bezahlen.');
    }

    const ze = p.zinsEntnahme;
    if (ze > GRENZEN.zinsEntnahmeKritisch + EPS) {
      neu('zinsEntnahme', 'warnung', 'Kritisch – im Ruhestand eher sicher anlegen',
        'Die Rendite im Ruhestand ist kritisch hoch',
        `${pz(ze)} pro Jahr sind nur mit einem hohen Aktienanteil möglich. Im Ruhestand ist das riskant: Fallen die ` +
        'Kurse kurz nach Rentenbeginn stark, musst du für deine Rente Anteile zu schlechten Preisen verkaufen – ' +
        'das Geld ist dann schneller aufgebraucht als geplant. Für eine eher sichere Anlage im Alter sind 2 bis 4 % ' +
        'eine übliche Annahme.');
    } else if (ze > GRENZEN.zinsEntnahmeHoch + EPS) {
      neu('zinsEntnahme', 'hinweis', 'Eher hoch für den Ruhestand', 'Die Rendite im Ruhestand ist eher hoch',
        `${pz(ze)} pro Jahr setzen einen spürbaren Aktienanteil voraus. Im Ruhestand wird das Geld meist vorsichtiger ` +
        'angelegt, weil keine Zeit mehr bleibt, Kursverluste auszusitzen. Mit 2 bis 4 % planst du auf der sicheren Seite.');
    } else if (anlageJahre > 0 && ze > p.zinsAnspar + EPS && ze > GRENZEN.inflation + EPS) {
      neu('zinsEntnahme', 'hinweis', 'Höher als beim Sparen', 'Im Ruhestand mehr Rendite als beim Sparen',
        `Du rechnest in der Rentenphase mit mehr Ertrag (${pz(ze)}) als beim Sparen (${pz(p.zinsAnspar)}). ` +
        'Normalerweise ist es umgekehrt: Im Alter wird risikoärmer angelegt, und das bringt weniger.');
    }

    if (p.teilauszahlung > 0 && a.kapitalAuszahlbeginn > 0 &&
        p.teilauszahlung / a.kapitalAuszahlbeginn > GRENZEN.teilauszahlungAnteil + EPS) {
      const anteil = p.teilauszahlung / a.kapitalAuszahlbeginn;
      neu('teilauszahlung', 'hinweis', `${f0.format(anteil * 100)} % deines Vermögens auf einmal`,
        'Große Teilauszahlung',
        `Du entnimmst zu Rentenbeginn ${f0.format(anteil * 100)} % deines Vermögens auf einmal. Für die laufende Rente ` +
        `bleiben dann nur ${euro(e.kapitalNachTeilauszahlung)}. Überlege, ob die Summe in dieser Höhe wirklich nötig ist.`);
    }

    // Ende der Rente im Vergleich zur Lebenserwartung (nicht bei ewiger Rente)
    if (Number.isFinite(e.reichweiteJahre)) {
      const jahre = Math.floor(Math.round(e.reichweiteJahre * 12) / 12);
      const ende = p.auszahlBeginnAlter + jahre;
      if (ende < GRENZEN.lebenserwartungAlter) {
        neu('entnahmeDauer', 'warnung', `Endet mit ${ende} – vor der Lebenserwartung`,
          'Die Rente endet vor der durchschnittlichen Lebenserwartung',
          `Deine Rente endet mit ${ende} Jahren. Wer 65 wird, lebt in Deutschland im Schnitt noch etwa 18 (Männer) ` +
          'bzw. 21 Jahre (Frauen) – also bis etwa 83 bzw. 86. Danach fehlt dir dieses Geld, und zwar umso länger, je ' +
          'älter du wirst. Plane die Auszahlung besser bis mindestens 90 – oder wähle die ewige Rente, bei der das ' +
          'Vermögen erhalten bleibt.');
      } else if (ende < GRENZEN.sicheresEndeAlter) {
        neu('entnahmeDauer', 'hinweis', `Endet mit ${ende} – viele werden älter`, 'Die Rente endet recht früh',
          `Deine Rente endet mit ${ende} Jahren. Die Hälfte der Menschen lebt länger als der Durchschnitt, und viele ` +
          'werden über 90. Endet die Rente vorher, trägst du das Risiko, dass das Geld zu früh aufgebraucht ist. ' +
          'Für eine sichere Planung rechne bis 90 oder 95.');
      }
    }

    // Rentendynamik (nur wenn die Rente über die Zeit steigen kann)
    if (e.modus !== 'ewig' || erg.ziel === 'reichweite') {
      const jahre = Number.isFinite(e.reichweiteJahre) ? Math.max(1, Math.round(e.reichweiteJahre)) : e.anzeigeJahre;
      const letzte = p.rente * Math.pow(1 + p.rentenDynamik, Math.max(0, jahre - 1));
      if (p.rentenDynamik > GRENZEN.rentenDynamikUnrealistisch + EPS) {
        neu('rentenDynamik', 'warnung', `Unrealistisch – die Rente steigt auf ${euro(letzte)}`,
          'Die Rente steigt unrealistisch stark',
          `Mit ${pz(p.rentenDynamik)} Steigerung pro Jahr wächst deine Rente von ${euro(p.rente)} auf ${euro(letzte)} ` +
          'im letzten Jahr. Das ist weit mehr als der Ausgleich der Inflation (Ziel der Europäischen Zentralbank: 2 % ' +
          'pro Jahr). Damit das Geld reicht, fällt die Rente am Anfang entsprechend klein aus.');
      } else if (p.rentenDynamik > GRENZEN.rentenDynamikHoch + EPS) {
        neu('rentenDynamik', 'hinweis', 'Hoch – mehr als der Inflationsausgleich', 'Die Rente steigt stark',
          `Um die Kaufkraft zu erhalten, reicht meist eine Steigerung im Rahmen der Inflation, also etwa 2 % pro Jahr. ` +
          `Mit ${pz(p.rentenDynamik)} steigt deine Rente auf ${euro(letzte)} im letzten Jahr – dafür startet sie niedriger.`);
      } else if (p.rentenDynamik <= EPS && Number.isFinite(e.reichweiteJahre) && jahre >= GRENZEN.kaufkraftAbJahren) {
        const real = p.rente / Math.pow(1 + GRENZEN.inflation, jahre - 1);
        neu('rentenDynamik', 'hinweis', 'Ohne Steigerung sinkt die Kaufkraft', 'Die Rente verliert an Kaufkraft',
          `Deine Rente bleibt ${jahre} Jahre lang gleich hoch. Steigen die Preise um 2 % pro Jahr, kannst du dir mit ` +
          `${euro(p.rente)} im letzten Jahr nur noch so viel kaufen wie zu Rentenbeginn mit ${euro(real)}. ` +
          'Mit einer Dynamik von etwa 2 % gleichst du das aus.');
      }
    }

    // Warnungen zuerst
    return liste.sort((x, y) => (x.stufe === y.stufe ? 0 : x.stufe === 'warnung' ? -1 : 1));
  }

  return { GRENZEN, pruefe };
});
