"""Current result-set lookup after response hashes cease to define quantities."""


async def snapshot_predicate(conn):
    row=await (await conn.execute("SELECT to_regprocedure('current_snapshot_matches(bigint,timestamptz,text)') IS NOT NULL AS ready")).fetchone()
    ready=row['ready'] if isinstance(row,dict) else row[0]
    return 'current_snapshot_matches(d.id,r.observed_at,%s)' if ready else "d.dimensions->>'snapshot_sha256'=%s"
