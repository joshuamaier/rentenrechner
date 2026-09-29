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

1. `css/rentenrechner.css` und die drei Dateien aus `js/` kopieren.
2. Den Inhalt von `<main class="seite rr">` aus `index.html` in ein Element mit der Klasse `rr`
   übernehmen (die IDs der Felder werden vom Skript gebraucht).
3. `rentenrechner.css` einbinden und am Seitenende `rechner.js`, `diagramm.js` und `app.js` in dieser
   Reihenfolge laden.

`css/seite.css` enthält nur Kopf und Fuß der eigenständigen Seite. Die Schrift ist Inter, falls die
Seite sie mitbringt, sonst die Systemschrift. Die Eingaben werden erst nach der ersten Änderung in den
URL-Hash geschrieben (für „Link kopieren“), die Adresse der umgebenden Seite bleibt beim Laden also
unverändert.

## Konzept

### Aufbau der Seite

```
┌──────────────────────────────────────────────────────────────┐
│ Was möchten Sie berechnen?                                   │
│ Vorwärts:  [Mögliche Rente] [Reichweite des Kapitals]        │
│ Rückwärts: [Sparbeitrag] [Anfangskapital] [Zinssatz]         │
│ Zahlungen vor-/nachschüssig · Startjahr · Link · Reset       │
├───────────────────────────┬──────────────────────────────────┤
│ 1 Ansparphase             │ 2 Auszahlphase                   │
│  Alter heute / Sparen bis │  Auszahlung ab Alter / Zinssatz  │
│  Anfangskapital           │  Einmalige Teilauszahlung        │
│  Sparbeitrag + Rhythmus   │  Kapitalverzehr | Ewige Rente    │
│  Zinssatz / Dynamik       │  Dauer / Restkapital             │
│                           │  Rente + Rhythmus / Dynamik      │
├───────────────────────────┴──────────────────────────────────┤
│ Ergebnis-Kacheln (Zielgröße hervorgehoben)                   │
├──────────────────────────────────────────────────────────────┤
│ Grafik: Kapitalverlauf, Summe Ein-/Auszahlungen, Phasen      │
├──────────────────────────────────────────────────────────────┤
│ Tabelle: Werte pro Jahr (+ CSV-Export)                       │
└──────────────────────────────────────────────────────────────┘
```

Das jeweils berechnete Feld wird direkt im Formular als **„berechnet“** markiert (gestrichelter Rahmen)
und ist schreibgeschützt. Beim Wechsel des Rechenziels wird das bisherige Ergebnis zur neuen Eingabe –
wer also zuerst die mögliche Rente berechnet und dann auf „Benötigter Sparbeitrag“ klickt, erhält
wieder denselben Sparbeitrag und kann die Wunschrente von dort aus verändern.

### Eingaben

| Ansparphase | Auszahlphase |
|---|---|
| Alter heute, Sparen bis Alter | Auszahlung ab Alter (≥ Sparende; dazwischen Ruhephase) |
| Anfangskapital | Einmalige Teilauszahlung zu Beginn |
| Sparbeitrag, monatlich / vierteljährlich / jährlich | Zinssatz der Auszahlphase |
| Dynamik des Sparbeitrags (% p.a.) | Art: **Kapitalverzehr** (Dauer + Restkapital) oder **ewige Rente** |
| Zinssatz der Ansparphase | Rente, monatlich / vierteljährlich / jährlich, Dynamik (% p.a.) |

Global: Zahlungen vorschüssig (Periodenbeginn) oder nachschüssig (Periodenende), Startjahr.

### Rechenziele

| Ziel | Gegeben | Berechnet |
|---|---|---|
| Mögliche Rente | Sparplan, Dauer bzw. ewige Rente | Rente |
| Reichweite des Kapitals | Sparplan, Rente | Wie lange das Kapital reicht (oder „unbegrenzt“) |
| Benötigter Sparbeitrag | Wunschrente, übrige Werte | Sparbeitrag |
| Benötigtes Anfangskapital | Wunschrente, übrige Werte | Anfangskapital |
| Benötigter Zinssatz | Wunschrente, übrige Werte | Zinssatz der Ansparphase |

### Rechenmodell

- Simulation in **Monatsschritten** mit dem **konformen Monatszins** `iₘ = (1 + p)^(1/12) − 1`;
  der eingegebene Zinssatz entspricht damit der effektiven Jahresrendite, unabhängig vom Rhythmus.
- **Ruhephase:** Liegt der Auszahlbeginn nach dem Sparende, wächst das Kapital ohne Beiträge mit dem
  Zinssatz der Ansparphase weiter.
- **Teilauszahlung:** wird zu Beginn der Auszahlphase vor der ersten Rente entnommen.
- **Kapitalverzehr:** Die Rente wird so bestimmt, dass nach der Auszahldauer genau das gewünschte
  Restkapital übrig bleibt (bei Rentendynamik steigt die Rate jährlich).
- **Ewige Rente:** Es wird nur der Zinsertrag ausgezahlt, das Kapital bleibt konstant:
  `R = K · iₚ` (nachschüssig) bzw. `R = K · iₚ / (1 + iₚ)` (vorschüssig) mit dem Periodenzins `iₚ`.
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
| `js/app.js` | Formular, Ergebnisse, Tabelle, CSV-Export, Link-Teilen (Werte im URL-Hash) |
| `tests/rechner.test.js` | Tests gegen Barwert-/Endwertformeln und Hin-/Rückrechnung |

## Lizenz

[MIT](LICENSE) © Joshua Maier. Modellrechnung ohne Gewähr, keine Anlageberatung.
