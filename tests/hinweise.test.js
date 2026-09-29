'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rechner.js');
const H = require('../js/hinweise.js');

const standard = { ...R.STANDARD, startJahr: 2026 };
const pruefe = (aenderung, ziel = 'rente') => H.pruefe(R.berechne({ ...standard, ...aenderung }, ziel));
const zu = (liste, feld) => liste.filter((h) => h.feld === feld);

test('Voreinstellungen erzeugen keine Hinweise (ewige Rente und Kapitalverzehr mit Dynamik)', () => {
  assert.deepEqual(pruefe({}), []);
  assert.deepEqual(pruefe({ entnahmeModus: 'dauer', rentenDynamik: 0.02 }), []);
});

test('Rendite in der Ansparphase: sehr hoch ab 7 %, unrealistisch ab 13 %, sehr niedrig unter 1 %', () => {
  assert.deepEqual(zu(pruefe({ zinsAnspar: 0.07 }), 'zinsAnspar'), []);
  assert.equal(zu(pruefe({ zinsAnspar: 0.08 }), 'zinsAnspar')[0].stufe, 'hinweis');
  assert.equal(zu(pruefe({ zinsAnspar: 0.14 }), 'zinsAnspar')[0].stufe, 'warnung');
  assert.equal(zu(pruefe({ zinsAnspar: 0.005 }), 'zinsAnspar')[0].stufe, 'hinweis');
});

test('Hohe Rendite bei kurzer Anlagedauer', () => {
  const h = zu(pruefe({ alterHeute: 60, zinsAnspar: 0.06 }), 'zinsAnspar');
  assert.equal(h.length, 1);
  assert.match(h[0].kurz, /7 Jahren/);
});

test('Dynamik des Sparbeitrags: ehrgeizig ab 5 %, kaum durchzuhalten ab 15 %', () => {
  assert.deepEqual(zu(pruefe({ sparDynamik: 0.03 }), 'sparDynamik'), []);
  assert.equal(zu(pruefe({ sparDynamik: 0.08 }), 'sparDynamik')[0].stufe, 'hinweis');
  const w = zu(pruefe({ sparDynamik: 0.2 }), 'sparDynamik')[0];
  assert.equal(w.stufe, 'warnung');
  assert.match(w.text, /-Fache/);
});

test('Rendite im Ruhestand: eher hoch ab 4 %, kritisch ab 6 %, Hinweis wenn höher als beim Sparen', () => {
  assert.equal(zu(pruefe({ zinsEntnahme: 0.05 }), 'zinsEntnahme')[0].stufe, 'hinweis');
  assert.equal(zu(pruefe({ zinsEntnahme: 0.065 }), 'zinsEntnahme')[0].stufe, 'warnung');
  assert.match(zu(pruefe({ zinsAnspar: 0.025, zinsEntnahme: 0.035 }), 'zinsEntnahme')[0].titel, /mehr Rendite/);
});

test('Ende der Rente vor der Lebenserwartung', () => {
  const dauer = (n) => zu(pruefe({ entnahmeModus: 'dauer', rentenDynamik: 0.02, entnahmeDauer: n }), 'entnahmeDauer');
  assert.equal(dauer(15)[0].stufe, 'warnung'); // bis 82
  assert.equal(dauer(20)[0].stufe, 'hinweis'); // bis 87
  assert.deepEqual(dauer(23), []); // bis 90
  // Reichweite: 3.000 € monatlich reichen nur rund 13 Jahre
  const r = zu(pruefe({ rente: 3000 }, 'reichweite'), 'entnahmeDauer');
  assert.equal(r[0].stufe, 'warnung');
});

test('Rentendynamik: stark ab 3 %, unrealistisch ab 6 %, Kaufkraftverlust ohne Dynamik', () => {
  const dyn = (d) => zu(pruefe({ entnahmeModus: 'dauer', rentenDynamik: d }), 'rentenDynamik');
  assert.equal(dyn(0.04)[0].stufe, 'hinweis');
  assert.equal(dyn(0.07)[0].stufe, 'warnung');
  assert.match(dyn(0)[0].titel, /Kaufkraft/);
  // Bei der ewigen Rente gibt es keine Dynamik
  assert.deepEqual(zu(pruefe({ rentenDynamik: 0.07 }), 'rentenDynamik'), []);
});

test('Früher Rentenbeginn und große Teilauszahlung', () => {
  assert.equal(zu(pruefe({ sparEndeAlter: 55, auszahlBeginnAlter: 55 }), 'auszahlBeginnAlter').length, 1);
  assert.equal(zu(pruefe({ teilauszahlung: 250000 }), 'teilauszahlung').length, 1);
  assert.deepEqual(zu(pruefe({ teilauszahlung: 100000 }), 'teilauszahlung'), []);
});

test('Berechnete Zielgrößen werden ebenfalls geprüft und Warnungen stehen vorn', () => {
  const liste = pruefe({ rente: 10000, zinsEntnahme: 0.05 }, 'zinsAnspar'); // braucht rund 14 %
  assert.equal(liste[0].stufe, 'warnung');
  assert.equal(liste[0].feld, 'zinsAnspar');
  assert.ok(liste.some((h) => h.feld === 'zinsEntnahme' && h.stufe === 'hinweis'));
});

test('Bei Fehlern keine Hinweise', () => {
  assert.deepEqual(H.pruefe({ fehler: 'x' }), []);
  assert.deepEqual(H.pruefe(null), []);
});
