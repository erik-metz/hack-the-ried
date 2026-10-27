# HackTheRied – Bill of Materials (BOM) v2

Stückliste, Sensorauswahl und Kostenrahmen für den Bau einer autonomen LoRaWAN-Multisensor-Station (Version v2) im Hessischen Ried (Bürstadt & Lampertheim).

---

## 📊 Komponenten- & Funktionsübersicht

> [!NOTE]
> **Kostenrahmen:** **ca. 100 € (+/-)** pro Station.
> Die Hardware-Preise unterliegen aktuellen Markt- und Bauteilschwankungen. Für unsere gemeinsamen Bau-Workshops im **Kulturzentrum KAMÜ** führen wir Sammelbestellungen (10–30 Bausätze) durch, wodurch Versandkosten und Staffelpreise deutlich günstiger ausfallen.

| Bauteil / Modul | Sensor-Art & Messgröße | Schnittstelle | Messprinzip / Funktion |
| :--- | :--- | :--- | :--- |
| **RAK3113** | **Microcontroller & LoRaWAN (All-in-One)** | SPI/UART intern, I²C, I²S, GPIO | Integriertes LoRaWAN-Systemmodul (ersetzt separaten ESP32 + Funkmodul). Extrem energieeffizient, vereinfacht den Aufbau drastisch. |
| **SHT41** | Temperatur & rel. Luftfeuchtigkeit | I²C (`0x44`) | Hochpräzise CMOSens-Technologie mit kapazitivem Feuchtesensor und Bandgap-Temperatursensor. |
| **SCD41** | Kohlendioxid ($CO_2$) | I²C (`0x62`) | Photoakustisches NDIR-Messprinzip: Miniaturisierte optische Absorptionsmessung. |
| **ICS-43434** | Digitales MEMS-Mikrofon | I²S | Akustische Lärm- & Frequenzanalyse (Klassifizierung von Fahrzeugen, Sprache, Starkregen). |
| **SPS30** | Feinstaub (PM1.0, PM2.5, PM4, PM10) | I²C (`0x69`) | Laser-Streulichtverfahren mit integriertem Selbstreinigungs-Lüfter gegen Verschmutzung. |
| **BME688** | Luftdruck, rel. Feuchte & VOC-Gas | I²C (`0x76` / `0x77`) | Piezoresistiver Barometer-Drucksensor + Metalloxid-Sensor (MOX) für Luftgüte und flüchtige organische Verbindungen. |
| **SGP41** | VOC- & Stickoxid-Index ($NO_x$) | I²C (`0x59`) | Multi-Pixel-Gassensor für Verbrennungsabgase, Rauch und Industrieemissionen. |
| **LTR390** | UV-Index & Umgebungslicht | I²C (`0x53`) | Optische Photodioden mit spektraler Filterung für UV-A und UV-B Strahlungsintensität. |
| **RG-11** | Niederschlag & Regenbeginn | GPIO / Puls | Optischer Infrarot-Regensensor (erkennt Tropfen durch Brechungsindex-Änderung an der Kuppel). |
| **INA226** | Strom- & Spannungsüberwachung | I²C (`0x40`) | High-Side Strommessung zur kontinuierlichen Diagnose von Leistungsaufnahme und Solareinspeisung. |
| **TX868-BLG-26** | LoRaWAN Stabantenne (868 MHz) | SMA | Abgestimmte EU868-Antenne für maximale Reichweiten zu TTN-Gateways im Ried. |
| **SMA F to IPEX/RF** | Antennen-Pigtail | Koax | Verbindungskabel vom RAK3113 zum Außengehäuse. |
| **USB-C Buchse & Kabel** | 5V Stromversorgung (10m Zuleitung) | USB-C | Robuste Außenstromversorgung (witterungsbeständiges Kabel für Balkon oder Garten). |

---

## 🛠️ Gehäuse & 3D-Druck (Stevenson Screen)

Die Sensoren werden in einem wetterfesten, weiß lackierten oder UV-beständigen 3D-Druck-Lamellengehäuse (Stevenson Screen) montiert:
* **Freie Luftzirkulation** für SHT41, BME688 und SGP41 ohne Stauwärme
* **Regen- und Sonnenschutz** gegen direkte Einstrahlung
* **Separate Kammer** für RAK3113 und INA226 Elektronik
* STL-Dateien liegen unter `hardware/sensor-node/v2/3d-prints/`.

---

## 📡 Funk & Anbindung (LoRaWAN / TTN)

* **Funkfrequenz:** EU868 Band (868.1 – 868.5 MHz)
* **Protokoll:** LoRaWAN 1.0.3 / 1.0.4 via **The Things Network (TTN)**
* **Reichweite:** Bis zu 5–15 km zu den umliegenden LoRa-Gateways im Ried (z. B. auf dem Kulturzentrum KAMÜ in Bürstadt)
* **Kosten:** 100 % kostenfrei im Betrieb – keine SIM-Karte, keine monatlichen Gebühren, kein WLAN-Passwort nötig.

---

**HackTheRied** – Eine Bürgerinitiative mit dem Kulturzentrum **KAMÜ** in Bürstadt.
Website: [hack-the-ried.de](https://hack-the-ried.de) • DIY-Portal: [/sensor-bauen](https://hack-the-ried.de/sensor-bauen)
