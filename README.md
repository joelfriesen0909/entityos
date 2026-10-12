# EntityOS · Glow & Flow

Weiterentwicklung der hochgeladenen `Vc10.html`, mit der ursprünglichen Aufgaben-/Pflegeroutine, XP, Münzen, freischaltbaren Skins, sechs Casino-Spielen und dem Shop. Kein Frontend-Framework und keine externe Physikbibliothek; die bestehende DOM-/Canvas-App wurde in kleine JavaScript-Module aufgeteilt.

## Start

Node.js **24.5 oder neuer** ist erforderlich. Die Startbefehle aktivieren Nodes Unterstützung für die vom Cloud-System bereitgestellten HTTP-/HTTPS-Proxys, einschließlich der bestehenden TLS-Vertrauenskonfiguration.

```bash
npm ci --include=dev --ignore-scripts
npm start
```

Standard: Port 3000, Bind-Adresse `127.0.0.1`. `npm run dev` startet den Server mit automatischem Neustart bei Dateiänderungen. Die Oberfläche wird direkt aus `public/` ausgeliefert; kein Bundler ist nötig.

In dieser Cloud-Umgebung den vorhandenen Checkout unter `/workspace/entityos` verwenden. Die Aufgabe läuft bereits isoliert; ein zusätzlicher Git-Worktree ist nicht nötig.

## KI konfigurieren

Die App erzeugt keine simulierten KI-Antworten. Für Gespräche sind ein OpenAI-API-Schlüssel mit verfügbarem Kontingent und HTTPS-Zugriff auf `api.openai.com` erforderlich.

| Variable | Bedeutung |
| --- | --- |
| `AI_API_KEY` | OpenAI-Zugang, ausschließlich im Serverprozess |
| `AI_MODEL` | Modell mit Chat-Completions-Unterstützung; Standard `gpt-4.1-mini` |
| `HOST`, `PORT` | Standard `127.0.0.1`, `3000` |
| `APP_PASSWORD` | Optionaler gemeinsamer Zugangsschutz über HTTP Basic Auth |

In der Cloud den Schlüssel sicher in den Umgebungseinstellungen hinterlegen. Der gespeicherte Entwurf erklärt `AI_API_KEY`, dessen Ziel `api.openai.com` und `AI_MODEL`; er setzt keinen Schlüsselwert und schaltet die laufende Maschine nicht automatisch um. Nach dem Speichern der Einstellungen den Server neu starten und den echten KI-Zugang prüfen.

Lokal kann `.env.example` nach `.env` kopiert und dort konfiguriert werden. `.env` ist ignoriert, wird vom Server geladen und niemals als Web-Datei ausgeliefert. Keine Schlüssel in HTML, JavaScript im Browser, Git oder Chat eintragen. Für öffentliche Bereitstellung HTTPS und Zugangsschutz verwenden; ohne `APP_PASSWORD` ist der lokale Server ungeschützt. Der Server begrenzt KI-Anfragen pro IP auf 12 pro Minute und gleichzeitig auf vier, prüft Herkunft und Nutzlast und begrenzt Anfragedauer und Antwortlänge.

`GET /api/health` liefert `ok` und `aiConfigured`. Letzteres prüft nur das Vorhandensein eines Schlüssels, keine erfolgreiche Modellantwort. Ohne Schlüssel liefert `/api/chat` einen verständlichen HTTP-503-Fehler; alle übrigen Funktionen bleiben nutzbar.

## Bedienung und Verhalten

- **Charakter wählen:** Cyber sowie Nova, Milo, Ghost, Pixel und Onyx sind sofort verfügbar. Die alten Skins werden weiterhin über Level freigeschaltet. Das neue Ghost-Design verwendet intern `ghost-clean`, damit das alte Phantom erhalten bleibt.
- **Greifen:** Körper oder Hände mit Maus oder Touch ziehen. Pointer Capture, Zugschwelle, gedämpfte Feder, begrenzte Kraft und Reichweite verhindern Sprünge. Die Hände folgen dem Zeiger unabhängig, weich und außerhalb der Körperkontur.
- **Wut:** Zugintensität, Dauer und Strecke erhöhen das individuelle Wut-Level. In Ruhe sinkt es, auch für inaktive Charaktere. Gesicht, Arme und Körperhaltung reagieren; das aktuelle Level und die Persönlichkeit gehen in den serverseitigen KI-Kontext ein.
- **Reset:** Startet das aktuell geöffnete Spiel über dessen vorhandenen Einstieg neu, stoppt Plinko und Sprachausgabe und setzt Körperbewegung und temporäre Wut zurück. Aufgaben, XP, Münzen, Design und Gesprächsverlauf werden nicht gelöscht. Ein offener Plinko-Einsatz wird genau einmal zurückgegeben. Bei anderen aktiven Spielen erscheint eine Bestätigung, da deren ursprüngliche Abbruch-/Auszahlungsregeln gelten.
- **Plinko:** Der ausgewählte Charakter ist der fallende Spielkörper. Schwerkraft, Abprallimpulse, Luftdämpfung, Pins, Wände und untere Fachtrenner bestimmen den Weg. Nur die Abwurfbedingungen variieren; Auszahlung ergibt sich aus dem tatsächlichen Landefeld. Die Simulation läuft mit 240 festen Schritten pro Sekunde und begrenzt aufgeholte Zeit nach Pausen. Die bestehende Spielmechanik erlaubt eine bezahlte Runde gleichzeitig; der Physikkern unterstützt zusätzlich Körperkollisionen und bis zu zwölf Körper für Tests/Erweiterungen. Ein Durchlauf über 30 simulierte Sekunden wird mit Erstattung abgebrochen.
- **Eigener Charakter:** Name, Farben, Designform, Größe und proportionaler Bild-Sprite mit Skalierung/Position. PNG, JPG und WebP bis 3 MB/16 Megapixel; Bilder werden lokal auf maximal 512 Pixel verkleinert, neu kodiert und auf Speichergröße geprüft. Transparenz bleibt erhalten. Hände bleiben animiert; es gibt keine automatische Gesichtserkennung oder Skelettanimation beliebiger Bilder.
- **Sprache:** Mikrofon startet die Browser-Spracherkennung; erneut klicken beendet die Aufnahme. Erkannter Text wird an den eigenen Server gesendet. Antworten erscheinen im Chat und werden über Browser-TTS gesprochen. `Stopp`, eine neue Aufnahme oder eine neue Nachricht unterbrechen laufende Vorgänge; verspätete Antworten werden verworfen. Mute/Lautstärke verwenden die bestehenden Bedienelemente.

