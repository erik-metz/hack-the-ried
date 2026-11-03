"""Explicit migration/provisioning and scheduled telemetry rollup entry point."""

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path

import psycopg
from gateway_storage import maintain
from psycopg.rows import dict_row


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--provision")
    parser.add_argument("--name", default="LoRa Gateway Kämue")
    parser.add_argument("--token-file")
    parser.add_argument("--token-hash")
    parser.add_argument("--delete-expired", action="store_true")
    args = parser.parse_args()
    async with await psycopg.AsyncConnection.connect(
        host=os.getenv("DB_HOST", "timescaledb"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        row_factory=dict_row,
        autocommit=True,
    ) as conn:
        if args.install:
            async with conn.transaction():
                await conn.execute(
                    (
                        Path(__file__).parent
                        / "migrations/20261103_gateway_telemetry.sql"
                    ).read_text()
                )
        if args.provision:
            import re

            if not re.fullmatch("[a-z0-9][a-z0-9-]{0,63}", args.provision) or not (
                args.token_file or args.token_hash
            ):
                raise ValueError("Gateway ID and dedicated token file required")
            if args.token_hash:
                if not re.fullmatch("[a-f0-9]{64}", args.token_hash):
                    raise ValueError(
                        "Expected SHA256 hash of high-entropy gateway token"
                    )
                token_hash = args.token_hash
            else:
                token = Path(args.token_file).read_text().strip()
                if len(token) < 32:
                    raise ValueError("Use a random token of at least 32 characters")
                token_hash = hashlib.sha256(token.encode()).hexdigest()
            async with conn.transaction():
                entity = "gateway:" + args.provision
                await conn.execute(
                    "INSERT INTO entities(id,name,entity_type,is_hidden) VALUES(%s,%s,'gateway',TRUE) ON CONFLICT(id) DO NOTHING",
                    (entity, args.name),
                )
                await conn.execute(
                    """INSERT INTO gateway_devices(id,entity_id,name,token_hash) VALUES(%s,%s,%s,%s)
                    ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,name=excluded.name""",
                    (
                        args.provision,
                        entity,
                        args.name,
                        token_hash,
                    ),
                )
        async with conn.transaction():
            print(json.dumps(await maintain(conn, delete=args.delete_expired)))


if __name__ == "__main__":
    asyncio.run(main())
