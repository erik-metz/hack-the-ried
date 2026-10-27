# HackTheRied – Monorepo

[![Next.js](https://img.shields.io/badge/Frontend-Next.js_16-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com/)
[![TimescaleDB](https://img.shields.io/badge/Database-TimescaleDB-yellow)](https://www.timescale.com/)
[![LoRaWAN](https://img.shields.io/badge/IoT-LoRaWAN_/_TTN-blue)](https://www.thethingsnetwork.org/)

Digitales Umweltsensornetzwerk für **Bürstadt**, **Lampertheim** und das **Hessische Ried**. Dieses Repository enthält den gesamten Quellcode der Web-Applikation, die Backend-Infrastruktur, Firmware, Hardware-Baupläne und die Dokumentation des **HackTheRied** Projekts.

---

## 🚀 Schnellstart

### 1. Web Frontend (`/www/open-ried-sens`)

Das Web-Dashboard dient zur Visualisierung der Messwerte auf einer interaktiven Karte.

cd www/open-ried-sens
npm install
npm run dev

### 2. Backend Stack (`/www/vps`)

Das Backend und die Datensammler laufen als Docker-Compose-Stack auf dem VPS
`169.58.102.132`. Öffentlich erreichbar ist die API über die DuckDNS-Domain;
Nginx terminiert HTTPS und leitet Anfragen an FastAPI weiter. Die Datenbank ist
nicht direkt öffentlich freigegeben.

Für den laufenden Server ist der freigegebene SSH-Zugang vorgesehen:

```bash
ssh -i ~/.ssh/id_ed25519 root@169.58.102.132
```

Lokale Entwicklung des Stacks und die kontrollierte Veröffentlichung der
Container sind in [`www/vps/README.md`](www/vps/README.md) und
[`www/vps/DEPLOYMENT.md`](www/vps/DEPLOYMENT.md) beschrieben. GHCR-Veröffentlichung
und VPS-Aktualisierung sind getrennte Schritte; Watchtower läuft im
Monitor-only-Modus und ersetzt keine geordnete Bereitstellung.

---

## 📖 Dokumentation & Open Data API

- **Projektübersicht & Architektur**: Siehe [`docs/project-overview.md`](docs/project-overview.md).
- **Open Data API Schnittstelle**: Unter [`docs/api/open-data.md`](docs/api/) erfährst du, wie du auf die Rohdaten unseres VPS-Endpoints zugreifen kannst.
- **Hardware & Baupläne**: Detaillierte Bauanleitungen, Stücklisten (BOM) und CAD/STL-Dateien findest du unter [`hardware/`](hardware/).

---

## 🤝 Mitmachen & Community

Dieses Projekt wird ehrenamtlich betrieben und vom [Kulturzentrum KAMÜ](https://kamue.me) unterstützt. Beiträge zur Software, Hardware oder den Datenanalysen sind herzlich willkommen!

- **Lizenz**: Open-Source / Creative Commons (Hardware & Daten)