Die Browser-Spracherkennung erfordert einen unterstützenden Browser, meist Chrome/Edge, HTTPS oder localhost und Mikrofonberechtigung. Browser bzw. Betriebssystem können einen externen Spracherkennungsdienst verwenden. Text und der begrenzte Gesprächskontext werden an OpenAI übertragen. Eine manuelle Texteingabe steht immer zur Verfügung. Sprachausgabe und verfügbare Stimmen hängen vom Gerät ab.

## Speicherung

Die bisherigen Routinen und Fortschritte verwenden weiterhin `glowFlowDataV9`. Der Custom-Charakter inklusive Bild verwendet separat `entityos.custom.v1` in `localStorage`. Fehler beim Lesen/Speichern werden angezeigt; unlesbare alte Routinen werden nicht stillschweigend überschrieben. Daten bleiben browser- und originabhängig: Daten aus einer früher direkt geöffneten `file://`-HTML-Datei sind auf einer neuen Server-Origin nicht automatisch zugänglich. Es gibt keinen Cloud-Sync oder Login-Datenspeicher.

Gespräche behalten pro Charakter bis zu elf abgeschlossene Frage-/Antwortpaare im Kontext. Sie bleiben während der aktuellen Seite beim Charakterwechsel erhalten; nach einem Neuladen sind sie leer. Chattexte werden nicht im Browser dauerhaft gespeichert. Custom-Bilder werden nicht zur KI hochgeladen.

## Tests und Build

```bash
npm test
npm run test:browser
npm run build
```

Der Browser-Test benötigt Chromium. Im vorbereiteten Cloud-Snapshot liegt es unter `/usr/bin/chromium`. Andere Installationen können `CHROMIUM_PATH` setzen; alternativ mit `npx playwright install chromium` einen passenden Browser installieren und dessen Pfad angeben. Browser-Tests starten einen eigenen Server auf Port 3100 ohne KI-Zugangsdaten.

- Unit-/Integrationstests: Kontakte, Impulse, 200 Abwürfe, Frame-Unabhängigkeit, zentraler Abwurf, mehrere Körper, Greifen, Wut, Reset, Bildkonfiguration, Speicherfehler, API-Validierung, Herkunftsschutz und Sprachzustände.
- Browser-Tests: bestehende Listen/XP/Münzen, Textsicherheit, fünf Designs, Greifen/Wut/Reset, Touch-Abbruch, echte Canvas-Plinko-Runde, bestehende Casino-Spiele und Shop, Bild-Upload und Reload, Dateigrenzen, Fehlerbehandlung, Kontext und Unterbrechung sowie Desktop/Tablet/Mobilansichten.
- KI- und Audiotests verwenden ausdrücklich Testtransporte/Testgeräte. Sie belegen Integrationslogik, keine reale Modellqualität oder Mikrofon-/Lautsprecherfunktion. Ohne externen Schlüssel können echte KI-Gespräche hier nicht geprüft werden.

`npm run build` prüft JavaScript und HTML-Asset-Verweise und erzeugt das vollständige Web-Artefakt `dist/`. Für dessen Betrieb:

```bash
node --use-env-proxy server.js --production
```

## Dateien

| Pfad | Zuständigkeit |
| --- | --- |
| `public/index.html` | Bestehende Oberfläche mit Charakter-, Voice- und Editor-Bedienelementen |
| `public/legacy.js`, `public/legacy.css` | Übernommene Routinen, Fortschritt, Spiele, Skins, Shop; gezielte Integrations-/Abbruchkorrekturen |
| `public/app.css`, `public/fonts.css`, `public/fonts/` | Erweiterungen, responsive Darstellung, lokal ausgelieferte Schriftarten mit OFL-Lizenzen |
| `public/js/physics.js` | Plinko-Kollisionen, Federkörper und Wutberechnung |
| `public/js/interaction.js` | Pointer-/Touch-Greifen, Hände und Körperanimation |
| `public/js/characters.js` | Designs, Persönlichkeiten, Bilder und persistente Custom-Konfiguration |
| `public/js/voice.js` | Spracheingabe, Kontext, KI-Transport, Unterbrechung, Sprachausgabe |
| `public/js/app.js` | Verknüpfung mit bestehendem Zustand, Auswahl, Editor, Reset, Plinko-Runden |
| `server.js` | Statische Dateien, sichere KI-Anbindung, Konfiguration und Zugangsschutz |
| `tests/`, `playwright.config.js` | Unit-, Integrations- und Browser-Tests |
| `scripts/build.js` | Syntax-/Asset-Prüfung und Build |
| `package.json`, `package-lock.json`, `.env.example`, `.gitignore` | Wiederholbarer Start, Testwerkzeuge und Konfiguration |

Schriften: Exo 2 und Rajdhani aus den Fontsource-Paketen Version 5.3.0, lokal eingebunden unter SIL Open Font License. Schrift-Downloads bei App-Nutzung sind nicht nötig.
