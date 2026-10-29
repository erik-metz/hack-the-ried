# Pi-Host: Connect-Zugang und Härtung

Stand: 29.10.2026. Zielprofil: dedizierter Gateway-Pi mit Ethernet/PoE,
Raspberry Pi Connect als einzigem vorgesehenen Fernzugang, ohne SSH-Freigabe.
Dieses Profil ist für unseren Debian-13-/Raspberry-Pi-OS-Aufbau bestimmt.

## Bestandsaufnahme vor der Änderung

Die Live-Prüfung zeigte SSH auf Port 22 für IPv4 und IPv6, erlaubte
SSH-Passwortanmeldung sowie aktive Avahi- und Bluetooth-Dienste. Eine eigene
Host-INPUT-Firewall war nicht vorhanden. Docker verwaltete NAT-/Filtertabellen.
Connect war angemeldet, als User-Service aktiviert und `Linger=yes` bereits
gesetzt. Die Standardroute führte über Ethernet. Ein weiterer TCP-Dienst war
nur an Loopback gebunden; eine Docker-TCP-API wurde nicht beobachtet.

## Zielkonfiguration

- Eigene nftables-Tabelle `inet kamue_gateway_host`: INPUT standardmäßig DROP
  für IPv4 und IPv6; Loopback und Antworten auf ausgehende Verbindungen erlaubt.
  ICMP/ICMPv6 einschließlich IPv6-Nachbarschaftserkennung und Pfad-MTU bleiben
  erlaubt, ebenso DHCP-Antworten. Der Pi bleibt gegebenenfalls anpingbar.
- Keine OUTPUT-Beschränkung. Dadurch bleiben DNS, Zeitsynchronisation, TTN-LNS,
  Registry-/APT-Zugriffe und die dynamischen Connect-/WebRTC-Verbindungen möglich.
- SSH-Service und -Socket, Avahi-Service und -Socket sowie Bluetooth werden,
  soweit installiert, gestoppt, deaktiviert und maskiert. Auch für eine spätere
  bewusste SSH-Aktivierung sind Passwort- und Root-Login deaktiviert.
- Connect bleibt mit User-Lingering aktiv; keine Desktop-Autoanmeldung nötig.
- Tägliche automatische Debian-Sicherheitsupdates und Aktualisierungen aus dem
  signierten Raspberry-Pi-Herstellerarchiv für denselben Release-Codenamen.
  Das Pi-Archiv trennt diese Regel nicht weiter nach Sicherheitsupdates.
  Keine automatischen Neustarts und keine automatischen Release-Upgrades.
- Docker veröffentlicht weiterhin keine Ports. Seine NAT-/FORWARD-Regeln werden
  von der Host-Härtung weder gelöscht noch ersetzt. Eine zukünftige Veröffentlichung
  von Container-Ports wäre separat zu prüfen; INPUT allein schützt diese nicht.

Die Regeln blockieren unaufgeforderte neue eingehende Verbindungen. Connect kann
bei Bedarf über seine ausgehend aufgebauten Relay-Verbindungen arbeiten.
[Offizielle Connect-Netzwerkanforderungen](https://www.raspberrypi.com/documentation/services/connect.html)
und [Debian-Konfiguration für unattended-upgrades](https://sources.debian.org/src/unattended-upgrades/2.12/data/50unattended-upgrades.Debian/).

## Anwenden und gegen Aussperren absichern

Nur über eine funktionierende Connect-Sitzung und bei zugänglichem Testaufbau:

```bash
cd ~/hack-the-ried/gateway
sudo apt-get update
sudo apt-get install -y nftables unattended-upgrades
sudo bash scripts/install-host-hardening alpha
```

Der Installer kopiert Code und Regeln rootgeschützt nach
`/usr/local/lib/kamue-gateway/host/`. Der systemd-Firewalldienst verwendet diese
Kopie, nicht das vom normalen Benutzer veränderbare Repository. Der Zustand
unter `/var/lib/kamue-gateway-hardening/` enthält den vorherigen Status der
betroffenen Dienste und Sicherungen ausschließlich der verwalteten Konfigurationen.
Der LNS-Key und SSH-Hostschlüssel werden nicht in diese Sicherung kopiert.

Vor dem Eingriff aktiviert der Installer einen unabhängigen Rücknahme-Timer.
Ohne Bestätigung nach zehn Minuten stellt er die vorherige Konfiguration und
die zuvor aktiven Dienste wieder her. Der aktivierte Timer startet nach einem
Neustart erneut mit zehn Minuten; er benötigt weder Browser noch Internet.

Vor der Bestätigung eine **neue** Connect-Sitzung öffnen und Firewall,
Gateway-/LNS-Verbindung und Dienste prüfen. Auch den vollständigen Host-Neustart
innerhalb der Testphase durchführen. Nach einem Neustart kann `sudo` erneut
eine lokale Passworteingabe verlangen. Anschließend bestätigen:

```bash
sudo python3 -I /usr/local/lib/kamue-gateway/host/harden.py confirm
```

Das stoppt und deaktiviert den Rücknahme-Timer. Die Firewall bleibt bootfest.
Der Installer verweigert ein erneutes `apply` bei bereits vorhandenem Zustand,
damit eine erneute Ausführung die ursprüngliche Sicherung nicht überschreibt.

## Prüfen und bewusst zurücknehmen

```bash
sudo nft list table inet kamue_gateway_host
ss -lntup
systemctl is-enabled ssh.service avahi-daemon.service bluetooth.service
loginctl show-user alpha -p Linger
systemctl list-timers apt-daily.timer apt-daily-upgrade.timer
rpi-connect doctor
sudo unattended-upgrade --dry-run --debug
```

Wenn die Härtung bereits bestätigt wurde, kann ein Administrator den vorherigen
Zustand ausdrücklich wiederherstellen:

```bash
sudo python3 -I /usr/local/lib/kamue-gateway/host/harden.py restore
```

Dies kann den zuvor aktiven SSH-Zugang einschließlich seiner früheren
Authentifizierung wiederherstellen. Nach der Bestätigung gibt es keinen
automatischen zweiten Fernzugang. Bei Connect-/Kontoproblemen kann physischer
Zugang erforderlich werden.

## Verbleibende Vertrauensstellen

Connect-Konto und GitHub-Konto mit Zwei-Faktor-Authentifizierung schützen;
Wiederherstellungscodes außerhalb des Pi aufbewahren. Kontosicherheit und
Router-Portfreigaben sind separat zu prüfen. Firmware-/Kernel-Neustarts bleiben
geplante Wartung; Container-Updates ersetzen keine Host-Updates.
Watchtower hat über den Docker-Socket weitgehende Hostrechte. Nur kontrollierte
Images veröffentlichen und Schreibrechte für Workflow/Registry begrenzen.

Die tatsächlichen Ergebnisse der Anwendung und Neustartprüfung stehen im
[Betriebsnachweis](betriebsnachweis.md).
