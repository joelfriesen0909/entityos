# Validierung der aktuellen Cloud-Instanz

Ausgeführt am 12. Oktober 2026.

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | 24 Tests bestanden, keine Fehler oder übersprungenen Tests |
| `npm run test:browser` | 17 Chromium-Browser-Tests bestanden, keine Fehler oder übersprungenen Tests |
| `npm run build` | Erfolgreich; JavaScript-/Asset-Prüfung und vollständiges `dist/` |
| Gespeichertes Installationsskript erneut ausgeführt | `npm ci`, Build und alle 24 Unit-/Integrationstests erfolgreich |
| Gespeicherter Entwicklungsstart | Health, HTML, JS-Module und lokale Schriftdateien per HTTP geprüft |
| Produktionsartefakt auf separatem Port | Health, HTML, JS-Module, lokale Schriftdateien und Charakterwechsel im Browser erfolgreich |
| Darstellung | Desktop 1440×1000, kompakter Desktop 1280×720, Tablet 768×1024, Mobil 390×844; Browser-Prüfungen ohne JavaScript-Ausnahmen oder Seitenüberlauf |

Der Physiktest prüft 200 verschiedene Abwürfe auf Pin-Durchdringung, endliche Geschwindigkeit/Position, Spielfeldgrenzen und gültige Landung. Der Browser-Test führt eine echte Canvas-Plinko-Runde und Reset/Erstattung aus. Touch ist über Chromiums Touch-Eingabe geprüft. Die Tests prüfen bestehende Aufgaben, Pflegeroutine, Fortschritt, alle sechs Spiele, freigeschaltete Skins und den Shop repräsentativ, aber nicht jede mögliche Kombination von Shop-Effekten.

Die KI- und Audiotests verwenden ausdrücklich Testtransporte/Testgeräte. Echte OpenAI-Modellantworten, reale Mikrofonaufnahme, Stimme und Audioqualität sind **nicht** validiert: `AI_API_KEY` ist nicht gesetzt, und die aktuelle Proxy-Verbindung zu `api.openai.com` liefert HTTP 403. Keine simulierten Antworten werden in der App als echte KI ausgegeben.

Gespeicherter Konfigurationsentwurf: `install_script`, `start_skill`, `AI_MODEL`, Anforderung `AI_API_KEY` und Ziel-/Netzwerkdomain `api.openai.com`. Das Speichern hat keine Laufzeitänderung oder Veröffentlichung ausgelöst. Die Konfiguration muss in den Umgebungseinstellungen geprüft/gespeichert und die Umgebung anschließend veröffentlicht werden. Eine Wiederherstellung in einer neuen Aufgabe ist hier noch nicht geprüft.
