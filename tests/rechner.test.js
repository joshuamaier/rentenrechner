'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rechner.js');

const nah = (ist, soll, tol = 0.01) =>
  assert.ok(Math.abs(ist - soll) <= tol, `erwartet ${soll}, erhalten ${ist}`);

const basis = {
  startJahr: 2026,
  alterHeute: 40,
  sparEndeAlter: 65,
  auszahlBeginnAlter: 65,
  anfangskapital: 20000,
  sparrate: 250,
  sparIntervall: 12,
  sparDynamik: 0,
  zinsAnspar: 0.05,
  teilauszahlung: 0,
  zinsEntnahme: 0.03,
  rente: 1000,
  rentenIntervall: 12,
  rentenDynamik: 0,
  entnahmeModus: 'dauer',
  entnahmeDauer: 20,
  restkapital: 0,
  vorschuessig: true,
};

test('Ansparphase jährlich vorschüssig entspricht der Rentenendwertformel', () => {
  const p = { ...basis, sparIntervall: 1, sparrate: 3000 };
  const i = 0.05, n = 25;
  const q = 1 + i;
  const soll = 20000 * q ** n + 3000 * q * (q ** n - 1) / i;
  nah(R.berechne(p, 'rente').anspar.kapitalAuszahlbeginn, soll);
});

test('Ansparphase jährlich nachschüssig entspricht der Rentenendwertformel', () => {
  const p = { ...basis, sparIntervall: 1, sparrate: 3000, vorschuessig: false };
  const q = 1.05, n = 25;
  const soll = 20000 * q ** n + 3000 * (q ** n - 1) / 0.05;
  nah(R.berechne(p, 'rente').anspar.kapitalAuszahlbeginn, soll);
});

test('Monatliche Einzahlung mit konformem Monatszins', () => {
  const p = { ...basis, anfangskapital: 0 };
  const im = 1.05 ** (1 / 12) - 1;
  const n = 25 * 12;
  const soll = 250 * (1 + im) * ((1 + im) ** n - 1) / im;
  nah(R.berechne(p, 'rente').anspar.kapitalAuszahlbeginn, soll);
});

test('Kapitalbedarf entspricht dem Rentenbarwert (jährlich vorschüssig)', () => {
  const p = R.normalisiere({ ...basis, rentenIntervall: 1, rente: 12000 });
  const v = 1 / 1.03, n = 20;
  const soll = 12000 * (1 - v ** n) / (1 - v);
  nah(R.kapitalBedarf(p), soll);
});

test('Rente vorwärts verzehrt das Kapital exakt bis zum Restkapital', () => {
  const e = R.berechne({ ...basis, restkapital: 5000 }, 'rente');
  assert.equal(e.fehler, null);
  nah(e.entnahme.kapitalEnde, 5000);
  assert.equal(e.rows.length, 25 + 20);
  nah(e.rows.at(-1).kapitalEnde, 5000);
});

test('Rückwärts: Sparrate aus Wunschrente ergibt die ursprüngliche Sparrate', () => {
  const vor = R.berechne({ ...basis, teilauszahlung: 15000, rentenDynamik: 0.02 }, 'rente');
  const rueck = R.berechne({ ...basis, teilauszahlung: 15000, rentenDynamik: 0.02, rente: vor.params.rente, sparrate: 1 }, 'sparrate');
  nah(rueck.params.sparrate, 250, 1e-6);
});

test('Rückwärts: Anfangskapital aus Wunschrente', () => {
  const vor = R.berechne(basis, 'rente');
  const rueck = R.berechne({ ...basis, rente: vor.params.rente, anfangskapital: 0 }, 'anfangskapital');
  nah(rueck.params.anfangskapital, 20000, 1e-4);
});

test('Rückwärts: benötigter Zinssatz der Ansparphase', () => {
  const vor = R.berechne({ ...basis, zinsAnspar: 0.0437 }, 'rente');
  const rueck = R.berechne({ ...basis, rente: vor.params.rente, zinsAnspar: 0 }, 'zinsAnspar');
  nah(rueck.params.zinsAnspar, 0.0437, 1e-8);
});

test('Reichweite entspricht der Dauer, für die die Rente berechnet wurde', () => {
  const vor = R.berechne(basis, 'rente');
  const rw = R.berechne({ ...basis, rente: vor.params.rente }, 'reichweite');
  nah(rw.entnahme.reichweiteJahre, 20, 1e-3);
});

test('Reichweite ist unbegrenzt, wenn die Zinsen die Rente decken', () => {
  const rw = R.berechne({ ...basis, rente: 100 }, 'reichweite');
  assert.equal(rw.entnahme.reichweiteJahre, Infinity);
  assert.ok(rw.hinweise.length > 0);
});

test('Ewige Rente: Kapital bleibt nach der Teilauszahlung konstant', () => {
  const e = R.berechne({ ...basis, entnahmeModus: 'ewig', teilauszahlung: 30000 }, 'rente');
  const k = e.anspar.kapitalAuszahlbeginn - 30000;
  for (const r of e.rows.filter((r) => r.phase === 'entnahme')) nah(r.kapitalEnde, k, 1e-4);
  // monatlich vorschüssig: R = K * i_m / (1 + i_m)
  const im = 1.03 ** (1 / 12) - 1;
  nah(e.params.rente, k * im / (1 + im), 1e-6);
});

test('Ewige Rente rückwärts: Kapitalbedarf und Sparrate', () => {
  const vor = R.berechne({ ...basis, entnahmeModus: 'ewig' }, 'rente');
  const rueck = R.berechne({ ...basis, entnahmeModus: 'ewig', rente: vor.params.rente }, 'sparrate');
  nah(rueck.params.sparrate, 250, 1e-6);
});

test('Ruhephase: Kapital wächst ohne Sparbeitrag weiter', () => {
  const e = R.berechne({ ...basis, auszahlBeginnAlter: 67 }, 'rente');
  nah(e.anspar.kapitalAuszahlbeginn, e.anspar.kapitalSparende * 1.05 ** 2);
  assert.deepEqual(e.rows.slice(25, 27).map((r) => r.phase), ['ruhe', 'ruhe']);
});

test('Sparrate wird auf 0 begrenzt, wenn das Ziel schon erreicht ist', () => {
  const e = R.berechne({ ...basis, rente: 10 }, 'sparrate');
  assert.equal(e.params.sparrate, 0);
  assert.ok(e.hinweise.length > 0);
});

test('Fehler bei zu hoher Teilauszahlung und unplausiblen Altersangaben', () => {
  assert.ok(R.berechne({ ...basis, teilauszahlung: 1e9 }, 'rente').fehler);
  assert.ok(R.berechne({ ...basis, sparEndeAlter: 30 }, 'rente').fehler);
  assert.ok(R.berechne({ ...basis, auszahlBeginnAlter: 60 }, 'rente').fehler);
});
