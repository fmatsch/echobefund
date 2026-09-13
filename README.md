# Echobefund

Desktop-App (macOS, Windows) zur Erstellung von Echokardiographie-Befunden:
Messwerte eingeben → automatische Graduierung anhand editierbarer Normwerte →
Befundtext aus editierbaren Textbausteinen → Zwischenablage, PDF oder Druck.

**Funktionen im Überblick**
- Automatische Graduierung nach editierbaren Normwerten, diastolische Funktion nach ASE/EACVI 2016
- Quantifizierung von Mitral-, Aorten- und Trikuspidalinsuffizienz (EROA, RVol, Vena contracta, PHT), GLS, RV-FAC
- Befundtext mit automatischer **Beurteilung** der auffälligen Befunde
- **Vergleich mit dem Vorbefund** aus dem Archiv (frühere Werte neben den Messfeldern, Verlaufssatz im Befund)
- **Schnellvorlagen** (z. B. Normalbefund, eigene Vorlagen)
- Zusatzmodule **Stressecho** und **TEE**
- **DICOM-SR-Import** von Messwerten des Echogeräts mit Einheitenumrechnung und gemerkten Zuordnungen
- GDT-Anbindung an Praxissoftware (z. B. EOSWIN) mit Verbindungsampel
- Lokales Archiv, PDF, Druck, **gemeinsames Profil** für mehrere Arbeitsplätze, Hinweis auf neue Versionen

**Webseite:** https://fmatsch.github.io/echobefund/

## Download

