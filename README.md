# Rentenrechner

[![Tests](https://github.com/joshuamaier/rentenrechner/actions/workflows/test.yml/badge.svg)](https://github.com/joshuamaier/rentenrechner/actions/workflows/test.yml)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-b8944a.svg)](LICENSE)

Web-Rechner für die private Altersvorsorge: links die **Ansparphase**, rechts die **Auszahlphase** –
mit Schnellergebnissen, einer Grafik des Kapitalverlaufs und einer Tabelle mit den Werten pro Jahr.
Es kann **vorwärts** (aus dem Sparplan die Rente) und **rückwärts** (aus der Wunschrente den nötigen
Sparplan) gerechnet werden.

**Live ausprobieren:** [joshuamaier.de/blog/rentenrechner.html](https://joshuamaier.de/blog/rentenrechner.html)

![Rentenrechner mit Anspar- und Auszahlphase](docs/screenshot.png)

Reine statische Seite ohne Build-Schritt und ohne externe Abhängigkeiten – `index.html` im Browser
öffnen oder beliebig hosten.

```bash
npm start   # lokaler Server auf http://localhost:8080
npm test    # Tests des Rechenkerns (Node ≥ 18)
```

## In eine andere Seite einbetten

Alle Stile hängen an der Wurzelklasse `.rr`, der Rechner lässt sich deshalb ohne Konflikte in eine
bestehende Seite einsetzen:

1. `css/rentenrechner.css` und die vier Dateien aus `js/` kopieren.
2. Den Inhalt von `<main class="seite rr">` aus `index.html` in ein Element mit der Klasse `rr`
   übernehmen (die IDs der Felder werden vom Skript gebraucht).
3. `rentenrechner.css` einbinden und am Seitenende `rechner.js`, `diagramm.js`, `hinweise.js` und `app.js`
   in dieser Reihenfolge laden.

`css/seite.css` enthält nur Kopf und Fuß der eigenständigen Seite. Die Schrift ist Inter, falls die
Seite sie mitbringt, sonst die Systemschrift. Die Eingaben werden erst nach der ersten Änderung in den
URL-Hash geschrieben (für „Link kopieren“), die Adresse der umgebenden Seite bleibt beim Laden also
unverändert.

## Konzept

### Aufbau der Seite

```
┌──────────────────────────────────────────────────────────────┐
│ Was möchtest du berechnen?         Link kopieren · Reset     │
│ Vorwärts:  [Rente] [Reichweite des Kapitals]                 │
│ Rückwärts: [Sparbeitrag] [Anfangskapital] [Zinssatz]  [Jahr] │
├───────────────────────────┬──────────────────────────────────┤
│ 1 Ansparphase   [Kapital] │ 2 Auszahlphase   [Rente/Alter]   │
│  Alter heute / Sparen bis │  Auszahlung ab Alter / Zinssatz  │
│  Anfangskapital           │  Teilauszahlung / Restkapital    │
│  Sparbeitrag + Rhythmus   │  Art: Kapitalverzehr | Ewig      │
│  Zinssatz / Dynamik       │  Dauer der Auszahlung            │
│                           │  Rente + Rhythmus / Dynamik      │
├───────────────────────────┴──────────────────────────────────┤
│ Ergebnis als Fließtext + Kacheln (Zielgröße hervorgehoben)   │
├──────────────────────────────────────────────────────────────┤
│ Grafik: Kapitalverlauf, Summe Ein-/Auszahlungen, Phasen      │
├──────────────────────────────────────────────────────────────┤
│ Tabelle: Werte pro Jahr (+ CSV-Export)                       │
└──────────────────────────────────────────────────────────────┘
```

Die Kopfzeilen der beiden Phasen zeigen die Hauptergebnisse: das angesparte Kapital und die Rente –
bzw. beim Ziel „Reichweite“ das Alter, bis zu dem die Rente reicht. Darunter wiederholt ein Fließtext
die Eingaben und beschreibt das Ergebnis in Alltagssprache ohne Fachbegriffe, gefolgt von den
Kennzahl-Kacheln. Ist ein Feld ausgeblendet (z. B. Restkapital bei der ewigen Rente), nimmt das
Nachbarfeld die volle Zeilenbreite ein.
Voreingestellt ist eine **ewige Rente** (nur Zinsen werden ausgezahlt).

Das jeweils berechnete Feld wird direkt im Formular als **„berechnet“** markiert (gestrichelter Rahmen)
und ist schreibgeschützt. Beim Wechsel des Rechenziels wird das bisherige Ergebnis zur neuen Eingabe –
wer also zuerst die Rente berechnet und dann auf „Benötigter Sparbeitrag“ klickt, erhält
wieder denselben Sparbeitrag und kann die Wunschrente von dort aus verändern.

### Eingaben

| Ansparphase | Auszahlphase |
|---|---|
| Alter heute, Sparen bis Alter | Auszahlung ab Alter (≥ Sparende; dazwischen Ruhephase) |
| Anfangskapital | Einmalige Teilauszahlung zu Beginn, Restkapital am Ende |
| Sparbeitrag, monatlich / vierteljährlich / jährlich | Zinssatz der Auszahlphase |
| Dynamik des Sparbeitrags (% p.a.) | Art: **Kapitalverzehr** (Dauer) oder **ewige Rente** |
| Zinssatz der Ansparphase | Rente, monatlich / vierteljährlich / jährlich, Dynamik (% p.a.) |

Global: Startjahr (in der Zeile der Rechenziele). Alle Zahlungen sind **nachschüssig**, fallen also am Ende
der Periode an; der Rechenkern unterstützt auch vorschüssig (`vorschuessig: true`), die Oberfläche bietet das
bewusst nicht an. Die Oberfläche spricht Nutzer mit „du“ an.

### Rechenziele

| Ziel | Gegeben | Berechnet |
|---|---|---|
| Rente | Sparplan, Dauer bzw. ewige Rente | Rente |
| Reichweite des Kapitals | Sparplan, Rente | Wie lange das Kapital reicht (oder „unbegrenzt“) |
| Benötigter Sparbeitrag | Wunschrente, übrige Werte | Sparbeitrag |
| Benötigtes Anfangskapital | Wunschrente, übrige Werte | Anfangskapital |
| Benötigter Zinssatz | Wunschrente, übrige Werte | Zinssatz der Ansparphase |

### Plausibilitätshinweise

Eingaben, die rechnerisch möglich, für eine realistische Planung aber fragwürdig sind, werden am Feld
farbig markiert (gelb = ungewöhnlich, rot = unrealistisch/kritisch) und mit einem Kurztext versehen. Im
Ergebnistext steht zusätzlich eine ausführliche Erklärung, warum die Annahme problematisch ist. Geprüft
werden auch berechnete Zielgrößen (z. B. ein benötigter Zinssatz von 14 %). Die Grenzwerte stehen
zentral in `GRENZEN` in `js/hinweise.js`:

| Feld | Gelb | Rot |
|---|---|---|
| Zinssatz Ansparphase | über 7 % oder unter 1 %; über 5 % bei weniger als 10 Jahren Anlagedauer | über 13 % |
| Dynamik Sparbeitrag | über 5 % | über 15 % |
| Auszahlung ab Alter | unter 60 | – |
| Zinssatz Auszahlphase | über 4 %, oder höher als in der Ansparphase | über 6 % |
| Teilauszahlung | mehr als 50 % des Kapitals | – |
| Ende der Rente (Kapitalverzehr/Reichweite) | vor 90 | vor 85 (Lebenserwartung) |
| Dynamik der Rente | über 3 %; 0 % bei 20 Jahren und mehr (Kaufkraftverlust) | über 6 % |

### Rechenmodell

- Simulation in **Monatsschritten** mit dem **konformen Monatszins** `iₘ = (1 + p)^(1/12) − 1`;
  der eingegebene Zinssatz entspricht damit der effektiven Jahresrendite, unabhängig vom Rhythmus.
- **Ruhephase:** Liegt der Auszahlbeginn nach dem Sparende, wächst das Kapital ohne Beiträge mit dem
  Zinssatz der Ansparphase weiter.
- **Teilauszahlung:** wird zu Beginn der Auszahlphase vor der ersten Rente entnommen.
- **Kapitalverzehr:** Die Rente wird so bestimmt, dass nach der Auszahldauer genau das gewünschte
  Restkapital übrig bleibt (bei Rentendynamik steigt die Rate jährlich).
- **Ewige Rente:** Es wird nur der Zinsertrag ausgezahlt, das Kapital bleibt konstant:
  `R = K · iₚ` (nachschüssig, Standard) bzw. `R = K · iₚ / (1 + iₚ)` (vorschüssig) mit dem Periodenzins `iₚ`.
- **Rückwärtsrechnung:** Zuerst wird der Kapitalbedarf zu Auszahlbeginn ermittelt (Barwert der
  Renten + Teilauszahlung + abgezinstes Restkapital). Sparbeitrag und Anfangskapital gehen linear ein
  und werden exakt gelöst, der Zinssatz per Bisektion.
- Nicht berücksichtigt: Steuern, Sozialabgaben, Kosten, Inflation (die Rentendynamik kann als
  Inflationsausgleich genutzt werden).

### Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur |
| `css/rentenrechner.css` | Gestaltung des Rechners inkl. Mobilansicht, alles unter `.rr` |
| `css/seite.css` | Kopf und Fuß der eigenständigen Seite |
| `js/rechner.js` | Rechenkern (ohne DOM, in Browser und Node nutzbar) |
| `js/diagramm.js` | SVG-Grafik mit Tooltip |
| `js/hinweise.js` | Plausibilitätshinweise mit Grenzwerten (ohne DOM, in Browser und Node nutzbar) |
| `js/app.js` | Formular, Ergebnisse, Tabelle, CSV-Export, Link-Teilen (Werte im URL-Hash) |
| `tests/rechner.test.js` | Tests gegen Barwert-/Endwertformeln und Hin-/Rückrechnung |
| `tests/hinweise.test.js` | Tests der Plausibilitätshinweise |

## Lizenz

[MIT](LICENSE) © Joshua Maier. Modellrechnung ohne Gewähr, keine Anlageberatung.
