"""Collect the public PLZ aggregates used by Schädlingsradar's own map."""

import asyncio
import hashlib
import json
from datetime import UTC, datetime

from publications import publish

DATASET = "civic/schaedlingsradar"
BASE_URL = "https://www.schaedlingsradar.de/agg/plz/"
PERIODS = ("d7", "d30", "d90", "d365", "dalle")
SPECIES = (
    "ratten",
    "maeuse",
    "wespen",
    "hornissen",
    "asiatische-hornisse",
    "schaben",
    "bettwanzen",
    "tauben",
    "ameisen",
    "marder",
    "eichenprozessionsspinner",
    "tigermuecke",
)

# Representative municipal coordinates let the existing map show area-level
# counts. They are explicitly not report locations or PLZ boundary centroids.
RIED_POSTCODES = (
    {"postcode": "68623", "name": "Lampertheim", "coordinates": [8.472, 49.597]},
    {"postcode": "68642", "name": "Bürstadt", "coordinates": [8.452, 49.643]},
    {"postcode": "68647", "name": "Biblis", "coordinates": [8.458, 49.691]},
    {"postcode": "68649", "name": "Groß-Rohrheim", "coordinates": [8.483, 49.719]},
    {"postcode": "64653", "name": "Lorsch", "coordinates": [8.569, 49.653]},
    {"postcode": "64683", "name": "Einhausen", "coordinates": [8.548, 49.676]},
    {"postcode": "64625", "name": "Bensheim", "coordinates": [8.617, 49.680]},
    {"postcode": "64646", "name": "Heppenheim", "coordinates": [8.647, 49.641]},
    {"postcode": "64560", "name": "Riedstadt", "coordinates": [8.47, 49.84]},
    {"postcode": "64579", "name": "Gernsheim", "coordinates": [8.49, 49.75]},
    {"postcode": "64584", "name": "Biebesheim am Rhein", "coordinates": [8.47, 49.78]},
    {"postcode": "64589", "name": "Stockstadt am Rhein", "coordinates": [8.47, 49.81]},
)


def parse_aggregate(payload, postal_code):
    """Keep only validated public count fields; discard daily arrays and other data."""
    if not isinstance(payload, dict) or payload.get("demo") is not False:
        raise ValueError("Expected a live Schädlingsradar PLZ aggregate")
    try:
        generated = datetime.fromisoformat(payload["generated"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid Schädlingsradar source timestamp") from exc
    if generated.tzinfo is None:
        raise ValueError("Schädlingsradar timestamp must include a timezone")
    source_name = payload.get("name")
    if not isinstance(source_name, str) or not source_name.startswith(postal_code):
        raise ValueError("PLZ aggregate does not match the requested postal code")
    raw_species = payload.get("arten")
    if not isinstance(raw_species, dict):
        raise TypeError("Invalid Schädlingsradar species aggregate")

    reports = {}
    for species, values in raw_species.items():
        if species not in SPECIES or not isinstance(values, dict):
            continue
        counts = {}
        for period in PERIODS:
            value = values.get(period, 0)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1_000_000:
                raise ValueError("Invalid Schädlingsradar count")
            counts[period] = value
        reports[species] = counts

    return {"generated": generated, "reports": reports}


async def import_schaedlingsradar(conn, client, source):
    """Fetch the same public per-PLZ JSON aggregates read by the provider's map."""
    semaphore = asyncio.Semaphore(3)

    async def fetch(postcode):
        async with semaphore:
            response = await client.get(f"{BASE_URL}{postcode['postcode']}.json")
            response.raise_for_status()
            return postcode, parse_aggregate(response.json(), postcode["postcode"])

    results = await asyncio.gather(*(fetch(postcode) for postcode in RIED_POSTCODES))
    generated = min(result[1]["generated"] for result in results)
    features = []
    for postcode, aggregate in results:
        features.append(
            {
                "type": "Feature",
                "id": postcode["postcode"],
                "geometry": {"type": "Point", "coordinates": postcode["coordinates"]},
                "properties": {
                    "postcode": postcode["postcode"],
                    "name": postcode["name"],
                    "reports": aggregate["reports"],
                    "url": f"https://www.schaedlingsradar.de/lage/{postcode['postcode']}/",
                },
            }
        )

    data = {
        "type": "FeatureCollection",
        "source": "Schädlingsradar",
        "attribution": "Meldungszahlen: Schädlingsradar · nach PLZ aggregiert",
        "generated": generated.isoformat(),
        "features": features,
    }
    now = datetime.now(UTC)
    safe_payload = json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")
    digest = hashlib.sha256(safe_payload).hexdigest()
    async with conn.transaction():
        await conn.execute(
            """INSERT INTO collected_payloads(sha256,body,content_type)
            VALUES (%s,%s,'application/geo+json') ON CONFLICT DO NOTHING""",
            (digest, safe_payload),
        )
        await conn.execute(
            """INSERT INTO collection_attempts
            (source_id,http_status,payload_sha256,status,error,error_stage,item_count,item_count_unit)
            VALUES (%s,200,%s,'success',NULL,NULL,%s,'postcode aggregates')""",
            (source["id"], digest, len(features)),
        )
        await publish(conn, source, DATASET, data, digest, generated, now)
    return "success"
