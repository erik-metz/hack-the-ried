# HackTheRied – Sensorknoten und Stückliste

Dieser Überblick folgt dem aktuellen RAK3112-Aufbau und der Firmware v15. Die
Firmwareversion und ihr TTN-Decoder sind unter
[`hardware/sensor-node/rak3112/`](../rak3112/README.md) dokumentiert. Die
Messwerte unten beschreiben die Firmware-Ausgaben; ob ein optionales Modul in
einem konkreten Gerät vorhanden und angeschlossen ist, muss separat geprüft
werden.

## Bauteile und übertragene Messwerte

| Bauteil | Messwerte / Funktion | Hinweise |
| --- | --- | --- |
| RAK3112 auf RAK3212 | Steuerung und LoRaWAN-Funk | ESP32-S3 und SX1262; I²C-SDA GPIO14, SCL GPIO13 |
| EU868-LoRa-Antenne | Funkverbindung im EU868-Band | Reichweite hängt von Antenne, Montage, Gelände und Gateway ab |
| SHT41 | Temperatur (°C) und relative Luftfeuchtigkeit (%) | Firmware v15 nutzt ausschließlich diese Quelle für die übertragenen Klimawerte |
| SCD41 | CO₂ (ppm) | Temperatur- und Feuchtewerte werden nicht übertragen |
| SPS30 | PM1.0, PM2.5, PM4, PM10, Partikelanzahl und typische Partikelgröße | Partikelstatistik wird als Mittelwert übertragen |
| LTR390 | UV-Index und Umgebungslicht (Lux) | Rohkanäle sind zusätzliche Diagnosewerte |
| BME688 | Luftdruck und Gaswiderstand | Temperatur und Feuchte bleiben lokal; keine validierten IAQ- oder CO₂-Äquivalentwerte |
| SGP41 | VOC-Index und NOx-Index | Indexwerte, keine Stoffkonzentrationen |
| ICS-43434 | Digitaler Schallpegel (dBFS) | Kein kalibrierter dB(A)-Messwert; lokale Ereignisklassifikation ist experimentell |
| INA226 (optional) | Busspannung, Shuntspannung, Strom und Leistung | Aussagekräftige Werte erfordern korrekte Identifikation, Kalibrierung und Verdrahtung im Versorgungspfad |

## Aufbau und Firmware

Der Sensorknoten und das Gateway sind getrennte Geräte. Das Gateway nutzt einen
RAK2287-LoRa-Konzentrator; seine Implementierung und Betriebsanleitung liegen
unter [`hardware/gateway/`](../../gateway/README.md).

Das Gehäuse und die Halterungen werden noch entwickelt. Der SPS30 benötigt
einen geeigneten Luftweg; Temperatur- und Gassensoren brauchen eine Montage,
die ihre Messung nicht durch Wärmestau verfälscht. Der 3D-Drucker auf den
Werkstattfotos dokumentiert die Vorbereitung, kein bereits fertiges
wetterfestes Gehäuse.

Die Firmware-Dokumentation enthält Pinbelegung, Protokoll und Messwertdetails:

- [RAK3112 Gesamtübersicht](../rak3112/README.md)
- [Firmware v15](../rak3112/v15/README.md)
- [Firmware v13: Messwertcodes und Einheiten](../rak3112/v13/README.md)
- [Firmware v14: optionale INA226](../rak3112/v14/README.md)

## Werkstatt und offene Punkte

Die Fotos auf der [Mitmach-Seite](https://hack-the-ried.de/sensor-bauen)
zeigen den dokumentierten Zwischenstand. Preis, Gehäusematerial,
Außenversorgung und endgültige Montage werden erst festgeschrieben, wenn sie
für den konkreten Aufbau bestätigt sind.
