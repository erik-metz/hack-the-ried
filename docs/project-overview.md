# HackTheRied – Projektübersicht & Architektur

## Zweck und aktueller Umfang

**HackTheRied** ist eine von Bürgerinnen und Bürgern getragene Initiative,
die vom [Kulturzentrum KAMÜ](https://kamue.me) unterstützt wird. Das Projekt
stellt Umwelt-, Mobilitäts- und Regionaldaten für **Bürstadt**, **Lampertheim**
und das Hessische Ried bereit. Der Betrieb ist inzwischen nicht auf fünf eigene
Messstationen begrenzt: Das Portal verbindet eigene LoRaWAN-Sensoren mit
kommunalen und öffentlichen Datenquellen.

Am **21.10.2026** ergab eine Read-only-Abfrage der produktiven Datenbank 1.217
sichtbare Sensoren mit mindestens einem Eintrag in `sensor_latest`, 74
unterschiedliche Messgrößen und 2.857 Sensor-/Messgröße-/Einheit-Kombinationen
mit einem zuletzt gespeicherten Wert. Das ist eine Momentaufnahme, kein
Sollwert oder Freshness-Nachweis; Sensoren und Messgrößen ändern sich laufend.

Zu den integrierten Datenbereichen gehören unter anderem Temperatur,
Luftfeuchtigkeit, Niederschlag, Luftqualität und Feinstaub, UV und Licht,
Erschütterungen, Tankstellenpreise, Fahrradverfügbarkeit, Verkehr, Wetter,
Luftgütestationen, LoRaWAN-Gateways sowie Flug- und Schiffsbewegungen. Welche
Messgrößen tatsächlich vorliegen, hängt von Quelle, Sensor und Aktualität ab.

## Architektur und Betrieb

```text
Sensoren und externe Datenquellen
             │ LoRaWAN, APIs, Polling
             ▼
VPS 169.58.102.132: Docker Compose, FastAPI, TimescaleDB, Sammler
             │ HTTPS über Nginx / DuckDNS
             ├──────────────────────► Next.js-Frontend auf Vercel
             └──────────────────────► öffentliche Open-Data-API
```

- **Frontend (`www/hack-the-ried/`)**: Next.js 16, React 19 und Tailwind CSS 4;
  Karten, Messwerte, Datenportal und regionale Inhalte werden über Vercel
  bereitgestellt.
- **Backend (`www/vps/`)**: FastAPI und TimescaleDB laufen als Compose-Stack auf
  dem VPS. Nginx veröffentlicht HTTPS; Datenbank und interner API-Port sind
  nicht direkt öffentlich.
- **Datensammler (`www/vps/`)**: unabhängige Dienste übernehmen unter anderem
  TTN-Sensordaten, Wetter, Tankstellenpreise, Verkehr, Luftgüte und
  Bewegungsdaten. Die Compose-Datei beschreibt verfügbare Dienste; sie bedeutet
  nicht, dass jeder optionale Dienst auf dem VPS aktiviert ist.
- **Veröffentlichung**: GitHub Actions validiert Änderungen und baut bei
  passenden Pushes auf `main` Container für GHCR. Watchtower ist auf dem VPS im
  Monitor-only-Modus konfiguriert. Ein GHCR-Push aktualisiert den laufenden
  Stack daher nicht automatisch; VPS-Deployments müssen kontrolliert und in der
  dokumentierten Reihenfolge ausgeführt werden.
- **Hardware (`hardware/`)**: Firmware, Baupläne und Stücklisten der Sensoren.

Der produktive Server wird per SSH erreicht:

```bash
ssh -i ~/.ssh/id_ed25519 root@169.58.102.132
```

Betriebsdetails stehen in [`www/vps/README.md`](../www/vps/README.md) und der
[Deployment-Anleitung](../www/vps/DEPLOYMENT.md). Die API ist in
[`docs/api/open-data.md`](api/open-data.md) beschrieben.
