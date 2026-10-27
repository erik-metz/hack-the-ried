# Quellenbereinigung – Schritt 5: Blitzortung-Zugang

Stand: 8. Oktober 2026. Zugang erneut direkt aus dem laufenden Umweltcollector
auf dem VPS geprüft. **Prüfung abgeschlossen; Import weiterhin blockiert.**

## Belegte Ursache

Konfiguriert ist der geschützte Endpunkt:

`https://data.blitzortung.org/Data/Protected/last_strikes.php`

Der direkte Abruf antwortet mit **HTTP 401** und dem Header
`WWW-Authenticate: Basic realm="data.Blitzortung.org"`. Im laufenden Collector
sind weder Benutzername/Passwort in der Quellen-URL noch eigene
Blitzortung-Umgebungsvariablen vorhanden. Es werden keine konfigurierten
Zugangsdaten an diesen Endpunkt übermittelt. Auch in `/root/.env` wurden
keine Blitzortung- oder Lightning-Einstellungen gefunden; dabei wurden nur
Schlüsselnamen und das Vorhandensein von Werten geprüft, keine Geheimnisse
ausgegeben.

Die [öffentliche Quellenstatus-API](https://api.hack-the-ried.de/api/v1/collection/status)
meldet entsprechend:

- Quelle `environment-blitzortung`, aktiviert;
- Status `failed`, HTTP 401, Fehlerphase `acquisition`;
- unbekannte Datenmenge, kein bestätigter Verarbeitungsabschluss;
- jüngster beim Abgleich sichtbarer Versuch: 08.10.2026, 07:53 Uhr Europe/Berlin.

Damit ist der Abruffehler real. Der Nachweis belegt fehlende Authentifizierung
in der laufenden Konfiguration, keinen allgemeinen Ausfall des Anbieters und
auch nicht, dass bereits vorhandene Zugangsdaten abgelaufen wären.

## Vorgesehener Zugang

Die [offizielle Blitzortung-Dokumentation](https://www.blitzortung.org/en/compendium.php)
beschreibt Rohdatenzugriff für Teilnehmer. Der konfigurierte Bereich
`Protected` benötigt einen freigeschalteten Benutzernamen und ein Passwort;
`Restricted` ist für besonders freigeschaltete IP-Adressen vorgesehen.
Ein Wechsel des URL-Pfads ist deshalb kein belegter Ersatz für eine Freischaltung.

Ob ein Teilnehmerzugang für dieses Projekt bereits existiert, ist noch offen
und wurde beim Nutzer angefragt. Mit der derzeit wirksamen Konfiguration ist
kein erfolgreicher Import möglich.

## Fortsetzung nach Bereitstellung des Zugangs

1. Vorhandenen freigeschalteten Teilnehmerzugang bestätigen oder eine vom
   Anbieter ausdrücklich eingerichtete Alternative benennen.
2. Authentifizierung nur serverseitig einrichten und über die tatsächlich
   verwendeten Compose-Dateien an den Collector übergeben. Die aktuelle
   Standard-Compose-Datei reicht `BLITZORTUNG_URL` nicht ausdrücklich durch;
   ein Eintrag allein in `.env` genügt dafür nicht.
3. Einen erfolgreichen authentifizierten Abruf mit echten Quellendaten prüfen.
   Zugangsdaten nicht in Status-URLs, Fehlerausgaben oder Commits aufnehmen.
4. Parser und Mengenangaben gegen das reale Format prüfen, anschließend
   Archivierung, Speicherung und öffentliche Statusmeldung bestätigen.
   Bei Codeänderungen Tests, eigenen CI-Lauf und GHCR-Veröffentlichung prüfen.

Bei der Fortsetzung ist zusätzlich die Bedeutung der Rohdatenfelder zu
beachten: Laut Anbieter steht `mcg` für einen Winkel der Stationsabdeckung in
Grad. Der derzeitige Parser verwendet dieses Feld jedoch als Ersatz für
Spitzenstrom in kA. Das ist sachlich falsch und muss vor Freigabe einer
funktionierenden Blitzanbindung korrigiert werden. Auch das Abrufzeitfenster
und die tatsächlich vollständige regionale Abdeckung müssen belegt werden;
die letzten globalen Einträge erlauben keine pauschale Aussage „keine Blitze
im Ried“. Dieser Befund wurde dokumentiert, noch nicht produktiv geändert.

## Änderungen und Prüfungsumfang

Dieser Schritt ergänzt ausschließlich den Prüfbericht. Produktive Daten,
Collector-Konfiguration und Aktivierung bleiben unverändert. Der Fehler wird
nicht durch eine erfundene Nullmenge oder einen Erfolgsstatus verdeckt.
Es wurde kein Anbieter kontaktiert und kein anderer Zugangsweg ausprobiert.

Prüfungen: aktueller HTTP-Abruf aus dem Collector, ausschließlich Vorhandensein
von Authentifizierungseinstellungen, öffentliche Status-API und Abgleich mit
Anbieterdokumentation. Für reine Dokumentation ist weder Frontend CI noch
FastAPI & Docker CI/CD durch die vorhandenen Pfadfilter vorgesehen.
