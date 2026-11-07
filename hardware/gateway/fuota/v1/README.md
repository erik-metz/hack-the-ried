# Private FUOTA lab v1

This is an isolated ChirpStack 4.20.0 server stack for the RAK3112 experiment.
Starting it does not stop or reconfigure the existing TTN Basics Station, does
not access SPI/GPIO, and does not automatically enable FUOTA transmissions.
This first increment provides the server and dummy firmware bring-up; the
shared radio transport and actual firmware installation are not yet enabled.

## Start on the Pi

```sh
cd hardware/gateway/fuota/v1
python3 prepare.py
sudo docker compose config --quiet
sudo docker compose up -d
sudo docker compose ps
```

Database and API secrets are generated locally once in the ignored `.env`.
Never display an expanded Compose configuration. PostgreSQL, Redis and MQTT
have no published host ports. UI/API binds only to `127.0.0.1:8085`; the
Basics Station receiver binds only to `127.0.0.1:3002`. Do not publish the
default ChirpStack admin login on a network. Administrative setup uses the
existing Connect shell. Volumes persist across `docker compose down`; do not
use `down -v` when preserving devices or sessions.

## Parallel TTN / ChirpStack

Two radio processes must never access the RAK2287 simultaneously. The current
Basics Station speaks to a single LNS. The lab receiver alone does not make it
dual-LNS capable. The intended shared-radio architecture is Concentratord
(one hardware owner) with separate forwarding paths to TTN and ChirpStack.
Before changing transport, verify the RAK2287 GPIO25 reset, gateway EUI,
EU868 channel plan, both downlink paths, duty-cycle enforcement and collision
reporting. Preserve the existing TTN image, `.env`, state directory and
Guardian configuration for rollback. TTN and FUOTA share a half-duplex radio;
continuous reception during FUOTA transmission cannot be guaranteed.

The current guardian expects Basics Station health; it must be deliberately
paused during a transport switch, with an independent timed rollback installed
first. Do not let Watchtower or the guardian race a hardware-owner change.

Use separate device credentials for the private network. Do not activate the
same DevEUI/root keys on both network servers. For LoRaWAN 1.1, use independent
AppKey and NwkKey; the separate GenAppKey field documented for FUOTA applies to
LoRaWAN 1.0.x. Persist nonces, sessions and multicast counters on the device.

## Check and stop

```sh
POSTGRES_PASSWORD=synthetic API_SECRET=synthetic docker compose config --quiet
python3 -m unittest discover -s hardware/gateway/fuota/v1 -p 'test_*.py'
```

Run the unittest command from the repository root. To stop only this server
stack, run `sudo docker compose down` from this directory. The original TTN
Compose project is separate and is not touched by that command.

References: [ChirpStack FUOTA](https://www.chirpstack.io/docs/chirpstack/features/fuota.html),
[FUOTA provisioning](https://www.chirpstack.io/docs/chirpstack/use/fuota.html),
[shared radio API](https://www.chirpstack.io/docs/chirpstack-concentratord/).
