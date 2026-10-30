"""Durable encrypted-frame journal. A send is explicitly NOT an LNS acceptance."""
import json
import sqlite3
import time
from pathlib import Path


class Spool:
    def __init__(self, directory, profile, max_bytes=268435456, max_age=259200,
                 max_rows=100000, clock=time.time):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.clock, self.profile = clock, profile
        self.max_bytes, self.max_age, self.max_rows = max_bytes, max_age, max_rows
        self.db = sqlite3.connect(self.directory / 'uplinks.sqlite3')
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA journal_size_limit=4194304')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS uplinks(
            id INTEGER PRIMARY KEY, received REAL NOT NULL, profile TEXT NOT NULL,
            boot TEXT NOT NULL, frame TEXT NOT NULL, size INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0, last_attempt REAL);
          CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
        ''')
        self.prune()

    def increment(self, key, count=1):
        self.db.execute('INSERT INTO counters VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value', (key,count))

    def prune(self):
        with self.db:
            old = self.db.execute('SELECT count(*) FROM uplinks WHERE received<?', (self.clock()-self.max_age,)).fetchone()[0]
            self.db.execute('DELETE FROM uplinks WHERE received<?', (self.clock()-self.max_age,))
            if old:
                self.increment('expired', old)
            rows, size = self.db.execute('SELECT count(*),coalesce(sum(size),0) FROM uplinks').fetchone()
            while rows > self.max_rows or size > self.max_bytes:
                row = self.db.execute('SELECT id,size FROM uplinks ORDER BY id LIMIT 1').fetchone()
                self.db.execute('DELETE FROM uplinks WHERE id=?', (row[0],))
                self.increment('overflow_dropped')
                rows, size = rows-1, size-row[1]

    def append(self, frame, boot):
        # Preserve exact LNS representation and original concentrator context.
        payload = json.dumps(frame, separators=(',', ':'))
        with self.db:
            cur = self.db.execute('INSERT INTO uplinks(received,profile,boot,frame,size) VALUES(?,?,?,?,?)',
                                  (self.clock(),self.profile,boot,payload,len(payload.encode())))
            row_id = cur.lastrowid
            self.increment('persisted')
        self.prune()
        return row_id

    def candidate(self, after=0):
        # Replay unknown sends at most three times, once per reconnect pass.
        return self.db.execute('SELECT id,received,boot,frame FROM uplinks WHERE id>? AND profile=? AND attempts<3 ORDER BY id LIMIT 1',
                               (after,self.profile)).fetchone()

    def attempted(self, row_id):
        with self.db:
            self.db.execute('UPDATE uplinks SET attempts=attempts+1,last_attempt=? WHERE id=?', (self.clock(),row_id))
            self.increment('send_attempted')

    def set(self, key, value):
        with self.db:
            self.db.execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key,json.dumps(value)))

    def get(self, key):
        row = self.db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def status(self):
        rows,size,oldest,pending,unknown = self.db.execute('SELECT count(*),coalesce(sum(size),0),min(received),coalesce(sum(attempts=0),0),coalesce(sum(attempts>0),0) FROM uplinks').fetchone()
        return dict(rows=rows, bytes=size, oldest=oldest, pending=pending,
                    acceptance_unknown=unknown, counters=dict(self.db.execute('SELECT key,value FROM counters')))

    def close(self):
        self.db.close()