| System | Datei |
| --- | --- |
| macOS (Intel & Apple Silicon) | [Echobefund-mac-universal.zip](https://github.com/fmatsch/echobefund/releases/latest/download/Echobefund-mac-universal.zip) |
| Windows (64 Bit, ohne Installation) | [Echobefund-windows-portable.exe](https://github.com/fmatsch/echobefund/releases/latest/download/Echobefund-windows-portable.exe) |

Alle Versionen: [Releases](https://github.com/fmatsch/echobefund/releases)

> **Medizinischer Hinweis:** Die mitgelieferten Grenzwerte orientieren sich an den
> ASE/EACVI-Empfehlungen (Lang 2015, Baumgartner 2017, Nagueh 2016, ESC/ERS 2022).
> Einige Abstufungen sind Vorschläge (in den Einstellungen gekennzeichnet).
> Alle Grenzwerte und Textbausteine müssen vor dem klinischen Einsatz vom
> verantwortlichen Arzt geprüft werden. Die App ist kein Medizinprodukt.

## Entwicklung

Voraussetzung: [Node.js](https://nodejs.org) ≥ 20.

```bash
npm install
npm start      # App starten
npm test       # Tests für Berechnungen und Befundtext
```

## Programme bauen

```bash
npm run dist       # beides (funktioniert auf dem Mac, kein Wine nötig)
npm run dist:mac   # dist/Echobefund-mac-universal.zip    → enthält Echobefund.app (Intel + Apple Silicon)
npm run dist:win   # dist/Echobefund-windows-portable.exe → startet direkt, keine Installation
npm run icon       # build/icon.png aus build/icon.svg neu erzeugen
```

Die Programme sind nicht signiert:
- **macOS:** ZIP entpacken, `Echobefund.app` nach „Programme“ ziehen, beim ersten Start Rechtsklick → „Öffnen“.
  Falls „beschädigt“ gemeldet wird: `xattr -cr /Applications/Echobefund.app`
- **Windows:** SmartScreen → „Weitere Informationen“ → „Trotzdem ausführen“.
  Die portable .exe entpackt sich bei jedem Start kurz in einen Temp-Ordner (Start dauert 2–5 s).

## Anbindung an EOSWIN (GDT 2.1)

📘 **Ausführliche Anleitung für die Praxis (ohne Vorkenntnisse):** https://fmatsch.github.io/echobefund/anleitung/

Echobefund arbeitet als GDT-Gerät: EOSWIN legt einen Auftrag mit den Patientendaten im
Austauschordner ab und startet Echobefund; der fertige Befund geht per Klick zurück in die Kartei.

1. **Echobefund:** Einstellungen → „Praxissoftware (GDT)“
   - Anbindung aktivieren, Austauschordner wählen (z. B. `C:\GDT` oder `\\SERVER\GDT`) → „Testen“
   - Kennungen übernehmen oder an EOSWIN anpassen (Standard: GDT-IDs `ECHOBEF`/`EOSWIN`, Dateikürzel `ECHO`/`EOSW`)
2. **EOSWIN:** ein GDT-Gerät anlegen (Bezeichnung z. B. „Echokardiographie“) mit
   - demselben Austauschordner
   - Exportdatei (EOSWIN → Echobefund): `ECHOEOSW.GDT`
   - Importdatei (Echobefund → EOSWIN): `EOSWECHO.GDT`
   - Programmaufruf: Pfad zu `Echobefund-x.y.z-portable.exe`
   - Satzart für den Aufruf: 6302 (Neue Untersuchung) oder 6301 (Stammdaten)
   - Zeichensatz: wie in EOSWIN eingestellt; Echobefund antwortet automatisch im Zeichensatz des Auftrags
3. **Ablauf:** In der Kartei das Gerät aufrufen → Echobefund zeigt den Patienten → befunden →
   „An EOSWIN senden“ → EOSWIN übernimmt den Text (Feld 6228, max. 60 Zeichen/Zeile) in die Kartei.

Details: Aufträge werden nach dem Lesen gelöscht (GDT-Vorgabe). Eine noch nicht abgeholte
Befunddatei wird nie überschrieben. Optional: Messwerte einzeln (8410/8420/8421) und PDF-Befund
mit Verweis (6302–6305). Kommt ein Auftrag bei ungespeicherten Änderungen, erscheint ein Hinweisbalken.
Satzart 6311 („Untersuchung zeigen“) öffnet das Archiv gefiltert auf die Patientennummer.

Die genauen Menüpunkte und Feldnamen in EOSWIN können abweichen – im Zweifel den MCW-Support
nach „GDT-Geräteanbindung“ fragen und die Kennungen von oben durchgeben.

## Neue Version veröffentlichen

Gebaut und hochgeladen wird auf GitHub – große Uploads vom eigenen Rechner sind nicht nötig.

1. Version in `package.json` erhöhen (z. B. `0.3.0`), committen und pushen.
2. GitHub → **Actions** → **Release bauen und veröffentlichen** → **Run workflow**.
3. Tag eintragen (`v` + Version, z. B. `v0.3.0`) und kurz beschreiben, was neu ist.

Der Workflow führt die Tests aus, baut macOS-App und Windows-EXE, prüft Signatur und Architekturen,
erzeugt `SHA256SUMS.txt` und veröffentlicht das Release. Die Download-Links auf der Webseite zeigen
automatisch auf die neueste Version.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/shared/schema.js` | Messwerte und Beurteilungsfelder (Formular-Definition) |
| `src/shared/defaults.js` | Standard-Normwerte und Textbausteine |
| `src/shared/calc.js` | KOF, LV-Masse, AÖF, SV/HZV, RAP, sPAP … |
| `src/shared/report.js` | Automatische Bewertung, Diastolik-Algorithmus, Befundtext, Beurteilung, Verlaufsvergleich |
| `src/shared/srmap.js` | DICOM-SR: Einheiten umrechnen, Zuordnungsvorschläge |
| `src/main/dicomsr.js` | DICOM-SR-Leser (Explicit/Implicit VR, Deflated) |
| `src/main/gdt.js` | GDT 2.1: Zeichensätze, Sätze, Dateinamen, Verbindungsstatus |
| `src/main/` | Electron-Hauptprozess: Einstellungen, Archiv, PDF, Druck |
| `src/renderer/` | Oberfläche |

## Daten

- Einstellungen: `settings.json` im App-Datenordner
  (macOS `~/Library/Application Support/Echobefund`, Windows `%APPDATA%\Echobefund`).
- Archiv: ein JSON pro Befund in `archiv/` im selben Ordner oder in einem in den Einstellungen gewählten Ordner.
  Gelöschte Befunde landen im Papierkorb.
- Die Daten sind **nicht** von der App verschlüsselt. Bitte FileVault (macOS) oder BitLocker (Windows) aktivieren
  und das Archiv in das Backup-Konzept der Praxis aufnehmen (DSGVO).
- Einstellungen lassen sich exportieren und importieren, z. B. für einen zweiten Arbeitsplatz.
- **Mehrere Arbeitsplätze:** Unter Einstellungen → „Mehrplatz & Updates“ kann ein gemeinsames Profil
  (`echobefund-profil.json`, z. B. auf dem Praxis-Server) verbunden werden. Es enthält Befund-Optionen, Normwerte,
  Textbausteine, Vorlagen und DICOM-Zuordnungen; GDT, Archiv-Ordner und Update-Einstellung bleiben pro Platz.
  Gleichzeitige Änderungen an zwei Plätzen werden erkannt und nicht stillschweigend überschrieben.
- **Updates:** Echobefund fragt höchstens einmal täglich bei der GitHub-API nach der neuesten Version
  (keine Patientendaten; abschaltbar). Installiert wird nichts automatisch – es erscheint nur ein Hinweis.
- **DICOM-SR:** Importierte Dateien werden nur gelesen, nicht gespeichert. Weichen Name, ID oder Geburtsdatum
  in der Datei vom geöffneten Patienten ab, muss die Übernahme ausdrücklich bestätigt werden.
  Die Zuordnungsvorschläge beruhen auf den englischen DICOM-Bezeichnungen und sind mit echten Gerätedateien
  zu prüfen.

## Tastenkürzel

- `⌘/Strg + Enter`: Befund erstellen und kopieren
- `⌘/Strg + S`: Befund speichern
