# HackTheRied – öffentliche API

Die HackTheRied API stellt öffentliche Sensor-, Umwelt-, Mobilitäts- und
Regionaldaten bereit. Öffentliche `GET`-Routen benötigen keinen API-Key. Für
Schreibzugriffe gelten je nach Route getrennte Zugangsschlüssel. Datenquellen
haben unterschiedliche Aktualisierungsintervalle und Lizenzbedingungen;
beachte die Quellenangaben der jeweiligen Datensätze. Die API aktiviert CORS
für öffentliche Browserzugriffe.

## Basis-URL und aktuelle Referenz

```text
https://api.hack-the-ried.de/api/v1
```

Die produktive, automatisch erzeugte OpenAPI-Beschreibung ist unter
[`/api/v1/openapi.json`](https://api.hack-the-ried.de/api/v1/openapi.json)
verfügbar; Swagger UI unter
[`/docs`](https://api.hack-the-ried.de/docs). Sie ist für vollständige
Parameter, Antwortmodelle und die aktuelle Routenliste maßgeblich. Diese Datei
fasst die wichtigsten öffentlichen Abfragen zusammen und ist keine vollständige
Kopie des OpenAPI-Schemas.

Zeitstempel werden als ISO-8601 ausgegeben. Zeitangaben ohne Zeitzone werden bei
der Aggregatabfrage als UTC interpretiert.

## Sensorinventar und Messwerte

### Sensoren

```http
GET /api/v1/sensors
GET /api/v1/sensors/{id}
```

Liefert öffentliche Sensor-Metadaten: `id`, `friendly_name`, Koordinaten,
Beschreibung sowie Erstellungs- und Änderungszeit. Verborgene Sensoren werden
bei öffentlichen Abfragen ausgeschlossen.

### Letzter Messwert eines Sensors

```http
GET /api/v1/telemetry/latest?sensor_id=ttn-rak3112-002
GET /api/v1/telemetry/latest?sensor_id=ttn-rak3112-002&metric=temperature
```

Ohne `metric` kommt der neueste einzelne Messpunkt für den Sensor zurück. Mit
`metric` wird auf eine Messgröße eingeschränkt. Die Antwort enthält
`sensor_id`, `metric`, `timestamp`, `value` und `unit`.

### Letzter Wert jeder Messgröße

```http
GET /api/v1/telemetry/latest/metrics?sensor_id=ttn-rak3112-002
```

Liefert den zuletzt gespeicherten Wert pro Messgröße und Einheit des Sensors.
Diese Route eignet sich für eine Übersicht mit mehreren Messwerten.

### Historische Rohwerte

```http
GET /api/v1/telemetry/raw?sensor_id=ttn-rak3112-002&start_time=2026-10-20T00:00:00Z&metric=temperature
```

Erforderlich sind `sensor_id` und `start_time`. `end_time` ist optional und
fällt standardmäßig auf den aktuellen Zeitpunkt; `metric` kann zum Filtern
angegeben werden. `limit` ist standardmäßig 100 und auf 5.000 begrenzt. Die
Antwort ist nach Zeit absteigend sortiert.

### Aggregierte Zeitreihe

```http
GET /api/v1/telemetry/aggregates?sensor_id=ttn-rak3112-002&metric=temperature&interval=1%20hour&start_time=2026-10-20T00:00:00Z
```

Unterstützte Intervalle: `1 minute`, `5 minutes`, `10 minutes`, `15 minutes`,
`30 minutes`, `1 hour`, `2 hours`, `3 hours`, `6 hours`, `12 hours`, `1 day`,
`7 days`, `1 week`, `30 days` und `1 month`. Der Zeitraum ist auf 31 Tage und
2.000 Zeit-Buckets beschränkt. Insgesamt werden höchstens 5.000 Ergebniszeilen
zurückgegeben; bei zu vielen Zeilen ist ein Messgrößenfilter oder ein gröberes
Intervall nötig. Jede Zeile enthält Bucket-Zeit, Minimum, Maximum, Mittelwert,
Stichprobenzahl, Messgröße und Einheit.

### Karte und Messfenster

```http
GET /api/v1/map/sensors
GET /api/v1/telemetry/latest/window?sensor_id=ttn-rak3112-002
```

`/map/sensors` liefert ein begrenztes Inventar öffentlicher Standorte samt
aktuellen Messwerten in einer Antwort. ETags und Cache-Header unterstützen
effiziente Aktualisierungen. Die Messfenster-Route stellt – sofern vorhanden –
die lokalen Fensterstatistiken eines TTN-Sensors bereit.

## Weitere öffentliche Datenbereiche

Die folgenden Routen sind nach Bereichen im produktiven OpenAPI-Schema
aufgeführt. Einzelne Antworten, Filter und Lizenzhinweise sind dort spezifiziert.

| Bereich | Beispielrouten |
| --- | --- |
| Datenquellen und Sammlerstatus | `GET /api/v1/collection/status`, `GET /api/v1/collected/{dataset}` |
| Umwelt und Wetter | `GET /api/v1/environment/measurements`, `GET /api/v1/environment/measurements/soil` |
| Tankstellenpreise und Mobilität | `GET /api/v1/fuel`, `GET /api/v1/bikes`, `GET /api/v1/traffic/incidents`, `GET /api/v1/transport/stops/{stop_id}/departures` |
| Archive und Downloads | `GET /api/v1/archives`, `GET /api/v1/downloads` |
| Satelliten | `GET /api/v1/satellite/scenes`, `GET /api/v1/satellite/latest`, `GET /api/v1/satellites/latest` |
| Regionale Inhalte | Veranstaltungen, Abfallkalender, Infrastruktur, Wirtschaft, Bevölkerungsdaten und weitere unter `/api/v1` |

## Beispielaufrufe

```bash
curl --fail-with-body \
  'https://api.hack-the-ried.de/api/v1/sensors'

curl --fail-with-body \
  'https://api.hack-the-ried.de/api/v1/telemetry/latest/metrics?sensor_id=ttn-rak3112-002'
```

```python
import requests

base = "https://api.hack-the-ried.de/api/v1"
response = requests.get(
    f"{base}/telemetry/latest/metrics",
    params={"sensor_id": "ttn-rak3112-002"},
    timeout=15,
)
response.raise_for_status()
for reading in response.json():
    print(reading["metric"], reading["value"], reading["unit"])
```

Die API ist außerdem über das [Datenportal](https://hack-the-ried.de/daten)
und das [Dashboard](https://hack-the-ried.de/) erreichbar.
