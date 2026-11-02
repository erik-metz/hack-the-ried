"""Secure unresolvable legacy weather conflicts outside the measurement database.

Only keys with distinct values and no accepted native weather value qualify.
No value is guessed or overwritten. The exact binary original rows are backed
up and restored into a temporary table for multiset verification before removal.
"""

import argparse
import asyncio
import gzip
import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import psycopg

CANDIDATES="""SELECT s.timestamp,s.sensor_id,s.metric,s.unit FROM sensor_data s
 WHERE s.sensor_id='weather-dwd-ried' AND NOT EXISTS(
   SELECT 1 FROM measurement_definitions d JOIN readings r ON r.measurement_id=d.id
   WHERE d.entity_id='sensor:'||s.sensor_id AND d.metric=s.metric AND d.unit=s.unit
     AND d.source_id='environment-weather' AND d.basis='model' AND d.dimensions='{}'
     AND r.observed_at=s.timestamp AND r.quality='valid')
 GROUP BY s.timestamp,s.sensor_id,s.metric,s.unit HAVING count(DISTINCT s.value)>1"""
ORIGINALS="""SELECT s.* FROM sensor_data s JOIN ambiguous_weather_keys k
 USING(timestamp,sensor_id,metric,unit)"""


async def quarantine(conn,directory):
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(2026093001)")
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext('weather-legacy-repair'))")
        await conn.execute('LOCK TABLE sensor_data IN SHARE ROW EXCLUSIVE MODE')
        await conn.execute('CREATE TEMP TABLE ambiguous_weather_keys ON COMMIT DROP AS '+CANDIDATES)
        keys=await (await conn.execute('SELECT * FROM ambiguous_weather_keys ORDER BY timestamp,metric')).fetchall()
        if not keys:
            return {'quarantined_keys':0,'quarantined_rows':0}
        if len(keys)>100:
            raise ValueError('Unexpected conflict volume; review before quarantining')
        binary=bytearray()
        async with conn.cursor().copy('COPY ('+ORIGINALS+' ORDER BY s.timestamp,s.metric,s.value) TO STDOUT (FORMAT BINARY)') as stream:
            async for block in stream:
                binary.extend(block)
        directory=Path(directory)
        directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        filename=directory/('ambiguous-weather-'+datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')+'.copy.gz')
        compressed=gzip.compress(binary,mtime=0)
        with filename.open('xb') as output:
            os.chmod(filename,0o600)
            output.write(compressed);output.flush();os.fsync(output.fileno())
        restored=gzip.decompress(filename.read_bytes())
        if restored!=binary:
            raise ValueError('External conflict backup verification failed')
        await conn.execute('CREATE TEMP TABLE restored_weather(LIKE sensor_data) ON COMMIT DROP')
        async with conn.cursor().copy('COPY restored_weather FROM STDIN (FORMAT BINARY)') as stream:
            await stream.write(restored)
        different=(await (await conn.execute('SELECT EXISTS(('+ORIGINALS+' EXCEPT ALL SELECT * FROM restored_weather) UNION ALL (SELECT * FROM restored_weather EXCEPT ALL '+ORIGINALS+'))')).fetchone())[0]
        if different:
            raise ValueError('Restored conflict backup differs; originals retained')
        count=(await (await conn.execute('SELECT count(*) FROM restored_weather')).fetchone())[0]
        manifest={'reason':'Distinct legacy model values without reconstructable accepted native value',
                  'table':'sensor_data','columns':['timestamp','sensor_id','value','unit','metric'],
                  'format':'PostgreSQL COPY BINARY, gzip','rows':count,'keys':[[str(v) for v in key] for key in keys],
                  'sha256':hashlib.sha256(compressed).hexdigest(),
                  'restore':'Create an isolated table LIKE the original five-column sensor_data table; gzip -dc FILE | psql -c "COPY isolated_table FROM STDIN (FORMAT BINARY)"'}
        manifest_path=filename.with_suffix('.json')
        with manifest_path.open('x') as output:
            os.chmod(manifest_path,0o600)
            json.dump(manifest,output,indent=2);output.flush();os.fsync(output.fileno())
        await conn.execute('DELETE FROM sensor_latest s USING ambiguous_weather_keys k WHERE (s.timestamp,s.sensor_id,s.metric,s.unit)=(k.timestamp,k.sensor_id,k.metric,k.unit)')
        removed=await conn.execute('DELETE FROM sensor_data s USING ambiguous_weather_keys k WHERE (s.timestamp,s.sensor_id,s.metric,s.unit)=(k.timestamp,k.sensor_id,k.metric,k.unit)')
        if removed.rowcount!=count:
            raise ValueError('Conflict multiset changed; removal rolled back')
    return {'quarantined_keys':len(keys),'quarantined_rows':count,'backup':str(filename),'sha256':manifest['sha256']}


async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--directory',default='/quarantine')
    args=parser.parse_args()
    async with await psycopg.AsyncConnection.connect(host=os.environ['DB_HOST'],port=os.getenv('DB_PORT','5432'),
        dbname=os.environ['DB_NAME'],user=os.environ['DB_USER'],password=os.environ['DB_PASSWORD'],autocommit=True,
        application_name='legacy_weather_quarantine') as conn:
        await conn.execute("SET lock_timeout='10s'; SET statement_timeout='2min'; SET max_parallel_workers_per_gather=0")
        result=await quarantine(conn,args.directory) if args.apply else {'unresolved_keys':len(await (await conn.execute(CANDIDATES)).fetchall())}
        print(json.dumps(result),flush=True)


if __name__=='__main__':
    asyncio.run(main())
