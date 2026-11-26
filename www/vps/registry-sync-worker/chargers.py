"""Official BNetzA charger inventory. The register does not provide live occupancy."""

import csv
import io
import re
from datetime import UTC, datetime
from html import unescape
from urllib.parse import urljoin, urlsplit

from layers import map_collection
from publications import acquire, publish


def decode_register(body):
    """BNetzA has published the register both as UTF-8 and as Windows-1252."""
    try:
        return body.decode("utf-8-sig")
    except UnicodeDecodeError:
        return body.decode("cp1252")


def parse_register(body, bbox):
    text = decode_register(body)
    date_match = re.search(r"Letzte Aktualisierung vom:\s*(\d{2}\.\d{2}\.\d{4})", text)
    if not date_match:
        raise ValueError("Charger register publication date missing")
    source_time = datetime.strptime(date_match[1], "%d.%m.%Y").replace(tzinfo=UTC)
    lines = text.splitlines()
    index = next(
        i for i, line in enumerate(lines) if line.startswith("Ladeeinrichtungs-ID;")
    )
    stations = []
    south, west, north, east = bbox
    for row in csv.DictReader(io.StringIO("\n".join(lines[index:])), delimiter=";"):
        if not row["Breitengrad"] or not row["Längengrad"]:
            continue
        lat = float(row["Breitengrad"].replace(",", "."))
        lon = float(row["Längengrad"].replace(",", "."))
        if not south <= lat <= north or not west <= lon <= east:
            continue
        power = float(row["Nennleistung Ladeeinrichtung [kW]"].replace(",", "."))
        stations.append(
            {
                "id": "bnetza-" + row["Ladeeinrichtungs-ID"],
                "bnetzaId": row["Ladeeinrichtungs-ID"],
                "name": row["Anzeigename (Karte)"] or row["Betreiber"],
                "operator": row["Betreiber"],
                "address": f"{row['Straße']} {row['Hausnummer']}",
                "municipality": row["Ort"],
                "district": row["Kreis/kreisfreie Stadt"],
                "lat": lat,
                "lng": lon,
                "totalPoints": int(row["Anzahl Ladepunkte"]),
                "maxPowerKw": power,
                "isFastCharger": row["Art der Ladeeinrichtung"]
                == "Schnellladeeinrichtung",
                "connectorTypes": sorted(
                    {
                        row.get(f"Steckertypen{i}")
                        for i in range(1, 7)
                        if row.get(f"Steckertypen{i}")
                    }
                ),
                "availablePoints": None,
                "occupiedPoints": None,
                "outOfServicePoints": None,
                "availabilityBasis": "unavailable",
                "inventoryStatus": row["Status"],
                "isPublic": True,
                "sourceUpdatedAt": source_time.isoformat(),
            }
        )
    return source_time, stations


async def import_chargers(conn, client, source):
    listing, _, _ = await acquire(conn, client, source)
    links = re.findall(r"href=[\"\']([^\"\']+\.csv[^\"\']*)", listing.text)
    urls = [
        urljoin(source["url"], unescape(link))
        for link in links
        if "Ladesaeulenregister" in link
    ]
    if len(urls) != 1 or urlsplit(urls[0]).hostname != "data.bundesnetzagentur.de":
        raise ValueError("Official charger CSV link changed")
    response, digest, attempt = await acquire(conn, client, source, urls[0])
    source_time, stations = parse_register(response.content, source["bbox"])
    async with conn.transaction():
        await publish(
            conn,
            source,
            "infrastructure/ev-charging",
            {"stations": stations, "availability": "not_provided_by_register"},
            digest,
            source_time,
        )
        await publish(
            conn,
            source,
            "map/layers/charging",
            map_collection(stations),
            digest,
            source_time,
        )
        await conn.execute(
            "UPDATE collection_attempts SET status='success' WHERE id=%s", (attempt,)
        )
    await conn.commit()
